# C# namespace 范围修复与对照验证

日期：2026-10-27。状态：修复与对照验证完成，已建立新的工作树参考基线；180 秒目标未达到。

## 实现边界

- C# scope resolver 的配置加载只读取项目配置与既有 Razor 输入，不再为了 namespace 证据读取整个仓库的 `.cs`。目录遍历、`.csproj` 配置发现仍保留，因此不能宣称完全不访问 `Library/PackageCache`。
- 从实际入库、经过条件编译归一化的 AST 收集 namespace 和类型全名；只遍历声明结构，不扫描方法体，不重复读取源文件。事实通过已有 `captureSideChannel` 传递，覆盖 worker、缓存回放和主线程补解析。
- 原有路径/项目规则产生的候选，必须确实声明导入目标才保留。缺少证据时不按文件名猜测；一个文件的解析错误不再让全局 namespace 校验失效。
- 仅校验既有候选，不新增 declaration-driven 候选发现。单目标 namespace 导入仍是原有近似模型，多文件 namespace 可见性仍由原 namespace-siblings 流程负责。
- 输入快照不再纳入已无正文读取者的范围外 `.cs`；保留范围内源代码、项目配置、defines、Unity 资源和 metadata 的既有核验。空资源选择触发的原有 fallback 未改。
- 解析缓存 schema 103 → 104，避免旧缓存缺少声明证据。分析器身份包含构建内容，已有索引的构建身份变化仍触发重建。

没有修改 Unity 资源解析算法、共享语言调度、全文内容、FTS 或全局 CLI。源码和正式 dist 已落盘，未提交。

## 验证

15 个测试文件、302 项相关回归通过；包括 C# scope、条件编译、跨文件绑定、Razor、输入快照和缓存。新增覆盖嵌套/文件级 namespace、别名目标、条件编译、注释分隔名称、解析错误隔离、主线程及 worker 事实传递。端到端用例同时检查正确 IMPORTS/CALLS 与错误同名候选拒绝；缓存回放另以 V8 序列化后实际重放验证。类型检查、正式 build 和 diff whitespace 检查通过。

Graph impact 未找到当前符号，风险为 UNKNOWN：仓库图落后且新模块未入图，已按规则补读实际调用者，未据空结果认定低风险。没有刷新原仓库索引。

## 纯代码结果

独立空索引/解析缓存，Node 24.15.0，`Assets/,Packages/`、`.cs`、`Assembly-CSharp.csproj`，保留其他图阶段与全文检索；只在诊断副本禁用 Unity 资源阶段。未清空 OS 缓存。

| 指标 | 原实现 code-a1 | 最终候选 code-b2 |
|---|---:|---:|
| 完整 wall | 152.257 s | 133.875 s |
| CPU | 407.43 s | 364.73 s |
| 峰值内存 | 5.107 GiB | 5.014 GiB |
| C# 读取 API 调用 | 133,068 | 73,436 |
| 输入核验文件数 | 16,384 | 9,539 |
| 入库代码文件 | 9,281 | 9,281 |
| 所选代码符号记录 | 109,638 | 109,638 |
| IMPORTS 边 | 2,307 | 543 |

单对 wall 下降约 12.1%，不是稳定收益或完整能力 180 秒验收。代码内容及符号哈希完全一致；新版输入是旧版的同内容子集，减少 6,845 个范围外 `.cs`。剩余项目配置没有被省略。

用独立 AST 声明清单及原/新 resolver 回放 44,828 条 using，两个版本产生的导入文件对都与实际数据库完全相符。1,781 处 using 的目标不声明其导入名字，对应删除 1,764 条去重 IMPORTS；剩余 543 条全部具备声明证据。不能只检查“目标文件声明了本文件任意一个 using”：那会把同文件另一条 using 的证据错误借给当前导入。

逐项审查非社区关系差异：

