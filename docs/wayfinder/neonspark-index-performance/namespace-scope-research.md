---
id: neonspark-namespace-scope
labels: ["wayfinder:task"]
status: closed
assignee: null
parent: neonspark-index-performance
---
# 验证 namespace 证据范围与引用目标是否一致

## Question

范围外 namespace 是否会影响范围内引用的正确性？能否用当前已解析代码的声明代替全仓 namespace 扫描，而不依赖未经验证的路径猜测？

## 范围

用户要求继续研究。仅进行隔离反例、真实源码 import-target 回放及当前解析接口审查；不修改产品实现、不重建完整索引、不读取 Unity 资源。图 context 未找到当前 resolver，依据当前源码及实际调用核实。

## 可重复反例

资产：`.scratch/neonspark-namespace-scope-20261027/repro.mjs`。

运行 Node 24.15.0：`node .scratch/neonspark-namespace-scope-20261027/repro.mjs --assert-correct`。

真实调用 `scanCSharpProject`、`csharpScanToEvidence` 和 `resolveCsharpImportTarget`。小型临时目录在结束后删除。期望“外部声明不得使无关内部文件成为目标”的断言失败，exit 1，属于成功复现已知错误，不是测量框架失败。

- 索引范围只有 `Assets/Consumer.cs` 和 `Assets/Logging.cs`；二者声明 Game，Consumer 引用 Vendor.Logging。
- 范围外没有该声明时，结果 null。
- 仅新增 `Library/PackageCache/vendor/External.cs`，声明 Vendor.Logging，目标变为无关的 `Assets/Logging.cs`。
- 同时覆盖有 `.csproj` 和无 `.csproj` 两条实际 resolver 路径。
- 范围内证据在 `truncated:false` 时阻止该误连，但 `truncated:true` 又会放行。
- 即使 Vendor.Logging 在范围内的 RealLogger.cs 中声明，当前全局 namespace 门槛也可能选中无关 Logging.cs；仅缩小范围不能修复候选归属问题。

## 待验证假设

1. 外部证据放行造成误连：小型真实函数反例已成立，不能据此声称 neonspark 所有相关边都是错误。
2. 全局 truncated 放行掩盖范围收缩：对照当前证据、范围内 scanner 证据及仅诊断用完整标志；不将强行清除 truncated 作为实现方案。
3. 名称存在性门槛不足以证明具体目标：核对候选文件的实际 namespace/type 声明；真实源码回放只报告差异与疑似不匹配，不替代编译器或全图验收。

## 复用约束

已有 ParsedFile 的 namespace scope/qualifiedName、类型归属及 namespace-siblings 的本轮文件/AST 输入可以复用，避免全仓二次读取。但现 siblings 将多个 namespace 的顶层类型归于第一个 namespace，scanner 不解释条件编译，AST 文本列表不自动组成嵌套完整名称，不能直接把现有 bucket 当准确映射。

需要分别验证多/嵌套/file-scoped namespace、partial 类型、多目标 namespace、using static/global/alias、无 namespace、Unicode/@标识符、预处理和提取失败。RootNamespace/projectDir 与显式 DefineConstants 配置仍有独立功能；本研究不授权删除这些配置输入。当前 loadResolutionConfig 的调用时序也需要审查，不能直接引用尚未生成的解析事实。

## Resolution

研究完成，产品实现保持不变。[机器结果与反例](namespace-scope-results.json)。

### 真实源码回放

对前一轮代码基线的 9,281 个文件读取 62,404,548 字节，逐文件原始内容 SHA 与基线核对一致；按原 Assembly-CSharp.csproj defines 归一后提取 44,828 条 using（668 种解析输入）。使用生产的 using decomposer、interpreter 与 import-target resolver。当前全仓 scanner 实测提供 1,366 个 namespace、255 个项目配置，并报告 truncated；索引范围 scanner 得到 699 个 namespace，未报告 incomplete。所有变体保留同一组 255 个项目配置，只改变 namespace 证据与截断标志。

