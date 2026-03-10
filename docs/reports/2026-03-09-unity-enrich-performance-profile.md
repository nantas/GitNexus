# 2026-03-09 Unity Enrich 大仓 Analyze 性能剖析报告

## 目标

完成 Phase 1.1 输出 C：
- 对大仓 analyze 做耗时分解
- 定位 Unity enrich 主要耗时环节
- 形成下一步增量优化清单（按优先级）

## 样本与方法

### 仓库与环境
- 目标仓库：`/Volumes/Shuttle/unity-projects/neonspark`
- 时间窗口：2026-03-09
- GitNexus 代码基线：当前 `nantas-dev` 工作区

### 采样场景
1. **full-repo**：无 scope 规则
2. **neonspark-v2-scope**：`benchmarks/unity-baseline/neonspark-v2/sync-manifest.txt`
   - `Assets/NEON/Code`
   - `Packages/com.veewo.*`
   - `Packages/com.neonspark.*`

### 采样命令
- 原始剖析脚本（pipeline phase + unity deep profile）
  - 产物：`docs/reports/2026-03-09-unity-enrich-performance-profile.json`
- 端到端 analyze 验证（scope 场景）
  - `node dist/cli/index.js analyze /Volumes/Shuttle/unity-projects/neonspark --force --repo-alias neonspark-perf-scope-20260309 --scope-manifest ../benchmarks/unity-baseline/neonspark-v2/sync-manifest.txt`

## 核心结论

1. **Unity enrich 是当前大仓 analyze 的绝对主耗时**。
   - full-repo：`1937.2s / 1950.7s`（`99.31%`）
   - scoped：`159.0s / 163.7s`（`97.10%`）
2. **Unity enrich 内部，`resolve` 循环占比极高**。
   - full-repo deep profile：`resolve 646.6s`，`scanContext build 4.1s`（resolve 占 `99.37%`）
   - scoped deep profile：`resolve 51.0s`，`scanContext build 0.69s`（resolve 占 `98.67%`）
3. **大量 symbol 解析工作没有产生绑定结果**，存在明显“无效工作”空间。
   - full-repo：`13,943` unique symbols 中仅 `1,354` 有 binding（命中率 `9.71%`）
   - scoped：`5,200` unique symbols 中仅 `6` 有 binding（命中率 `0.12%`）
4. **诊断噪声集中在可归并类别**，可用于前置剪枝。
   - full-repo diagnostics：`2805`
   - 其中 ambiguous symbol：`1295`
   - 其中 no MonoBehaviour block matched：`1502`

## 关键数据

| 指标 | full-repo | neonspark-v2-scope |
|---|---:|---:|
| Scoped files | 219,776 | 4,751 |
| `.cs` / `.prefab` / `.unity` | 12,111 / 5,003 / 158 | 4,706 / 3 / 2 |
| Pipeline 总耗时 | 1950.73s | 163.71s |
| Enrich 阶段耗时 | 1937.18s | 158.96s |
| Enrich 占比 | 99.31% | 97.10% |
| scanContext build | 4.12s | 0.69s |
| resolve 循环 | 646.61s | 50.96s |
| unique class symbols | 13,943 | 5,200 |
| symbols missing in scanContext | 642 | 65 |
| symbols with bindings | 1,354 | 6 |
| total bindings | 106,691 | 7 |

## 端到端 Analyze 样本（scope）

`node dist/cli/index.js analyze ... --scope-manifest ...`
- 总耗时：`169.4s`
- KuzuDB：`6.1s`
- FTS：`2.9s`

结论：在 scope 场景下，Kuzu/FTS 合计约 9 秒，瓶颈仍是 pipeline 内 Unity enrich。

## 热点定位（按影响）

### Hotspot 1（P0）
`processUnityResources` 对 class 节点逐个进入 `resolveUnityBindings`，但大多数 symbol 最终无 binding。

影响：高（>90% symbol 可能无产出）。

### Hotspot 2（P0）
`resolve` 路径中 ambiguous / missing 情况仍消耗解析尝试，且在大样本中高频出现。

影响：高（full-repo ambiguous 1295 条，scoped 也存在）。

### Hotspot 3（P1）
有 binding 的 symbol 需要大量组件节点写入与 `description` JSON 序列化（`CodeElement` payload）。

影响：中高（full-repo `123,068` component/binding 级写入）。

### Hotspot 4（P2）
诊断日志量较大（full-repo `2805` 条），包括重复类别，增加内存与串联处理开销。

影响：中。

## 优化清单（建议执行顺序）

### P0（先做）
1. **前置命中剪枝**：基于 `scanContext.scriptPathToGuid` + `guidToResourceHits`，先判断 symbol 对应 guid 是否存在资源命中；无命中直接跳过 `resolve`。
2. **scanContext 模式下禁用全仓 fallback**：symbol 不在 `symbolToScriptPath`（或判定 ambiguous）时，不再触发全仓二次扫描，直接记一次聚合诊断并跳过。

