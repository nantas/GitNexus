# GitNexus Unity CS-资源互引检索设计（Phase 0 -> Phase 1）

**日期**: 2026-03-06  
**状态**: 需求确认完成（设计冻结）  
**类型**: 设计文档（非实现）

## 1. 背景

现有 GitNexus 在 `neonspark` 实仓中主要覆盖 C# 代码关系，尚不能原生回答：

1. 某个 MonoBehaviour 被哪些 `prefab/scene` 挂载。
2. 该组件实例有哪些序列化值字段与对象引用字段。

用户已确认下一阶段采用双轨推进：先验证价值，再图谱原生化。

## 2. 已确认需求（冻结）

1. 路线：`Phase 0（实验命令） -> Phase 1（图谱原生）`。
2. Phase 0 入口：独立实验命令，不改现有 `context` 默认行为。
3. Phase 0 输出：人类可读摘要为主，支持 `--json`。
4. Phase 0 默认扫描范围：全 `Assets`。
5. Phase 0 验收样本：
   - `Global.cs`
   - `BattleMode.cs`
   - `PlayerActor.cs`
   - `MainUIManager.cs`
6. Phase 0 验收口径：4 样本“合计覆盖”值字段与对象引用字段即可。
7. Phase 1 覆盖范围：`MonoBehaviour + .prefab/.unity`。
8. Phase 1 首发出口：`query + context` 同时接入。
9. `context/query` 增加参数控制是否开启资源检索；默认 `off`。
10. Phase 1 解析深度：完整覆写链（`base prefab -> variant -> nested instance -> scene override`）。
11. 本阶段不纳入：`.asset/ScriptableObject` 图谱原生支持。

## 3. 方案比较与决策

### 3.1 方案 A（已选）: 双轨共享解析内核

- Phase 0 与 Phase 1 共享一套 Unity 解析内核。
- Phase 0 先提供可验证命令，Phase 1 将同一语义落库并接入 MCP 查询。

**优点**:
1. 与“先验证再实装”目标一致。
2. 避免 Phase 1 重写解析逻辑。
3. 降低语义漂移风险。

**缺点**:
1. 对前期抽象要求更高。

### 3.2 方案 B: Phase 0 快速脚本、Phase 1 重写

**优点**: 最快看到第一版结果。  
**缺点**: 重复开发和语义偏差风险高。

### 3.3 方案 C: 直接 Phase 1 一步到位

**优点**: 最终形态最纯。  
**缺点**: 周期和风险最高，不符合本轮目标节奏。

## 4. 架构设计（方案 A）

### 4.1 共用解析内核

建议新增 `UnityScriptBindingResolver`，按层拆分：

1. `MetaIndex`：从 `*.cs.meta` 建立 `scriptGuid -> scriptPath/symbol` 映射。
2. `ResourceScanner`：扫描 `*.prefab/*.unity` 中 `m_Script guid` 命中。
3. `YamlObjectGraph`：构建对象块索引（含 `fileID`、`PrefabInstance`、`stripped`）。
4. `OverrideMerger`：按覆写链合并最终字段视图。
5. `FieldNormalizer`：输出统一字段结构（值字段 / 引用字段）。

### 4.2 Phase 0（独立实验命令）

建议命令形态：`gitnexus unity-bindings <symbol>`（名称可在实现计划阶段最终确定）。

最小输出：
1. 脚本信息（symbol/path/guid）。
2. 资源绑定列表（prefab/scene 路径、证据行号）。
3. 组件字段摘要：
   - `scalarFields`
   - `referenceFields`
4. 统计信息（扫描文件数、命中数、耗时）。

### 4.3 Phase 1（图谱原生）

1. 在 analyze 流程新增 Unity 资源处理阶段（复用解析内核）。
2. 持久化脚本-资源绑定与实例字段数据。
3. `query/context` 查询改为“图谱读取优先”，避免运行时全量扫描。

## 5. 查询契约与输出契约

### 5.1 新增开关

`query/context` 增加统一参数：`unityResources: off | on | auto`。

- 当前默认：`off`（兼容优先）。
- `on`：强制输出资源检索结果。
- `auto`：按阈值策略自动启用（可后续细化）。

### 5.2 输出新增字段（`on/auto`）

1. `resourceBindings[]`
   - `resourcePath`
   - `resourceType` (`prefab|scene`)
   - `bindingKind` (`direct|prefab-instance|nested|variant|scene-override`)
   - `componentObjectId`
   - `evidence`（行号/片段定位）
2. `serializedFields`
   - `scalarFields[]`: `{name, value, valueType, sourceLayer}`
   - `referenceFields[]`: `{name, fileId?, guid?, resolvedAssetPath?, sourceLayer}`
3. `unityDiagnostics[]`
   - 解析降级、部分失败、歧义提示等说明。

## 6. 错误处理与兼容性

1. 符号歧义：返回候选，不做隐式猜测。
2. `.meta` 缺失/无 guid：warning 并降级，不中断全局查询。
3. 单文件解析失败：按文件降级跳过并记录 diagnostics。
4. 覆写链断裂/循环：保留可解析部分，标记 `mergePartial=true`。
5. 默认 `unityResources=off` 时维持现有结果结构和性能。

## 7. 性能策略

1. Phase 0：全 `Assets` 扫描 + 基础缓存（mtime/guid 索引）。
2. Phase 1：资源解析前移到 analyze，查询阶段走图谱读取。
3. 增量 analyze 仅重算变更资源文件，控制索引成本。

## 8. 测试与验收

### 8.1 单元测试

1. guid 映射与 `m_Script` 命中提取。
2. `stripped` 还原。
3. `PrefabInstance.m_Modification` 合并。
4. 字段归一化（值字段/对象引用字段）。

### 8.2 集成验收（固定样本）

1. `Global.cs`
2. `BattleMode.cs`
3. `PlayerActor.cs`
4. `MainUIManager.cs`

验收规则：4 样本合计覆盖值字段与对象引用字段。

### 8.3 接口回归

1. `unityResources=off` 与当前行为一致。
2. `unityResources=on` 返回结构稳定。
3. `query/context` 同步支持同一参数语义。

## 9. DoD

1. Phase 0：独立命令可稳定输出 4 样本资源绑定与字段摘要。
2. Phase 1：`query/context` 在 `unityResources=on` 下返回图谱原生资源结果。
3. 默认 `off` 完整兼容现网行为。
4. 覆写链主路径（base/variant/nested/scene override）可解释可验证。

## 10. 风险与后续边界

1. 覆写链完整合并复杂度高，需重点防性能退化。
2. `fileID` 仅本文件可解时需严格限定解析域，避免误连。
3. `.asset/ScriptableObject` 后续可作为 Phase 2 扩展，不在本次范围。

## 11. 下一步

按流程进入 `writing-plans`，产出实现计划文档并定义可执行任务拆分。