| 证据策略 | 返回目标的 using 数 | 相对当前策略变化 |
|---|---:|---:|
| 当前全仓证据，truncated=true | 2,329 | — |
| 全仓证据，诊断性设为完整 | 2,326 | 3 处变未解析 |
| 范围内证据，但保留全局 truncated=true | 2,329 | 0 |
| 范围内 scanner，实际 incomplete=false | 2,310 | 19 处变未解析 |
| 范围内、按 defines 归一的 AST；任一错误即全局不完整 | 2,329 | 0 |
| 同 AST，诊断性设为完整 | 2,310 | 19 处变未解析 |

这分离了两种因素：3 处由全局截断放行；另 16 处由范围外 namespace/root 证据放行。范围内 AST 的 4 个语法错误文件足以让旧的全局放行政策重新掩盖全部 19 处，因此不能把“换 AST”当成自动解决，也不能强制清除真实错误标志。

| using | 回放选中的错误归属候选 | 次数 |
|---|---|---:|
| UnityEditor.AddressableAssets.Settings | FMOD 的 Settings.cs（namespace FMODUnity） | 8 |
| Notion.Client | Telepathy 的 Client.cs | 2 |
| UnityEngine.UIElements.ProgressBar | Utmo Inspector 的 ProgressBar.cs | 2 |
| UnityEngine.Localization.LocalizedString | I2 的 LocalizedString.cs | 2 |
| UnityEngine.Localization.Settings | FMOD 的 Settings.cs | 3 |
| UnityEngine.Localization.SmartFormat.Core.Settings | FMOD 的 Settings.cs | 1 |
| UnityEditor.PackageManager.Client | Telepathy 的 Client.cs | 1 |

**证据边界：**候选路径顺序固定为已导出 File 清单排序，并未重建历史 glob 插入顺序。这证明当前 resolver 在真实源码输入上的行为，不证明上述目标已经作为边保存在旧索引中。自动声明匹配另标记 1,781 个候选，仅作排查线索，不作为已验证错误总数或错误率。

### 下游影响与最小修复边界

目标不只是展示：`pipeline/run.ts:721` 交给 finalize，`finalize-algorithm.ts:667/686` 建立 targetModuleScope/targetDefId，`:1620` 将有 def 的 import 物化为 bindings。namespace 没有 def 时不会自动导入文件全部符号，但 property-dispatch 仍可能使用 targetFile/module；`imports-to-edges.ts:197` 另生成 File→File IMPORTS。不能从一个误目标推断已发生错误 CALLS，但后续验收必须覆盖 bindings/类型/调用传播。

namespace 多文件可见性主要经 siblings 从原始 ParsedImport.targetRaw 聚合，不要求单文件目标成功解析（`namespace-siblings.ts:534/650`）。所以优先保持当前 C# primary-target 形式及 siblings，只修证据归属与候选验证；不扩展为多目标 namespace API 重写。

建议下一实现/验证边界：

1. namespace 声明证据来自本轮索引内解析事实；保留项目 RootNamespace/projectDir、defines 和 Razor 的独立输入，不无条件保留全仓 C# 二次读取。
2. 候选文件必须有对应声明证据；全局“某 namespace 存在”不能替代候选归属证明。无充分证据时保持 unresolved，不猜另一个文件。
3. 保留原始 using 供 siblings 使用；提取不完整不得让全部无关外部 using 自动获得内部目标。具体局部不确定性策略尚待设计与回归。
4. 分两层验收：resolver 目标；finalize 后模块/def/bindings 及最终 IMPORTS/CALLS。覆盖 namespace 多文件、partial、alias、using static、无 csproj、非惯例目录与外部同名反例。允许有证据地移除错误边，不把旧图逐边等价当唯一正确性标准。

### 验证与限制

现有 `csharp-imports.test.ts` 与 `csharp-csproj-parity.test.ts` 共 64 项通过，反例的正确性断言在现实现上失败。未修改产品源码/dist，未跑全量构建或完整测试套件，未证明性能收益。本轮单次全仓 scanner 约 8.806 秒，只是观察值，不能推算整轮节省。

初次回放脚本误用了当前 Node Tree 对象不提供的 delete 方法，在首个文件后退出；保留失败日志，改为可选释放后使用已经捕获的同一份生产证据完成回放。native Tree 按绑定自身 GC 管理，不调用 worker terminate。资产仅为小型脚本、声明/差异 JSON 和日志，没有创建索引数据库。