### P1（次优先）
3. **symbol 级 memoization**：同 symbol 在单次 enrich 内复用 resolve 结果，避免重复解析。
4. **payload 轻量化策略**：`CodeElement.description` 默认只保留必要键；详细字段按需生成或可开关。

### P2（收敛与可观测性）
5. **诊断聚合与限流**：按类别/样本计数，限制逐条长文本输出。
6. **加入阶段计时指标**：在 `unityResult` 中暴露 `scanContextMs / resolveMs / graphWriteMs`，形成长期回归基线。

## P0 首轮实现结果（2026-03-09）

已实现并验证：
1. 前置命中剪枝：`symbol -> guid` 无资源命中时，跳过 `resolve`。
2. scanContext 模式禁用 fallback：`symbol` 缺失 scanContext 映射时，直接跳过，不再触发全仓二次扫描。

### scope 场景（`neonspark-v2-scope`）前后对比

| 指标 | 优化前 | 优化后 | 变化 |
|---|---:|---:|---:|
| Pipeline 总耗时 | 163.71s | 7.52s | -95.4% |
| Enrich 阶段耗时 | 158.96s | 0.76s | -99.5% |
| Enrich 占比 | 97.10% | 10.16% | -86.9pp |
| `unityResult.processedSymbols` | 6 | 6 | 持平 |
| `unityResult.bindingCount` | 7 | 7 | 持平 |
| diagnostics 条数 | 57 | 3 | -94.7% |

补充端到端样本（同一 scope 命令）：
- 优化前：`Repository indexed successfully (169.4s)`
- 优化后：`Repository indexed successfully (14.1s)`

### 关键解释

- 性能瓶颈确认来自 fallback 路径：在 scope 模式下，大量 symbol 并不需要进入 resolve，全仓 fallback 导致了主耗时。
- 首轮 P0 剪枝后，绑定结果未下降（`processedSymbols/bindingCount` 持平），说明当前优化在该样本下未引入可见回归。

## P1-3（symbol 级 memoization）落地结果（2026-03-09）

已实现并验证：
- 在单次 enrich run 内，对相同 symbol 仅执行一次 `resolve`（结果与错误均缓存复用）。
- 回归测试：`processUnityResources memoizes resolve results by symbol within one run`。

### scope 场景（基于归档基线）对比

| 指标 | P0 后 | P1 后 | 变化 |
|---|---:|---:|---:|
| Pipeline 总耗时 | 7.52s | 6.63s | -11.8% |
| Enrich 阶段耗时 | 0.76s | 0.78s | +1.7%（采样波动范围内） |
| `unityResult.processedSymbols` | 6 | 6 | 持平 |
| `unityResult.bindingCount` | 7 | 7 | 持平 |
| diagnostics 条数 | 3 | 3 | 持平 |

补充端到端样本（P1 后复测）：
- `Repository indexed successfully (15.0s)`

解释：
- 在当前 scope 下，P0 已去掉绝大多数无效 resolve，P1 的额外收益较小属预期。
- P1 的主要价值是保证“同名 symbol 重复解析不再重复计算”，对重复命名更密集样本更有意义。

## P1-4（payload 轻量化）落地结果（2026-03-09）

已实现并验证：
- `CodeElement.description` 默认改为 `compact`（仅保留必要键：`bindingKind`、`componentObjectId`、`serializedFields`）。
- `full` 模式可开关（`payloadMode=full` 或环境变量 `GITNEXUS_UNITY_PAYLOAD_MODE=full`）以保留冗余字段（`resourcePath/resourceType/evidence`）。
- 回归测试：`processUnityResources writes compact unity payload by default` 与 `...payloadMode=full`。

### scope 场景（基于归档基线）对比

| 指标 | P1 后 | P1+P4 后 | 变化 |
|---|---:|---:|---:|
| Pipeline 总耗时 | 6.63s | 6.03s | -9.0% |
| Enrich 阶段耗时 | 0.78s | 0.73s | -5.5% |
| `unityResult.processedSymbols` | 6 | 6 | 持平 |
| `unityResult.bindingCount` | 7 | 7 | 持平 |
| diagnostics 条数 | 3 | 3 | 持平 |

补充端到端样本（P1+P4 后复测）：
- `Repository indexed successfully (13.3s)`

解释：
- 轻量 payload 对 enrich 与整体有小幅收益，且不影响绑定产出与对外行为。
- 在当前基线下，主要非业务耗时已转移到扫描/解析/Kuzu，后续优化重点应转向 P2 的可观测性和写入链路。

## P2-5（诊断聚合与限流）落地结果（2026-03-09）

