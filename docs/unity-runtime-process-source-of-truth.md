# Unity Runtime Process 真理源（Design × As-Built）

Date: 2026-04-10
Owner: GitNexus
Status: Active (source of truth) — V2 规则驱动架构

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

Pipeline 执行顺序（`gitnexus/src/core/ingestion/pipeline.ts`）：

```
Phase 1-4:   Scan → Structure → Parse → MRO
Phase 5:     Communities
Phase 5.5:   processUnityResources (UNITY_COMPONENT_INSTANCE / UNITY_ASSET_GUID_REF 边)
Phase 5.6:   applyUnityLifecycleSyntheticCalls (通用 lifecycle 合成 CALLS)
Phase 6:     processProcesses (沿所有 CALLS 边追踪，生成 Process)
```

1. Unity 资源绑定解析（Phase 5.5）：
   - `processUnityResources`：`pipeline.ts:441`
   - 产出 `UNITY_COMPONENT_INSTANCE`、`UNITY_ASSET_GUID_REF`、`UNITY_RESOURCE_SUMMARY` 边
   - `PrefabInstance.m_SourcePrefab` 资源级提取已纳入 Phase 5.5，产出去重后的 `scene->prefab` 与 `prefab->prefab` `UNITY_ASSET_GUID_REF`
2. 内置 Lifecycle 注入（Phase 5.6）：
   - 对 Unity 项目自动生效（检测 `Assets/*.cs` 文件）：`pipeline.ts:444`
   - 通用 lifecycle 回调注入（OnEnable/Awake/Start/Update 等）：`unity-lifecycle-synthetic-calls.ts:52-107`
   - 配置从 `resolveUnityConfig()` 读取：`pipeline.ts:445`
3. Process 生成（Phase 6）：
   - 基于 CALLS tracing，标注 `processSubtype` 和 `runtimeChainConfidence`：`pipeline.ts:490-525`
   - 生命周期 metadata 按 Unity resource-binding flow 条件持久化（Unity 自动检测命中 `Assets/*.cs` 时开启）：`pipeline.ts:446`

### 2.1.1 Scan-Context 承载器契约（As-Built + Design Direction）

1. As-Built（当前事实）：
   - `scan-context` 已承担 Unity 资源扫描阶段的核心索引输入（脚本 GUID 命中、资源路径集合、GUID 映射等）。
   - `scan-context` 在同次资源扫描中以流式方式产出 `PrefabInstance.m_SourcePrefab` 轻量线索（streaming delivery）。
   - `processUnityResources` 在 Phase 5.5 统一消费 `scanContext.streamPrefabSourceRefs(...)` 写入 `UNITY_ASSET_GUID_REF`，并统一执行 dedupe/diagnostics/reason payload。
   - `scan-context does not write graph edges`; 图谱写入职责仅在 `processUnityResources`。
2. Design Direction（重构方向，待实现）：
   - `scan-context` 持续作为可扩展的“资源字段识别承载器（resource signal carrier）”。
   - 后续资源字段识别需求（新增字段）优先通过扫描期识别器挂载扩展，避免新增孤立重型 pass。
3. 统一消费点契约：
   - scan-context 的识别结果由 `processUnityResources` 统一消费并写图（含 dedupe、diagnostics、reason payload）。
   - 组件级深解析仍由 resolver/绑定链路执行；scan-context 不承担完整语义求值职责。
   - 目标是固定“扫描产出记录 → Phase 5.5 统一消费”这一主干，避免后续功能扩展时出现平行管线漂移。

### 2.2 Query/Context 侧（检索与投影）

1. 直接 process membership：`STEP_IN_PROCESS`。
2. 类符号方法投影：
   - `HAS_METHOD -> STEP_IN_PROCESS` 合并：`local-backend.ts:763-793, 1460-1483`
   - 证据模式合并：`process-evidence.ts:46-114`
3. empty-process 行为（无 heuristic 注入）：
   - `query`: `processRows.length===0` 时，符号归入 `definitions`
   - `context`: `processRows.length===0` 时，`processes=[]`
   - 资源收敛线索通过 `resource_hints` / `next_hops` 提供，不再通过 process 注入