- `TransformFindExtend` 的别名实际指向 `UnityTransform.Find`，删除指向 `UnityGameObject.Find` 的错误继承、override 和调用。
- 删除 Unity UIElements `ListView` / `ProgressBar` 错连本地同名类型的构造调用。
- `QuickMatch` 的 `Room` 别名指向 `LightReflectiveMirror.Room`，由错误的游戏 Room 构造改为正确 struct。
- `GameRoomDifficultyTests` 新识别三个实际存在的 SyncIDictionary 调用；`room.RelayInfo.Address` 保留属性目标并更新接收者证据。
- 社区 MEMBER_OF 重排是导入图变化后的派生结果；不将其作为代码符号丢失。STEP_IN_PROCESS 完全一致。

英文、中文和正文 10 KiB 以后关键词的实际 FTS 召回均通过。

## 不采纳的扩大候选方案

首轮 code-b1 同时用声明表补全过去未解析的导入，IMPORTS 从 2,307 增到 29,853，wall 145.528 s。其导入目标都能找到声明，但新补全继承后暴露原有接收者类型推断问题：`HashSet<GunGraph>.Clear()` 被连到 `NodeGraph.Clear()`。因此不采纳，不能仅凭导入边归属正确和耗时下降宣布成功。

最终实现只验证原候选，避免扩大推断覆盖。**后续独立方向：区分集合本身、元素访问和迭代变量的类型，再评估声明驱动的完整 namespace 导入模型。** 本轮没有顺带修改该推断子系统。

## 证据与清理

本地证据：`.scratch/neonspark-namespace-fix-20261027/`。

- `product-pins.json`：源码、正式 dist 与诊断副本哈希。
- `comparison.json`、`import-oracle.json`、`removed-import-evidence.json`：最终对照和导入逐项证据。
- `relation-deltas.json.gz`、`semantic-review.json`：完整关系差异及源码核对结论。
- `rejected-expansion-*`：未采纳候选的差异，保留而不计成功基线。
- 各 run 的 invocation、日志、receipt、内容/符号/关系哈希、FTS 召回和 cleanup 记录。

四轮实验数据库和解析缓存均已回收，共 12,332,812,260 字节（约 12.33 GB / 11.49 GiB）；本轮证据目录没有超过 500 MiB 的单文件。原 neonspark 索引的 inode、大小、mtime 及 metadata SHA 验证未变。


## 完整 Unity 验证与新基线

完整构建 **464.535 秒**，CPU 727.79 秒，峰值约 **12.879 GiB**；首次/发布前输入核验 31.938 / 68.135 秒，parse 35.893 秒、scope 30.002 秒、资源阶段 150.170 秒。此轮期间有少量语义回放和小型回归工作，作为完整验收样本，不用于隔离性能归因。相比旧参考 446.985 秒，本轮没有证明完整 wall 或峰值改善，不能把纯代码约 12.1% 观测下降宣称为全量收益。

- 157,189 个输入与旧 164,034 个输入的共同部分内容完全一致；差集恰为 6,845 个已无 namespace 正文读取需求的范围外 `.cs`。
- 155,816 个 File 节点的清单与全文内容、109,638 条所选代码符号记录与旧完整基线一致。
- 348,917 条 Unity / 资源 / runtime-root 相关事实与旧完整基线一致；CALLS、IMPORTS、继承、访问、USES、STEP_IN_PROCESS 与最终纯代码候选一致。
- 22 个 FTS 索引就绪，英文、中文及正文 10 KiB 后关键词的实际召回通过。

[baseline-current.json](baseline-current.json) 已固定当前源码/正式 dist 哈希和此轮完整参考，旧基线归档为 [baseline-pre-namespace-fix-20261027.json](baseline-pre-namespace-fix-20261027.json)。详细数字见 [namespace-scope-fix-results.json](namespace-scope-fix-results.json)。这是一次完整观测，不是稳定 SLA 或三轮 180 秒验收；地图保持 open。未运行全仓测试或跨平台测试，未提交或发布。