已实现并验证：
- `processUnityResources` 将逐条 issue 诊断改为“按类别聚合 + 样本限流（每类最多 3 条）”输出。
- 保留关键摘要行：`scanContext: ...` 与 `prefilter: ...`。
- 新增回归测试：`processUnityResources aggregates repetitive diagnostics with capped samples`。

### 归档样本回放（full-repo baseline）

基于归档原始诊断（`results[0].pipeline.unityResult.diagnostics`）按新规则回放：

| 指标 | 变更前 | 变更后（估算） | 变化 |
|---|---:|---:|---:|
| diagnostics 总行数 | 2805 | 14 | -99.5% |
| no-monobehaviour-match | 1502 | 聚合计数 + 3 样本 | 限流 |
| ambiguous-symbol | 1295 | 聚合计数 + 3 样本 | 限流 |
| missing-meta-guid | 7 | 聚合计数 + 3 样本 | 限流 |

说明：
- 该结果来自对归档 JSON 的离线重放估算（不依赖再次跑全仓 analyze），用于验证聚合收益量级。
- 该优化主要收敛诊断噪声与内存/串联处理开销，不改变 binding 产出路径。

## P2-6（阶段计时指标）落地结果（2026-03-09）

已实现并验证：
- `unityResult` 新增 `timingsMs` 字段，稳定输出：
  - `scanContext`
  - `resolve`
  - `graphWrite`
  - `total`
- 指标来源：`processUnityResources` 内部计时，覆盖 scan context 构建、resolve 调用、图写入与总时长。

### scope 场景样本（`neonspark-v2-scope`）

- `timingsMs.scanContext = 711.7ms`
- `timingsMs.resolve = 2.0ms`
- `timingsMs.graphWrite = 0.1ms`
- `timingsMs.total = 717.4ms`

解释：
- 结合 P0/P1 后剪枝，`resolve` 和图写入已非常轻量，当前 enrich 主耗时几乎全部在 `scanContext` 构建。
- 后续若继续压缩 enrich，优先考虑 scanContext 构建链路（I/O 与扫描策略）。

## P3（scanContext 构建优化：复用 Class 声明映射）落地结果（2026-03-09）

已实现并验证：
- `processUnityResources` 在构建 scanContext 时透传 Class 节点声明（`symbol + filePath`）作为 `symbolDeclarations` 提示。
- `buildUnityScanContext` 支持优先使用 `symbolDeclarations` 构建 `symbolToScriptPath`（避免再次逐个读取 `.cs` 文件做声明抽取），并基于提示脚本集构建 `.meta` 索引。
- 新增回归测试：
  - `buildUnityScanContext accepts symbol declarations as hint source`
  - `processUnityResources passes class symbol declarations to scan context builder`

### scope 场景（`neonspark-v2-scope`）对比

| 指标 | P2 后 | P3 后 | 变化 |
|---|---:|---:|---:|
| enrich 阶段耗时 | 717.5ms | 471.8ms | -34.2% |
| `timingsMs.scanContext` | 711.7ms | 465.6ms | -34.6% |
| `timingsMs.resolve` | 2.0ms | 1.9ms | -5.0% |
| `timingsMs.total` | 717.4ms | 471.7ms | -34.2% |
| `processedSymbols` | 6 | 6 | 持平 |
| `bindingCount` | 7 | 7 | 持平 |
| diagnostics 条数 | 3 | 3 | 持平 |

说明：
- 该优化直接命中当前主瓶颈（scanContext 构建），且未引入绑定产出回归。
- 当前 enrich 内部耗时结构仍由 `scanContext` 主导，后续可继续在 `.meta` / 资源命中索引构建链路做增量优化。

## P3-b（scanContext 构建优化：meta 索引并发读取）落地结果（2026-03-09）

已实现并验证：
- `buildMetaIndex` 改为受控并发读取（`META_INDEX_READ_CONCURRENCY=64`），替代串行逐文件读取。
- 保持输出语义不变（guid->scriptPath 映射一致，回归测试通过）。

### scope 场景（`neonspark-v2-scope`）对比

| 指标 | P3 后 | P3-b 后 | 变化 |
|---|---:|---:|---:|
| enrich 阶段耗时 | 471.8ms | 128.3ms | -72.8% |
| `timingsMs.scanContext` | 465.6ms | 122.3ms | -73.7% |
| `timingsMs.resolve` | 1.9ms | 1.9ms | 持平 |
| `timingsMs.total` | 471.7ms | 128.2ms | -72.8% |
| `processedSymbols` | 6 | 6 | 持平 |
| `bindingCount` | 7 | 7 | 持平 |

补充观测（同一 scope 脚本集）：
- `buildMetaIndex` 单独耗时约 `477.9ms -> 110.0ms`（`-77.0%`）。

