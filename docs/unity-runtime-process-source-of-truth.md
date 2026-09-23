# Unity Runtime Process 真理源（Design × As-Built）

Date: 2026-04-10
Owner: GitNexus
Status: Active (source of truth)

## 1. 文档定位

本文用于统一以下两类信息：

1. 设计意图：
   - `docs/plans/2026-04-03-unity-runtime-process-rule-driven-design.md`（V2 规则驱动方案设计）
   - `docs/plans/2026-04-07-graph-only-runtime-retrieval-design.md`（query-time graph-only closure 设计）
   - `docs/unity-runtime-process-rule-driven-implementation.md`（V2 技术实现手册）
2. 实际实现（代码与测试）：
   - ingestion / process 生成链路
   - MCP `query/context` 检索链路
   - `runtime_chain_verify=on-demand` 强验证链路

当历史设计文档与当前代码行为冲突时，以"当前代码 + 本文"作为 Unity runtime process 的对外真理源。

## 2. As-Built 架构总览

### 2.1 Analyze 侧（图构建）

Pipeline 通过 `buildPhaseList` 注册显式依赖的 phase（`gitnexus/src/core/ingestion/pipeline.ts`）：

```text
scan → structure → parse → scopeResolution → … → communities
  → unity-resources → unity-lifecycle → processes → unity-processes → unity-process-subtype
```

1. `unity-resources`：依赖 `communities/scopeResolution/structure`。独立模块 `unity-resource-scan.ts` 扫描资源路径并按 scope 过滤，随后由 `processUnityResources` 写入 Unity 绑定与 prefab-source 边。
2. `unity-lifecycle`：依赖 `unity-resources/parse`。基类线索取同一 normalized AST 的 parse report，并与 Class 的文件/名称/行号对齐；不依赖外部引擎类型的虚拟继承节点。检测 `Assets/*.cs` 后加载目标仓 Unity 配置，调用 `applyUnityLifecycleSyntheticCalls`。
3. `processes`：注册时增加 `unity-lifecycle` 依赖，确保追踪前已注入合成 CALLS；上游 `process-processor.ts` 保持原实现。
4. `unity-process-subtype`：依赖 `processes/unity-lifecycle/unity-processes`，对所有项目（含非 Unity 项目）沿过程 trace 的 CALLS reason 回写 `processSubtype/runtimeChainConfidence/sourceReasons/sourceConfidences` 与步骤证据。流式图必须通过 `forEachRelationshipFields` 读取真实 reason；对象视图的 `streamed` 占位不能用于分类。`STEP_IN_PROCESS` 保留到 subtype 完成后统一落库。
5. Unity phases 与 derived phases 一同受 `skipGraphPhases/skipDerivedGraphPhases` 控制；deferred derived run 包含四个 Unity phases。
6. 增量写入：`Method:unity-runtime-root` 与 Community/Process 同属派生层。重算时先删除旧根及关联边，再从完整新图一并写入根和所有关联边；无文件变化而保留派生层时不删除、不重复插入。最后一个 lifecycle host 消失时清理旧根。
7. parity seed 在 `core/run-analyze.ts` 成功发布索引时写入 `unity-parity-seed.json`，供 MCP hydration 使用。
8. 资源关系补建的 File 节点保留资源身份和边；CSV 导出读取全文时同样遵守 `--max-file-size` / `GITNEXUS_MAX_FILE_SIZE` 上限（默认 512 KiB），超限资源的 `File.content` 留空。该限制不影响 Unity 资源扫描、绑定提取或 lifecycle 注入，避免大 prefab 绕过扫描预算并撑爆数据库 COPY。

### 2.1.0 有界 lifecycle process 补充

`unity-processes` 依赖 `processes/unity-lifecycle/communities`，在通用过程完成后补足 runtime-root 过程至最多 8 条（保留通用过程，不删已有结果）。只有真实 `Method:unity-runtime-root` 和 `unity-lifecycle-synthetic` 根边才启用。根首跳最多 32 分支，后续最多 4 分支，深度最多 10，最多 4096 个排队/访问状态；按 callback/terminal 去重，优先不同 callback，再按深度和稳定路径顺序选择。新增过程 ID 由路径 SHA-256 派生。

