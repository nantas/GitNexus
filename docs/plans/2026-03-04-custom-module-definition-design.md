# GitNexus 自定义模块定义设计（Phase 4 MVP）

**日期**: 2026-03-04  
**状态**: 已完成设计确认（匹配语法标准已外置）  
**范围类型**: 设计文档（非实现）

## 1. 背景与目标

当前 GitNexus 的“模块”主要来自 `Community`（Leiden 聚类 + 启发式命名），并被 `query` / `impact` / `clusters` 等输出消费。  
本次目标是在不破坏现有分析链路的前提下，引入可配置的自定义模块定义，并保持所有模块相关输出一致。

## 2. 已确认需求（冻结）

1. 作用层：仅 Community（模块边界与命名），不改 Process 检测算法本体。  
2. 模式：MVP 支持 `auto` 与 `mixed`。  
3. 默认模式：`mixed`。  
4. `mixed` 语义：配置优先，未覆盖部分回退自动逻辑。  
5. 冲突策略：配置强覆盖；单符号最终只归属 1 个模块。  
6. 生效出口：`query`、`impact`、`gitnexus://repo/{name}/clusters`、`processes/process` 全部一致。  
7. 配置路径：`.gitnexus/modules.json`。  
8. 配置缺失/非法策略：  
   - 缺失：`mixed` 下回退 `auto`（日志提示一次）  
   - 非法：`mixed` 下 `analyze` 失败  
9. 空模块策略：  
   - 保留空模块  
   - `analyze` 日志给 warning  
   - 空模块仅在 `analyze` 日志与 `clusters` 资源中体现

## 3. 模式定义

### 3.1 `auto`

- 完全使用当前自动社区结果。  
- 不读取/不使用用户配置。

### 3.2 `mixed`

- 读取 `.gitnexus/modules.json`。  
- 命中配置的符号使用配置归属。  
- 未命中配置的符号回退自动社区归属。  
- 保证最终“单符号单模块”。

## 4. 架构方案（已选）

采用“图谱层统一模块映射”：

1. 在 `analyze` 流程中增加“最终模块归属”阶段。  
2. 该阶段输入自动社区结果 + 配置，输出最终 `Community` / `MEMBER_OF`。  
3. 输出层（MCP/CLI）继续读取统一图谱，不再各自实现模块重写逻辑。  
4. 由此保证多出口一致性。

## 5. 组件与职责

### 5.1 `ModuleConfigLoader`（新增）

- 读取并校验 `.gitnexus/modules.json`。  
- 返回：规范化配置、diagnostics、错误信息。  
- 规则：配置缺失可回退；配置非法必须失败（`mixed`）。

### 5.2 `ModuleAssignmentEngine`（新增）

- 输入：模式、自动社区归属、配置（可为空）。  
- 输出：`finalModules`、`finalMemberships`。  
- 保证：配置强覆盖 + 单符号单归属。

### 5.3 Analyze Diagnostics（扩展）

- 记录并输出：  
  - mixed 回退提示（缺配置）  
  - 空模块 warning  
  - 模块统计信息

### 5.4 现有读取链路（最小改动）

- `query` / `impact` / `clusters` / `processes/process` 不新增分支。  
- 统一消费最终 `Community` 与 `MEMBER_OF`。

## 6. 数据流与时序

1. 现有解析流程完成（含 communities/processes）。  
2. 读取并校验配置。  
3. 计算最终模块归属（`auto` 或 `mixed`）。  
4. 写入最终模块节点与归属关系。  
5. 落库完成并输出诊断日志。

## 7. 错误处理与兼容性

1. `mixed + 缺配置`：成功回退 `auto`，日志提示一次。  
2. `mixed + 非法配置`：立即失败并输出定位信息。  
3. `auto`：不受配置文件影响。  
4. 向后兼容：旧仓库无配置不被阻断。

## 8. 测试策略（MVP）

1. `auto` 回归：与当前行为一致。  
2. `mixed + 缺配置`：成功 + 回退日志。  
3. `mixed + 非法配置`：失败 + 错误定位。  
4. `mixed + 合法配置`：覆盖生效、未命中回退、单归属成立。  
5. 空模块：  
   - `clusters` 可见空模块  
   - `analyze` 输出 warning  
   - `query/impact/process*` 不产生虚假命中  
6. 一致性：同一符号在不同输出中的模块归属一致。

## 9. 匹配语法标准（外置文档）

匹配语法标准已单独拆分至以下文档：

- [2026-03-04-custom-module-matching-rules-design.md](./2026-03-04-custom-module-matching-rules-design.md)

该文档定义了：

1. `.gitnexus/modules.json` 的规则语法与校验约束。  
2. `defaultPriority + rule.priority` 的冲突决策顺序。  
3. `mixed` 模式下 `config-rule` 与 `auto-fallback` 的可解释性标准。  
4. 正向/冲突/非法样例与执行前门禁条件。

## 10. 执行前门禁

以下条件全部满足后，才允许进入实现计划与开发：

1. 本文档已评审确认。  
2. 第 9 节引用的匹配语法标准文档已通过评审。  
3. 基于补齐后的标准生成实现计划（writing-plans）。