4. 扩展字段始终输出（不再需要 flag）：
   - `runtime_chain_confidence`、`runtime_chain_evidence_level`、`verification_hint`
   - `process-confidence.ts`；`local-backend.ts`
5. **Local-Backend Unity Adapter（D1 Adapter Pattern）**（2026-05-09 新增）：
   - `attachUnityContext(repo, symbol, symKind, opts)`：`local-backend.ts:1985-2050`
     - 在 `context()` handler 的 symbol 解析成功后调用
     - 通过 `loadUnityContext()` 读取 graph 中 UNITY 边
     - 根据 `opts.hydration`（`compact`/`strict`/`parity`）调用 `hydrateUnityForSymbol()`
     - 根据 `opts.responseProfile`（`slim`/`full`）裁剪 `hydrationMeta`
     - 返回的 payload 与 base response 合并
   - `enrichWithUnityEvidence(repo, query, baseResponse)`：`local-backend.ts:2068-2155`
     - 在 `query()` handler 的搜索结果后调用
     - 通过 `findUnityMatchingSymbol()` 匹配带有 UNITY 边的符号
     - 调用 `hydrateUnityForSymbol()` 与 `buildUnityEvidenceView()` 构建 evidence
     - 当查询匹配已知 runtime process（Reload/Update/Awake 等）时，通过 `buildWorkflowResponse()` 执行 `verifyRuntimeChainOnDemand()` 返回实时 chain evidence
     - 返回 `evidence`、`confidence`（`verifier-core` + `policy-adjusted`）、`hydrationMeta`、`workflows`
   - **Unity Query/Context 辅助函数**（2026-05-09 恢复）：
     - `buildNextHops(input)`：`local-backend.ts` — 生成 next-hops 命令模板，支持 repoName 注入、retrieval rule 配置、verification hint。输入含 `seedPath`, `mappedSeedTargets`, `resourceBindings`, `retrievalRule`, `repoName`, `symbolName`, `queryForSymbol`；输出 `NextHopPayload[]`（kind: resource|symbol|verify）。
     - `pickVerifierSymbolAnchor(input)`：`local-backend.ts` — 优先选择结构化符号锚点。按 `process_evidence_mode`（direct_step=3 > method_projected=2 > resource_heuristic=1）和 `process_confidence`（high=3 > medium=2 > low=1）排序，返回 `{ symbolName?, symbolFilePath? }`。
     - `pickRetrievalRuleHintFromBundle(input)`：`local-backend.ts` — 从规则 bundle 匹配最高信号规则。评分：host_base_type(20+len) > trigger_tokens(10+len) > resource_types(4+len)；无 matchedEvidence 则丢弃；无 matchedTrigger 扣 3 分。
     - `computeVerifierMinimumEvidenceSatisfied(input)`：`local-backend.ts` — evidence gate 核心。若 `truncated=true` 或 `filterExhausted=true` 直接返回 false；否则要求所有 `evidenceMetaRows` 的 `minimum_evidence_satisfied` 和 `verifier_minimum_evidence_satisfied` 均不为 false。
     - `filterBm25ResultsByScopePreset(rows, scopePreset)`：`local-backend.ts` — scope 预设过滤。`unity-gameplay` 保留 `assets/` 开头且排除 `assets/plugins/`, `packages/`, `library/` 等前缀的结果。
     - `rankExpandedSymbolsForQuery(symbols, query, limit, scopePreset)`：`local-backend.ts` — 查询感知排序。 gameplay 路径加分，plugin 路径减分（无 plugin intent token 时）；按 score、startLine、name 排序后取前 limit。

### 2.3 On-Demand 强验证（Graph-Only Closure）

1. 显式入口：
   - CLI: `--runtime-chain-verify off|on-demand`
   - MCP schema: `runtime_chain_verify`（`gitnexus/src/mcp/tools.ts`）
   - 请求参数为唯一控制开关，无全局 gate