补充器与上游一致排除 confidence < 0.5 及 global-name-fallback 等启发式边，流式图读取真实字段列；新增 Process/STEP_IN_PROCESS 随通用派生层统一持久化、增量清理，subtype phase 统一标注 medium lifecycle 证据。日志报告 added/walks/branchesDropped/depthCapped/truncated。这是有界采样，不是完整调用路径枚举，也不是 verifier-core 的 verified_full。`process-processor.ts` 保持上游零 patch。

### 2.1.1 Scan-Context 承载器契约（As-Built + Design Direction）

1. As-Built（当前事实）：
   - `scan-context` 已承担 Unity 资源扫描阶段的核心索引输入（脚本 GUID 命中、资源路径集合、GUID 映射等）。
   - `scan-context` 在同次资源扫描中以流式方式产出 `PrefabInstance.m_SourcePrefab` 轻量线索（streaming delivery）。
   - `processUnityResources` 在 `unity-resources` 统一消费 `scanContext.streamPrefabSourceRefs(...)` 写入 `UNITY_ASSET_GUID_REF`，并统一执行 dedupe/diagnostics/reason payload。
   - `scan-context does not write graph edges`; 图谱写入职责仅在 `processUnityResources`。
2. Design Direction（重构方向，待实现）：
   - `scan-context` 持续作为可扩展的“资源字段识别承载器（resource signal carrier）”。
   - 后续资源字段识别需求（新增字段）优先通过扫描期识别器挂载扩展，避免新增孤立重型 pass。
3. 统一消费点契约：
   - scan-context 的识别结果由 `processUnityResources` 统一消费并写图（含 dedupe、diagnostics、reason payload）。
   - 组件级深解析仍由 resolver/绑定链路执行；scan-context 不承担完整语义求值职责。
   - 目标是固定“扫描产出记录 → `unity-resources` 统一消费”这一主干，避免后续功能扩展时出现平行管线漂移。

### 2.2 Query/Context 侧（检索与投影）

1. 直接 process membership：`STEP_IN_PROCESS`。
2. 类符号方法投影：
   - `HAS_METHOD -> STEP_IN_PROCESS` 合并：`local-backend.ts:1416-1449, 2393-2414`
   - 证据模式合并：`process-evidence.ts:60-104`
3. empty-process 行为（无 heuristic 注入）：
   - `query`: `processRows.length===0` 时，符号归入 `definitions`
   - `context`: `processRows.length===0` 时，`processes=[]`
   - 资源收敛线索通过 `resource_hints` / `next_hops` 提供，不再通过 process 注入
4. 扩展字段始终输出（不再需要 flag）：
   - `runtime_chain_confidence`、`runtime_chain_evidence_level`、`verification_hint`
   - `process-confidence.ts`；`local-backend.ts`

### 2.3 On-Demand 强验证（Graph-Only Closure）

1. 显式入口：
   - CLI: `--runtime-chain-verify off|on-demand`
   - MCP schema: `runtime_chain_verify`（`gitnexus/src/mcp/tools.ts`）
   - 请求参数为唯一控制开关，无全局 gate
2. 验证逻辑（`runtime-chain-verify.ts`）：
   - `verifyRuntimeClaimOnDemand`：直接走结构化锚点（`symbolName/resourceSeedPath/mappedSeedTargets/resourceBindings`）驱动的 graph-only closure
   - `queryText` 不再作为 verifier 匹配信号；仅用于默认 `next_action` 文案与弱 seed 提取兜底
   - query-time 不再加载 retrieval/verification 规则目录做匹配；规则仍用于 analyze-time synthetic edge 与离线治理产物
   - query-time runtime closure is graph-only and no longer performs rule-catalog matching.
   - 无文件系统 I/O、无 regex 启发式、无 token family 匹配门槛
