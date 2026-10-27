# Unity 资源：从需求审查分析范围

状态：源码事实与测量假设，尚未采纳产品改动。配套[纯代码/资源拆分测量](code-resource-baseline.md)。对外语义以 `docs/unity-runtime-process-source-of-truth.md` 与当前实现为准。

## 需求与最低必要数据

| 需求 | 现在的路径 | 必要信息与不能随意删掉的依赖 |
|---|---|---|
| 找脚本挂载资源 | script `.meta` → GUID → 全候选资源逐行 discovery → canonical | `m_Script` 可在任意位置；只需信号及位置，不需保存全文。canonical 按资源命中数选择同名脚本，不能先局部确定最终绑定。 |
| prefab 嵌套、场景到 prefab 桥接 | discovery 同一物理读取识别 PrefabInstance/m_SourcePrefab | 无脚本命中的资源仍可能提供桥接，不能只按脚本命中保留资源。 |
| 组件字段与外部/本地引用 | canonical 后按资源聚合脚本 GUID；每资源一次 binding session | 需要组件、关联对象、override 和行号。小资源先构造完整 YAML blocks 再筛组件；大资源已轻量化。 |
| Serializable 内嵌类型关联 | 对全脚本两次读取建立类型和字段提示，再与实际绑定关联 | 全局类型声明仍可能被实际 host 引用；host 字段提取是否能后移，需测命中比例和依赖。 |
| 生命周期入口与流程 | parse 的 C# 声明/基类 → synthetic CALLS → process | 算法本身不依赖资源全文。当前阶段顺序依赖不等于业务数据依赖。纯代码组保留。 |
| 任意文本搜索 | File.content → CSV/COPY → FTS | 这是独立需求；目前遵守 512 KiB 文件上限。结构事实不能替代全文搜索。`.meta` 作为全文搜索文件是否必要，尚未作产品决策。 |
| 输入一致性 | 内容 receipt、单文件稳定读取、发布前复核 | 不需要 YAML 解析或持久保留全文，但现有保障需要核验相关输入字节。需求范围明确后再审查对应核验范围。 |

## 当前流程

1. 普通 scanner 扫文件并做 scope/extensions 过滤；原配置显式包含 `.meta`。
2. Unity phase 独立全仓 glob 资源，然后才过滤 scope。
3. scan-context 从代码声明构造脚本清单、Serializable 索引、脚本/资源/UI meta 映射。
4. discovery 逐资源读取，生成脚本 GUID 命中与 prefab 来源记录；未知脚本 GUID/未解析目标当前会被过滤。
5. 使用资源命中数量完成同名脚本 canonical 选择。
6. 将选中 GUID 按资源聚合，逐资源解析绑定；小资源完整 blocks，大资源轻量字段引用。
7. processor 统一写图，保存 parity seed；代码 lifecycle 与流程后续完成，CSV/COPY/FTS 消费最终 File 与图。

当前已做到每个选中资源一次 binding session，而非每个脚本重复完整解析。历史发现读取 19,539 次/5,705,017,456 字节，绑定读取 16,617 次/5,301,331,691 字节；两个用途之间仍重复读取。它是历史输入的规模证据，不是当前测量结果，也不能推导“省去字节必然省去多少秒”。此前大资源投影未通过收益门槛。

## 优先检验的假设

1. **候选集合含义不统一，导致不必要全仓遍历或范围回退。** `unity-resources.ts:10` 先全仓再筛；`scan-context.ts:427`、`meta-index.ts:81/98` 把显式空集合当未限定。先记录访问目录、候选文件、真正消费文件的差异；修正空集语义须覆盖合法空结果与兼容默认值。
2. **代码依赖范围大于图输出范围。** namespace/project 读取器可以扫描 scope 外 C# 和 csproj，完整输入核验也跟随它。应先明确“项目代码、包代码、生成/缓存代码”的用途，再证明哪些目录可排除；不能仅在核验器中删路径。纯代码基线仍保留现状，以暴露这一成本。
3. **Serializable 信息过早、重复提取。** `serialized-type-index.ts:36–49` 两遍脚本读取是确定事实。计量实际 host/声明比例、独立成本后，评估一次紧凑提取后关联或后移 host 处理；不能仅凭两遍读取就预报显著收益。
4. **小资源完整对象解析多于绑定需求。** `resolver.ts:198–205` 先得到所有 blocks，再筛 MonoBehaviour 和 GUID。应测总 blocks、选中组件、必要关联闭包的比例，再决定是否值得稀疏解析。

不先设计新缓存框架、不改业务 scope、不重试已否决大资源投影。测量将先回答资源功能总体成本及代码本身仍在访问哪些目录，再为上述假设排序。

## 输入范围的进一步证据

当前完整参考的 155,816 个 File：128,040 `.meta`、9,281 `.cs`、10,472 `.asset`、7,954 `.prefab`、69 `.unity`。`.meta` 占约 82.2%；必须将 GUID 映射读取与 `.meta` File 全文检索分别视为需求，不默认两者范围相同。

本轮纯代码输入清单为 16,384 项：16,126 `.cs`、255 `.csproj`、3 个无扩展名控制文件。按路径分组，Library/PackageCache 6,651 项、Library/VP 156 项；不是只有最终代码 File 节点才参与分析。资产：`code-input-composition.json`、`prior-file-composition.json`。

`language-config.ts:398` 明确说明 namespace 扫描服务于 suffix-fallback 防误匹配；不是解析 csproj Compile/ProjectReference 得到的项目依赖闭包。扫描排除仅 node_modules/.git/bin/obj，最多 20,000 目录/24 层，因此 Library/Artifacts 等无 C# 的目录也可能被访问。snapshot 为覆盖这一读者同样广泛枚举；输入文件数量不能代表目录访问规模。

普通 scanner 则先用 ignore 剪枝，但在 `walkRepositoryPaths` 完成枚举/stat 后才做 scope/extensions 过滤（`filesystem-walker.ts:101/115`，`pipeline-phases/scan.ts:177`）。可验证方向是安全下推目录排除；负规则/重新包含必须保持语义。namespace 证据范围能否对齐实际解析目标 `ctx.allFilePaths`，需比较 using gate 决策与 IMPORTS 边，保留 BCL 同名、using static、忽略包、无项目文件等反例。不能只改 snapshot 漏掉仍被读取的输入。

## 证据定位

- `gitnexus/src/core/ingestion/pipeline-phases/unity-resources.ts`
- `gitnexus/src/core/unity/scan-context.ts:68`：声明、类型、meta 与发现；`:493`：canonical。
- `gitnexus/src/core/unity/resource-discovery.ts:25`：逐行发现及过滤。
- `gitnexus/src/core/unity/serialized-type-index.ts:36`：两遍脚本读取。
- `gitnexus/src/core/unity/resource-session.ts:48`：按资源消费与版本检查。
- `gitnexus/src/core/unity/resolver.ts:170`：大小分支；`:198`：小资源 blocks。
- `gitnexus/src/core/ingestion/unity-resource-processor.ts:194`：选中资源聚合；`:555`：序列化类型关系。
- `gitnexus/src/core/ingestion/pipeline-phases/unity-lifecycle.ts:12`：代码派生生命周期。
