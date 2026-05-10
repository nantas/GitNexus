# Event / Delegate Gap 分析(回滚后归属)

Date: 2026-04-13
Repo: GitNexus / neonspark
Status: Active(决策基线)

---

## 1. 结论先行

1. Event/Delegate 缺口不再作为 rule authoring 主战场。
2. 这类问题的主路径是 analyzer-native 能力建设。

---

## 2. 为什么不走规则作者主路径

### 2.1 `NewEventHub` / `GraphEventHub`(泛型总线)

- 连接关系依赖事件类型参数 `TEvent` 的分发。
- 结构是多发布者 × 多监听者矩阵,不是低成本逐条人工 authoring 的问题。
- 若用规则文件覆盖,规则规模和维护成本都会持续放大。

### 2.2 `EventHub` / `NetEventHub`(Action 字段总线)

- 连接关系依赖 `Field += callback` 与 `Field?.Invoke()` 的字段名配对。
- 本质是语法/符号提取能力问题,不是规则定义问题。
- 依靠手工规则补全会持续漏报,并把算法问题转嫁给作者流程。

---

## 3. analyzer-native 必做项

1. C# `assignment_expression` 捕获:支持 `+=` / `-=` 委托注册轨迹。
2. Action/delegate field 进入可索引符号层,并建立注册点/触发点映射。
3. 泛型事件总线提取 `Raise<T>` / `Listen<T>` 的类型参数与 callback 绑定信息。

这三项完成前,不应把 event/delegate 覆盖率目标压给 rule authoring 流程。

---

---

## 5. 与 Query-Time 闭环边界

- query-time runtime closure 继续 graph-only。
- analyzer 改进完成后,通过 analyze-time 合成边进入图,再由 query/context 检索消费。
- 不引入 query-time 规则目录匹配回退。

---

## 6. 当前开放项

1. 定义 analyzer 侧 event/delegate 解析设计文档(新增字段、图边、置信度策略)。
2. 为 `NewEventHub` 与 `EventHub` 各准备至少 1 组真实仓验收样例。
3. 在 analyzer 路线落地前，文档和 skill 均不得再宣称可系统覆盖 event/delegate 缺口。