3. 验证结果：
   - `runtime_claim.rule_id` 固定为 `graph-only.runtime-closure.v1`（兼容字段保留）
   - `status: 'verified_full'` 仅在四段闭环（Anchor/Bind/Bridge/Runtime）同时满足时成立
   - `status: 'failed'` 可伴随 `evidence_level: 'none' | 'clue' | 'verified_segment'`（精度优先降级）
   - `runtime_claim` 统一输出失败分类：`rule_not_matched | rule_matched_but_evidence_missing | rule_matched_but_verification_failed`


## 3. 设计与实现对照（阶段）

| 阶段 | 设计目标 | As-Built 结论 | 代码/证据 |
| --- | --- | --- | --- |
| Phase 0 | 基线与指标固化 | 已有报告产物 | `docs/reports/2026-03-31-phase0-*` |
| Phase 1 | Unity summary schema hygiene | 已落地 | `gitnexus/src/core/lbug/schema.ts`（`REL_TYPES` 定义处） |
| Phase 2 | class→method process 投影 | 已落地（query/context 双侧） | `local-backend.ts:1416-1449, 2393-2414` |
| Phase 3 | lifecycle + loader synthetic CALLS | **V2 重构**：lifecycle 始终启用 | `unity-lifecycle-synthetic-calls.ts` |
| Phase 4 | persisted lifecycle process artifact | 静态过程证据始终持久化；合成生命周期分类仅在 Unity 启用时产生 | `pipeline-phases/unity-process-subtype.ts` |
| Phase 5 | confidence + verification_hint 合约 | **V2 变更**：扩展字段始终输出 | `process-confidence.ts`；`local-backend.ts` |
| V1 Reload | on-demand verify + 验收闭环 | **V2 重构**：verifier 简化为图谱查询 | `runtime-chain-verify.ts` (934→297 行) |

## 4. 对外契约真理源

### 4.1 `query/context` 常驻字段（始终输出）

1. `processes[].evidence_mode`: `direct_step | method_projected`
2. `processes[].confidence`: `high | medium | low`
3. `process_symbols[].process_evidence_mode`
4. `process_symbols[].process_confidence`
5. `runtime_chain_confidence`（V2：始终输出，不再需要 flag）
6. `runtime_chain_evidence_level`: `none | clue | verified_segment | verified_chain`
7. `verification_hint`（low confidence 时应可行动）
8. `response_profile=slim` 语义分层：
   - `facts`：图谱事实与 process/candidate 主证据
   - `closure`：runtime claim/preview、缺口，以及图谱已证明的 Unity 资源桥接链路（`resource_chains`）
   - `clues`：资源线索（`resource_hints`）等收敛提示
   - `tier_envelope`：`facts_present/closure_present/clues_present/semantic_order_pass/summary_source`
   - strict-anchor 默认阅读顺序：`facts -> closure -> clues`
9. `resource_chains[]`：`query/context` 返回结构化资源链路。支持两种链路模式：
   - **两跳链**（via GUID ref）：`File -[UNITY_ASSET_GUID_REF]-> File -[UNITY_GRAPH_NODE_SCRIPT_REF]-> Symbol`。需要 `resource_path_prefix` 提供 seed path。
   - **单跳链**（direct script ref）：`File -[UNITY_GRAPH_NODE_SCRIPT_REF]-> Symbol`。支持通过 `resource_path_prefix` 查询，也支持从 `resourceBindings` 自动生成（当无 seed path 但有 bindings 时作为 fallback）。
   - 结构字段：`sourceResourcePath`、`relationType`（`UNITY_ASSET_GUID_REF` 或 `UNITY_GRAPH_NODE_SCRIPT_REF`）、`intermediateResourcePath`（两跳链必填，单跳链为 undefined）、`targetSymbol`。这是检索返回契约，不等同于把资源桥接写入 `Process`。

### 4.2 `runtime_chain` 输出条件

