---
id: neonspark-perf-receiver-element-type
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: closed
assignee: codex
blocked_by: []
---
# 区分 C# 集合接收者与元素类型

## Question

成员访问解析在集合类接收者（如 `List<T>`、数组、`Dictionary<,>` 的属性/方法访问）上是否把接收者
类型与元素类型混淆，导致候选目标归因错误？先以代码证据定位混淆点并修复，再评估是否解锁
[namespace 范围修复](namespace-scope-fix.md)中搁置的声明驱动候选发现。

## 结论（2026-10-28 调查完成）

**混淆坐实，机制、影响面与现网错边证据齐全；修复移交新实现票。**

### 机制（代码证据）

1. **绑定期无条件拍平**：`gitnexus/src/core/ingestion/languages/csharp/interpret.ts`
   `interpretCsharpTypeBinding` 对所有单参集合类型（`List/IList/IEnumerable/ICollection/
   IReadOnlyList/IReadOnlyCollection/HashSet/ISet/Task/ValueTask/Nullable/IAsyncEnumerable`）
   执行 `stripGeneric`，绑定只保留**元素类型**（`List<User> → User`）；构造推断
   （`@type-binding.generic-arg`）与声明标注同路径。容器拼写在绑定期即被丢弃。
   该行为被 `csharp-interpret.test.ts:38-58` 明确钉死（有意设计：服务于 foreach/链式传播）。
2. **消费端无法区分**：`scope-resolution/passes/receiver-bound-calls.ts` Case 4（简单
   typeBinding → 元素类型 MRO 查找）找不到容器成员（`Add/Count/Contains/...`）时，调用
   落入 Case 8/import 兜底，全库按**成员名**匹配——把 `list.Add(x)` 误配到任意同名的
   repo 方法上，产出 confidence 0.85 的错误 CALLS 边。
3. `Dictionary<K,V>` 多参不拍平 + `.Values/.Keys` 后缀经 `compound-receiver.ts` 处理，
   是正确的部分；混淆集中在单参集合的容器成员。

### 影响面（neonnew 语料，前 4000 个 .cs 文件）

- 3,323 个单参集合声明点（List 2,317 为主）；~5,000+ 容器成员调用点（Add 3,601、Clear 770、
  Contains 524…）。
- 现网 full-b1 图中目标成员名恰为容器方法的边共 595 条，其中 **441 条 import-resolved**
  （来自 404 个不同调用方），呈系统性集中误配：116 条 → `NetworkWriter.ToArray`、52 条 →
  `RoomRecorder.Add`、24 条 → `SyncList.Add`、17 条 → `SyncIDictionary.Add`、16 条 →
  `AssetRefValueDict.TryGetValue`。
- 端到端验证例：`UnlockContentList.FetchAll` 内 `var toRemove = new List<UnlockContent>()` +
  `toRemove.Add(...)` → 错误边 `AssetRefValueDict.Clear`。
- 反例（合法边）：`dataDict.Clear()` 中 `dataDict` 真实类型就是 `AssetRefValueDict`——
  441 条并非全错，**判定必须依据接收者侧类型**，不能按目标成员名一刀切。

### 与声明驱动候选发现的关系

误配的根源（容器成员落全库名字兜底）正是声明驱动候选发现被否决时"引出错误 CALLS"的机制；
修复后该兜底被类型证据约束，重评候选发现才有正确性基础。

### 移交

[区分容器成员的接收者解析修复](receiver-container-fix.md) 承接实现与验证；实现前置 impact
分析（仓库规则），验收含语料 A/B 与等价证据。