说明：
- 该轮优化继续命中 scanContext 主瓶颈，且产出稳定。
- enrich 主耗时已显著收敛，后续可以转向 `.asset/ScriptableObject` 支持与更大样本稳定性采样。

## P3-c（scanContext 构建优化：资源命中扫描并发 + 空 guid 快速返回）落地结果（2026-03-09）

已实现并验证：
- `buildGuidHitIndex` 改为受控并发扫描资源文件（`RESOURCE_HIT_SCAN_CONCURRENCY=16`），并保持结果顺序稳定聚合。
- 新增快速返回：当 `scriptPathToGuid` 为空时，直接返回空命中索引，跳过资源扫描。
- 增加健壮性：将 `EISDIR` 视为可跳过资源项，避免异常 scoped 输入导致构建中断。
- 新增回归测试：`buildUnityScanContext skips resource scanning when there are no script guids`。

### scope 场景（`neonspark-v2-scope`）对比

| 指标 | P3-b 后 | P3-c 后 | 变化 |
|---|---:|---:|---:|
| enrich 阶段耗时 | 128.3ms | 120.6ms | -6.0% |
| `timingsMs.scanContext` | 122.3ms | 114.4ms | -6.5% |
| `timingsMs.resolve` | 1.9ms | 2.0ms | +5.3%（采样波动） |
| `timingsMs.total` | 128.2ms | 120.5ms | -6.0% |
| `processedSymbols` | 6 | 6 | 持平 |
| `bindingCount` | 7 | 7 | 持平 |

说明：
- 在 scanContext 已大幅收敛后的基线上，本轮继续拿到小幅增益，并补齐了空 guid 路径的无效扫描。
- 当前 Unity enrich 已接近“resolve/graphWrite 可忽略，scanContext 主导”的尾部阶段。

## P3-d（scanContext 稳定性采样）结果（2026-03-09）

已执行：
- 同一 scope（`neonspark-v2-scope`）连续采样 3 次，记录 `scanContext / unity total / enriching phase`。

### 3 次采样统计

| 指标 | mean | median | min | max | spread |
|---|---:|---:|---:|---:|---:|
| `scanContextMs` | 75.6 | 54.7 | 51.6 | 120.4 | 68.8 |
| `unityTotalMs` | 81.3 | 60.3 | 57.0 | 126.6 | 69.6 |
| `enrichingPhaseMs` | 81.4 | 60.4 | 57.1 | 126.7 | 69.6 |

说明：
- 第 1 次采样显著高于后两次，符合冷态 I/O/缓存预热特征。
- 仅看 warm runs（run2-3），`scanContextMs` 为 `51.6~54.7ms`，波动 `3.1ms`，稳定性较好。

### 建议冻结口径（当前阶段）

- 冷态（包含首轮）观测基线：`scanContextMs median ~= 54.7ms`
- warm runs 基线：`scanContextMs median ~= 54.7ms`（建议用于日常回归告警）
- 绑定完整性守护：`processedSymbols=6`、`bindingCount=7`（3 次采样一致）

## 验收建议（下一轮）

针对同一仓库同一 scope，新增以下门槛：
- `enrichingPhaseSec` 降幅目标：首轮 `>=40%`
- `resolveMs` 降幅目标：首轮 `>=50%`
- 绑定结果完整性：`processedSymbols / bindingCount` 不低于当前基线（允许 ±2% 波动）

## 产物

- 原始数据：`docs/reports/2026-03-09-unity-enrich-performance-profile.json`
- 本报告：`docs/reports/2026-03-09-unity-enrich-performance-profile.md`
- P0 后基线：`docs/reports/2026-03-09-unity-enrich-performance-p0-after.json`
- P1 后基线：`docs/reports/2026-03-09-unity-enrich-performance-p1-after.json`
- P1+P4 后基线：`docs/reports/2026-03-09-unity-enrich-performance-p1p4-after.json`
- P2-5 诊断聚合回放：`docs/reports/2026-03-09-unity-enrich-performance-p2p5-diagnostics-replay.json`
- P2 后基线（含 timingsMs）：`docs/reports/2026-03-09-unity-enrich-performance-p2-after.json`
- P3 后基线（scanContext 优化）：`docs/reports/2026-03-09-unity-enrich-performance-p3-scancontext-after.json`
- P3-b 后基线（meta 并发优化）：`docs/reports/2026-03-09-unity-enrich-performance-p3b-meta-parallel-after.json`
- P3-c 后基线（资源扫描并发 + 空 guid 快返）：`docs/reports/2026-03-09-unity-enrich-performance-p3c-resource-scan-parallel-after.json`
- P3-d 稳定性采样（3 runs）：`docs/reports/2026-03-09-unity-enrich-performance-p3d-stability-sampling.json`