1. 请求显式传 `runtime_chain_verify=on-demand`（唯一开关）
2. `runtime_claim` 采用两层语义并统一输出（包括失败分类）：
   - `verifier-core`：二元核心结论（`verified_full` / `failed`）
   - `policy-adjusted`：`query/context` 侧对外结果；当 `hydration_policy=strict` 且 `hydrationMeta.fallbackToCompact=true` 时，允许降级为 `verified_partial` / `verified_segment`
3. 运行时失败分类保持不变：
   - 无结构化锚点 / 无有效 seed / 无法建立 graph-only 起点 → `reason=rule_not_matched`
   - 匹配但证据不足 → `reason=rule_matched_but_evidence_missing`
   - 匹配且验证失败 → `reason=rule_matched_but_verification_failed`
4. `runtime_claim` 对外返回以 closure 状态/证据级别/hops/gaps 为核心，不暴露 query-time 内部 matcher 细节

### 4.3 `process_ref / runtime_claim / evidence policy` 合约

1. `query/context` 的 `processes[]` 返回：
   - `id`（可读 process id；无法映射持久 process 时为 `derived:*`）
   - `process_ref`：`id`, `kind`, `readable`, `reader_uri`, `origin`
2. 请求 `runtime_chain_verify=on-demand` 时，返回 `runtime_claim`（graph-only）：
   - `rule_id`, `rule_version`, `scope`
   - `status`, `evidence_level`, `hops`, `gaps`
   - `verification_core_status`, `verification_core_evidence_level`
   - `policy_adjusted`, `policy_adjust_reason`
   - `guarantees`, `non_guarantees`
3. `unity_evidence_mode`: `summary | focused | full`
4. Unity full payload 可能返回 `evidence_meta`：
   - `truncated`, `omitted_count`, `next_fetch_hint`, `filter_exhausted`
   - `minimum_evidence_satisfied`, `verifier_minimum_evidence_satisfied`
   - 若 `truncated=true` 或 `filter_exhausted=true`，则 verifier 侧最小证据门槛视为未满足；应优先 `unity_evidence_mode=full` 或放宽过滤条件后再做否定性结论
5. `hydration_policy`: `fast => compact`; `balanced => 按请求`; `strict => parity`
6. 严格策略回退语义：若 `strict` 因成本/上限回退到 compact（`fallbackToCompact=true`），则对外结果视为 `policy-adjusted`，并要求 parity 重跑后再做 closure 结论。
7. `resource_path_prefix` / seed contract：类符号 + 资源路径联合检索为主路径

## 5. 配置方式（V2）

### 5.1 行为控制

V2 移除所有 `GITNEXUS_UNITY_*` 环境变量，行为由自动检测和显式配置控制：

| 行为 | 控制方式 |
| --- | --- |
| Lifecycle 合成边注入 | 对 Unity 项目自动生效（检测 `Assets/*.cs`） |
| Process 元数据持久化 | 所有过程持久化静态证据；Unity 自动检测命中 `Assets/*.cs` 时另产生生命周期分类 |
| 扩展置信度字段输出 | 始终输出 |
| 运行时链路验证 | 请求参数 `runtime_chain_verify=on-demand` 为唯一开关 |

### 5.2 调优参数

通过 `.gitnexus/config.json` 的 `unity` 键配置，CLI 参数可覆盖：

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `maxSyntheticEdgesPerClass` | 12 | 每个类最多注入合成边数 |
| `maxSyntheticEdgesTotal` | 256 | 全局合成边上限 |
| `enableContainerNodes` | false | 规则匹配容器是否扩展到 `Struct/Interface/Record`（默认仅 `Class`） |
| `lazyMaxPaths` | 120 | lazy hydration 最大路径数 |
| `lazyBatchSize` | 30 | lazy hydration 批次大小 |
| `lazyMaxMs` | 5000 | lazy hydration 超时 |
| `payloadMode` | `compact` | 资源绑定载荷详略 |
| `parityWarmup` | false | 启动时预热 parity |
| `parityWarmupMaxParallel` | 4 | 预热并发数 |
| `paritySeedCacheIdleMs` | 60000 | parity seed 缓存空闲超时 |
| `paritySeedCacheMaxEntries` | 100 | parity seed 缓存最大条目数 |
| `parityCacheMaxEntries` | 500 | parity 缓存最大条目数 |

