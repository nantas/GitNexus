---
id: neonspark-perf-receiver-container-fix
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: closed
assignee: codex
blocked_by: []
---
# 区分容器成员的接收者解析修复

## Question

如何在保留集合元素传播（foreach/链式/`list[i]`）的前提下，让集合容器成员（`Add/Count/
Contains/...`）不再落入全库名字兜底产生错误 CALLS/ACCESSES 边？

## 决议（2026-10-28 实现并通过验证）

### 实现（已提交 3989db52）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `gitnexus-shared/src/scope-resolution/types.ts` | `TypeRef.boundAs?` —— 创建时的绑定名，作为类型证据的"所有权"判据 |
| 2 | `gitnexus/src/core/ingestion/utils/template-arguments.ts` | 新增 `elementErasedTypeApplication`：识别"元素拍平"形态（spelling=`Base<Arg>` 且 rawName==Arg），重建容器应用 |
| 3 | `gitnexus/src/core/ingestion/scope-resolution/passes/receiver-bound-calls.ts` | Case 4 门控：`erasedTypeApplication ?? (elementErased && boundAs 属主 && provider 判定容器)` 时按容器应用落地；无法落地的容器接收者抑制（receiver-unresolved + handled），切断名字兜底 |
| 4 | `gitnexus/src/core/ingestion/scope-resolution/contract/scope-resolver.ts` | 新增可选钩子 `isContainerMemberReceiver(application)` |
| 5 | `gitnexus/src/core/ingestion/languages/csharp/` | query：6 个 generic-arg 模式补 `@type-binding.container` 捕获；interpret：标注/构造两路径产出 `declaredSpelling`（Task/ValueTask/Nullable 归入 unwrap 族不参与门控）；scope-resolver：钩子以集合族实现（与 stripGeneric 共享导出常量） |
| 6 | `gitnexus/src/core/ingestion/scope-extractor.ts` + `parse-cache.ts` | 存储 TypeRef 时写 `boundAs`；SCHEMA_BUMP 104→105（捕获集变更） |

设计要点：
- **门控语义**：合法 C# 中 `users.M()` 永远不是元素成员调用——直接容器接收者的成员解析必须
  落到容器（repo 声明的容器按 MRO 解析其成员；BCL 容器判为 unresolved，不落全库名字兜底）。
- **`boundAs` 所有权**：foreach 迭代变量/链式别名复制容器 TypeRef 时携带原绑定名，门控比较
  `boundAs === receiverName`，别名自动豁免（元素语义保留）。
- **语言无关形态**：`elementErasedTypeApplication` 是纯形态规则；容器种类知识经 provider 钩子
  注入（共享代码不含语言名，遵守 ingestion 分层规则）。await/unwrap 族（Task/Promise）由钩子
  排除，await 传播不受影响；Kotlin/Rust 同型拍平可后续按需接入。
- **调试发现（记录给后续会话）**：夹具测试的 parse worker 从 `gitnexus/dist` 加载语言代码，
  源码改动后必须 `npm run build` 再跑集成测试，否则陈旧 dist 制造假回归。

### 验证

1. **单测/全量**：新增 `element-erased-type-application.test.ts`（9 例形态表）、扩展
   `csharp-interpret.test.ts`（7 例 declaredSpelling）；全量 `npm test` **22,096 passed / 83
   skipped / 0 failed**（含 golden 更新、SCHEMA pin 105）。
2. **端到端探针**（合成仓，新 dist）：
   - 假边消除：`field.Add(u)`/`field.Count`/`local.Add(u)`（构造推断）不再产生 `User.Add`/`User.Count`；
   - 元素语义保留：`field[0].Greet()`、`foreach x.Greet()`、`local[0].Greet()` 正确解析；
   - repo 容器落地：`MyList : List<User>` 接收者的 `Rotate()`/构造正确；
   - 已知残留：`var alias = field; alias.Add(u)`（同值别名）仍走元素路径——别名与迭代变量在
     门控处不可区分，保守豁免，与修复前行为一致。
3. **neonnew 语料 A/B**（full-c1 候选构建 vs full-b1 基线，receipt 逐字节一致）：
   - **-103 CALLS / -123 ACCESSES**：全部为假容器成员边（`SyncList.Add/Clear`、`AssetRefList.
     Count/DataSource/Clear/Add`、`NodeUsageRegister.Clear` 等同名误配模式）；
   - **-9 STEP_IN_PROCESS**：两个依赖假调用链的幻影进程清空（步骤 5→0、4→0；flows 2410→2408，
     与 2 个进程消解吻合）；
   - **+4 CALLS / +2 ACCESSES**：元素语义新可达的解析（`PerkListSo.UpdateFateSet →
     FatePerk.Set*`、`OrbitalMinionManager → MinionActor.UpdateLocalScale`、Mirror 测试自读），
     已逐条列出供审；
   - MEMBER_OF ±3.8 万：社区重聚类噪声（clusters 7676→7652），派生启发式，非语义漂移；
   - **硬锚点全部一致**：code-symbols / file-inventory / file-content-hashes 逐字节相同，
     UNITY_RESOURCE_SUMMARY/COMPONENT_INSTANCE/ASSET_GUID_REF/GRAPH_NODE_SCRIPT_REF/
     SERIALIZED_TYPE_IN/unity-runtime-root CALLS 全等，FTS 召回通过。
   - 计时：full-c1 wall 289.8s（安静窗口，与 full-b4 308.5s 同量级，无阶段回退）。
4. **保护**：neonnew 既有 `.gitnexus` 索引全程未触碰；实验索引已回收（6.48 GiB）。

### 边界与遗留

- 产品改动已提交 `3989db52`（提交前 detect-changes：33 文件/24 符号/3 个受影响流程，均为 EmitReceiverBoundCalls，风险 medium）。
- 同值别名残留（上述）与 Kotlin/Rust 同型接入留作后续；声明驱动 namespace 候选发现的重评
  （[调查票](receiver-element-type.md)遗留问题）现在具备正确性基础，作为独立后续。
- full-c1 使用干净产品 dist（无 BENCH 回执补丁），输入一致性以产品级 receipt digest
  （ed1188c9…，与 full-b1 相同）+ 元数据对账。