2. 验证逻辑（`runtime-chain-verify.ts`）：
   - `verifyRuntimeClaimOnDemand`：直接走结构化锚点（`symbolName/resourceSeedPath/mappedSeedTargets/resourceBindings`）驱动的 graph-only closure
   - `queryText` 不再作为 verifier 匹配信号；仅用于默认 `next_action` 文案与弱 seed 提取兜底
   - query-time 不再加载规则目录做匹配，完全基于图谱结构
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
| Phase 1 | Unity summary schema hygiene | 已落地 | `schema.ts:254` |
| Phase 2 | class→method process 投影 | 已落地（query/context 双侧） | `local-backend.ts:763-793, 1460-1483` |
| Phase 3 | lifecycle synthetic CALLS 注入 | 已落地 | `unity-lifecycle-synthetic-calls.ts` |
| Phase 4 | persisted lifecycle process artifact | 仅在 Unity resource-binding flow 激活时持久化 | `pipeline.ts:446,524-525` |
| Phase 5 | confidence + verification_hint 合约 | 始终输出 | `process-confidence.ts`；`local-backend.ts` |
| V1 Reload | on-demand verify + 验收闭环 | verifier 简化为图谱查询 | `runtime-chain-verify.ts` |
| Process 元数据 | persisted lifecycle process artifact | 仅在 Unity resource-binding flow 激活时持久化 | `pipeline.ts:446,524-525` |

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
9. `resource_chains[]`：当请求提供 Unity resource seed（例如 `resource_path_prefix`）且图谱存在 `File -[UNITY_ASSET_GUID_REF]-> File -[UNITY_GRAPH_NODE_SCRIPT_REF]-> Symbol` 时，`query/context` 返回结构化链路：`sourceResourcePath`、`intermediateResourcePath`、`targetSymbol`。这是检索返回契约，不等同于把资源桥接写入 `Process`。

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
| Process 元数据持久化 | 与 Unity resource-binding flow 绑定（Unity 自动检测命中 `Assets/*.cs` 时持久化） |
| 扩展置信度字段输出 | 始终输出 |
| 运行时链路验证 | 请求参数 `runtime_chain_verify=on-demand` 为唯一开关 |

### 5.2 调优参数

通过 `.gitnexus/config.json` 的 `unity` 键配置，CLI 参数可覆盖：

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `maxSyntheticEdgesPerClass` | 12 | 每个类最多注入合成边数 |
| `maxSyntheticEdgesTotal` | 256 | 全局合成边上限 |
| `lazyMaxPaths` | 120 | lazy hydration 最大路径数 |
| `lazyBatchSize` | 30 | lazy hydration 批次大小 |
| `lazyMaxMs` | 5000 | lazy hydration 超时 |

代码依据：`gitnexus/src/core/config/unity-config.ts:4-18,26-40`

优先级：`CLI 参数 > .gitnexus/config.json > 内置默认值`

## 6. 已确认偏差与边界

1. `verifier-core` 仍为二元结果（`verified_full` / `failed`）；但 `query/context` 的 `policy-adjusted` 结果在 `strict + fallbackToCompact` 场景下允许表现为 `verified_partial` / `verified_segment`。该降级仅用于防止误闭环，最终结论需 parity 重跑确认。
2. 方法投影在 query/context 默认启用，无独立开关。
3. 强验证链路不回写 verified chain 到 Process 持久图（仅请求时计算并返回）。
4. 强验证链路对仓库文件内容与索引状态一致性敏感；若索引 stale，应先 `gitnexus analyze`。
5. 资源锚点优先：seeded 查询（类符号 + 资源路径）是完成运行时链闭环的主路径。无 seed 时返回 gap 而非猜测。
6. `evidence_meta` 只阻止“证据不足时的误闭环”。若四段闭环（Anchor/Bind/Bridge/Runtime）已经成立，`runtime_claim` 仍可保持 `verified_full`，即使存在与该闭环无关的证据裁剪。

## 7. 维护规则

1. 任何 Unity runtime process 行为变更（字段、配置、语义、默认值），必须同步更新本文。
2. 扩展新的 `resource_bindings` kind 时，需在本文补充触发判定、图谱遍历路径、合成边属性。
3. `AGENTS.md` / `CLAUDE.md` 应持续指向本文，作为该领域唯一入口文档。
4. 新增 Unity 资源字段识别需求时，优先评估是否应挂载到 scan-context 承载器，并在本文同步记录“识别器输入字段 + Phase 5.5 消费方式”。