代码依据：`gitnexus/src/core/config/unity-config.ts:4-16,26-41`

优先级：`CLI 参数 > .gitnexus/config.json > 内置默认值`

## 6. 已确认偏差与边界

1. `verifier-core` 仍为二元结果（`verified_full` / `failed`）；但 `query/context` 的 `policy-adjusted` 结果在 `strict + fallbackToCompact` 场景下允许表现为 `verified_partial` / `verified_segment`。该降级仅用于防止误闭环，最终结论需 parity 重跑确认。
2. 方法投影在 query/context 默认启用，无独立开关。
3. 强验证链路不回写 verified chain 到 Process 持久图（仅请求时计算并返回）。
4. 强验证链路对仓库文件内容与索引状态一致性敏感；若索引 stale，应先 `gitnexus analyze`。
5. 资源锚点优先：seeded 查询（类符号 + 资源路径）是完成运行时链闭环的主路径。无 seed 时返回 gap 而非猜测。
6. `evidence_meta` 只阻止“证据不足时的误闭环”。若四段闭环（Anchor/Bind/Bridge/Runtime）已经成立，`runtime_claim` 仍可保持 `verified_full`，即使存在与该闭环无关的证据裁剪。

## 7. V2 迁移回写（2026-04-03）

1. **Pipeline 重排序**：Unity 资源处理从 Phase 7 提前到 `unity-resources`，lifecycle 始终启用
2. **环境变量清除**：15 个 `GITNEXUS_UNITY_*` env var 全部移除，迁移到 `resolveUnityConfig()` 统一配置
3. **Verifier 收口**：`runtime-chain-verify.ts` query-time 路径已切换为 graph-only closure，不再加载 retrieval/verification 规则目录做匹配
4. **硬编码移除**：`RUNTIME_LOADER_ANCHORS`（8 锚点）、`DETERMINISTIC_LOADER_BRIDGES`（7 桥接）、项目特化评分全部删除

## 8. 维护规则

1. 任何 Unity runtime process 行为变更（字段、配置、语义、默认值），必须同步更新本文。
3. `AGENTS.md` / `CLAUDE.md` 应持续指向本文，作为该领域唯一入口文档。
4. 新增 Unity 资源字段识别需求时，优先评估是否应挂载到 scan-context 承载器，并在本文同步记录“识别器输入字段 + `unity-resources` 消费方式”。

## 附录 C：已退役 — Rule Lab 离线规则创作系统（v1.5.0 移除）

**退役日期**: 2026-05-18
**退役原因**: `unity-lifecycle`（内置 lifecycle 自动检测）+ graph-only runtime verification 已完全覆盖 rule lab 的规则驱动合成边注入功能。离线规则创作工作流（CLI `rule-lab` 子命令组、MCP `rule_lab_*` 工具）不再维护。

### 退役模块

| 模块 | 路径 | 说明 |
|------|------|------|
| Rule Lab 核心 | `src/rule-lab/` | 离线规则创作全链路 |
| 注入引擎 | `src/core/ingestion/unity-runtime-binding-rules.ts` | 规则驱动合成边注入 |
| CLI 子命令 | `src/cli/rule-lab.ts` | `rule-lab analyze/review-pack/curate/promote/regress/compile` |
| MCP 工具 | `src/mcp/tools.ts` | 5 个 `rule_lab_*` 工具 |
| Compiled Bundles | `src/rule-lab/compiled-bundles.ts` | 编译产物读写消费 |

### 保留的能力

- `unity-resources`（Unity 资源绑定解析）— 不受影响
- `unity-lifecycle`（内置 Lifecycle 合成 CALLS 注入）— 不受影响
- Query-time graph-only runtime chain verification — 不受影响
- 非 rule-lab 的 MCP 工具（query/context/impact/rename 等）— 不受影响
