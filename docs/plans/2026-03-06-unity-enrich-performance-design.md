# GitNexus Unity Enrich 性能优化设计（不降精度）

**日期**: 2026-03-06  
**状态**: 已实现并回归验证完成  
**类型**: 性能优化设计 + 实施落地

## 1. 背景

当前 Unity 资源交叉引用能力已可用，但在 `neonspark` 全量 `analyze --force` 场景下，执行超过 1 小时仍未完成。根因并非主图谱 `.cs` 索引本身，而是 Unity enrich 内部存在按 `Class` 重复全仓扫描的问题。

## 2. 已确认约束（冻结）

1. 不做精度降级，优先保证结果完整性。
2. 现阶段不以目标时长为约束，先解决算法循环次数与重复文件读取问题。
3. 允许使用较大内存中间索引来换取 I/O 降低。
4. 优化范围以 Unity enrich 为主，允许最小必要的 analyze 管线入参改造。

## 3. 现状问题分析

### 3.1 主索引与 enrich 范围不一致

- 主索引 `--scope-* + --extensions .cs` 仅限制进入代码图谱构建的文件。
- Unity enrich 当前按 `repoRoot` 扫描 `**/*.cs`、`**/*.cs.meta`、`**/*.prefab`、`**/*.unity`，导致 scope 外资源也会被反复扫描。

### 3.2 重复扫描热点

1. 对每个 `Class(.cs)` 调用一次 `resolveUnityBindings`。
2. 每次都重新 glob `**/*.cs` 解析 symbol。
3. 每次都重新 glob `**/*.cs.meta` 建 guid 索引。
4. 每次都重新 glob 全部 prefab/scene 并逐文件读取。

结论：当前复杂度接近 `O(C * (scan_cs + scan_meta + scan_resources))`，在大仓会快速放大。

## 4. 方案比较

### 方案 A：低侵入缓存化（快改）

在现有按 class 流程里做局部缓存（meta/hits/yaml）。

- 优点：改动面小。
- 缺点：流程结构仍是按 class 驱动，长期扩展性一般。

### 方案 B：资源驱动重排（推荐）

先完成一次全仓资源扫描建索引，再按 class 做内存 join。

- 优点：从算法层面消除重复扫描，收益最稳定。
- 缺点：重构面较方案 A 大。

### 方案 C：持久化缓存优先

优先做 `.gitnexus` 增量缓存。

- 优点：重复 analyze 可能很快。
- 缺点：首次全量构建收益有限，一致性复杂度高。

### 决策

采用 **方案 B** 作为主线，后续可叠加方案 C。

## 5. 架构设计（方案 B）

### 5.1 新增 `UnityScanContext`

一次构建，供整个 enrich 阶段复用：

1. `symbolToScriptPath`
2. `scriptPathToGuid`
3. `guidToResourceHits`
4. `resourceDocCache`（`resourcePath -> parsed yaml object graph`）

### 5.2 enrich 改为两阶段

1. **阶段 A（单次扫描）**：构建 `UnityScanContext`。
2. **阶段 B（按 class 关联）**：仅做 map join 与命中资源解析，不再触发全仓 glob。

### 5.3 管线改动边界

- `pipeline` 仍在末尾调用一次 `processUnityResources`。
- `processUnityResources` 增加可选 `scopedPaths` 入参（由 pipeline 传已过滤路径）。
- 不改变 CLI 对外语义。

## 6. 数据流（目标）

1. 从 `scope/extension` 过滤结果得到 class 节点候选。
2. 单次扫描阶段构建 `UnityScanContext`。
3. 对每个 class：`symbol -> scriptPath -> guid -> hits -> bindings`。
4. 仅在命中资源时解析 YAML，并缓存解析结果。
5. 输出 `UNITY_COMPONENT_IN / UNITY_COMPONENT_INSTANCE` 与字段摘要保持不变。

## 7. 错误处理与可观测性

1. 文件级降级：单资源读/解析失败记入 diagnostics，不中断全局。
2. symbol 级降级：单 symbol 解析失败不中断其余 class。
3. enrich 输出补充统计诊断：
   - 扫描文件计数
   - guid 命中计数
   - resource cache 命中率

## 8. 测试与验收策略

1. 保持现有 Unity/ingestion/mcp 回归用例全部通过。
2. 新增行为回归：
   - 单次扫描只构建一次 meta/hits 索引。
   - 同一资源被多 symbol 命中时只解析一次（缓存命中）。
   - 传入 `scopedPaths` 时不扫描 scope 外路径。
3. 固定 acceptance 样本：`Global/BattleMode/PlayerActor/MainUIManager`。

## 9. 风险与缓解

1. 风险：重排后结果与旧行为出现边角差异。  
   缓解：对 4 样本做字段计数与绑定类型比对。
2. 风险：内存占用上升。  
   缓解：缓存仅在 enrich 生命周期内有效，结束即释放；按需解析 YAML。
3. 风险：scope 透传逻辑与现有多 scope 行为耦合。  
   缓解：先保留 fallback 全仓扫描，再渐进收紧到 scoped scan。

## 10. 下一步

进入 `writing-plans` 生成实施计划：

1. 先完成最小可交付重构（单次扫描 + join）。
2. 再补全回归与诊断统计。
3. 最后评估是否进入 `.gitnexus` 持久化缓存阶段。

## 11. 实施状态（2026-03-06）

已完成：

1. 新增 `UnityScanContext` 并在 enrich 生命周期内单次构建。
2. `resolveUnityBindings` 支持注入 `scanContext`，仅在未提供 context 时回退全仓扫描。
3. `processUnityResources` 切换为“两阶段执行”（先建 context，再按 class join），并输出 `scanContext` 诊断计数。
4. pipeline 已透传 `extensionFiltered` 的 `scopedPaths` 到 Unity enrich。
5. 新增缓存复用回归测试，锁定同一资源 YAML 的重复解析防回退行为。
6. Unity 相关回归套件通过（`20/20`）。

当前已知限制：

1. CLI `analyze` 汇总输出尚未展示 `unityResult.diagnostics`，诊断信息目前需通过 pipeline 结果/API 获取。
