# neonspark 性能实验记录（2026-10-23）

状态：本批优化已建立基线；冷启动全量 180 秒目标尚未达到，地图保持 open。结构化测量见 [baseline.json](baseline.json)。

## 可复现口径

- GitNexus 源码：`22b2584947cc38250b1488ccfefe53e9e9be9431`（nantas-dev，1.6.12）加本次工作区补丁。
- neonspark：`7062ac342f835bf67943922441554abe27f45d45`，保留实验前已有的未提交字体资源改动；原输入内容由 receipt 校验。
- Node：24.15.0；本机 24 GiB RAM / 10 核。实验时有 Unity、浏览器等现存进程，系统已有大量 swap，因此单轮 wall 不能解释为严格控制硬件负载的统计结果。
- `.gitnexusrc` 原样使用：Assets/、Packages/，.cs/.meta，Assembly-CSharp.csproj defines。
- 冷构建使用独立空索引和解析缓存，不清空 OS 缓存。完整 CLI wall 包含输入核验、解析/资源/进程图、CSV/COPY、full-content FTS、发布复核及退出。
- 使用 `--force --index-only --verbose`，不启用 embeddings；full content/FTS、资源范围、输入核验均保持不变。
- 原仓库 source/index/global CLI 不修改；实验存放 `.scratch/neonspark-perf-20261023/`。

本地实验 harness 和原始日志位于上述 `.scratch/`，不随 Git 提交；持久基线为本文和 baseline.json。可用以下命令在相同输入上复跑（先在 gitnexus 目录 `npm run build`，Node 固定 24.15.0）：

```sh
# 三个变量由操作者指定；cold 必须使用新的空目录，不能指向原索引。
CLI_DIST="$(pwd)/gitnexus/dist"
TARGET_REPO="<neonspark-checkout>"
BENCH_ROOT="<new-empty-benchmark-directory>"
mkdir -p "$BENCH_ROOT"
cd "$TARGET_REPO"
/usr/bin/time -l env NODE_ENV=development VALIDATE_SEMANTIC_MODEL=0 \
  PROF_LBUG_LOAD=1 PROF_SCOPE_RESOLUTION=1 \
  GITNEXUS_STORAGE_PATH="$BENCH_ROOT/index" GITNEXUS_HOME="$BENCH_ROOT/home" \
  node --max-old-space-size=18432 --max-semi-space-size=128 --stack-size=4096 \
  "$CLI_DIST/cli/index.js" analyze --force --index-only --verbose --name neonspark-performance
```

从 GitNexus 根目录设置 CLI_DIST，TARGET_REPO/BENCH_ROOT 使用绝对路径。同一独立索引再运行是有缓存强制重建；去掉 `--force` 是无变更复跑。正式比较必须记录输入 receipt、全部阶段、完整 wall 和后台压力，并核对事实/FTS 内容；不能只比较 pipeline 内部计时。基线 harness 另有每 2 秒内存采样和每 30 秒系统压力采样，上述最小命令不含该监控开销。

## 已取得结果

| 样本 | 完整 wall | 资源阶段 | 说明 |
|---|---:|---:|---|
| 全局实际安装 1.6.12 | 812.039 s | 480.952 s | 复现用户超过 13 分钟；其源码与 HEAD 不同 |
| 当前 HEAD 修改前 | 859.688 s | 331.618 s | 解析后启用 main-thread inspector；含输入 receipt 修复 |
| 资源优化后第一轮 | 477.934 s | 123.378 s | 不启用 profiler；未达到目标 |
| 资源 + CSV 优化第二轮 | 436.177 s | 85.152 s | 独立空索引/解析缓存；未达到目标 |
| 优化后有缓存强制重建 | 620.707 s | 200.539 s | parse-cache 命中，parse 12.166 s；I/O 波动明显 |
| 无变更复跑 | 115.326 s | 不运行 | 核验输入 111.661 s，Already up to date；不计冷构建达标 |

第一轮解析从 112 s 降到 43 s，但本次没有修改 parser，不能将此部分归因于代码优化。系统压力、OS 缓存、profiler 都影响跨轮 wall。最强因果证据来自下面的局部复现及结果一致性比较。

## 保留的改动

1. Unity 流式行读取：完整落在 64 KiB chunk 内的行直接解码；跨 chunk/超长行保留原有安全处理。10 万行样本 Buffer 分配由 200,110 次减至 330 次（106.7 ms → 37.2 ms）。
2. discovery/lightweight binding 按 chunk await、chunk 内同步迭代，避免每行 async-generator 往返；不缓存全文件或行数组，保留 abort、关闭、行号、UTF-8、CRLF、超长引用行拒绝语义。discovery 重用正则且显式重置 lastIndex，大小写和多 GUID 语义有测试。
3. CSV File 内容有界预读：最多 32 文件，并根据文件接收上限约束批次（默认 16 文件 / 8 MiB 原始输入预算；单文件上限高于 8 MiB 时退化为一次一个文件）。仍使用原 cache/文件大小检查、内容变换、节点顺序、去重和写入回压。真实 155,806 File 节点导出 33.715 s → 15.387 s；CSV SHA-256 均为 `4eca53ee82e2e075f2ab9f7dba2766cba58c3ce109eaebdaee6218a4f896f8e8`。

不是总内存 8 MiB 保证：现有 3000 条内容缓存、字符串/lines 展开、图与数据库仍占用内存。本改动约束的是新增预读并发。

## 验证证据

- Unity 相关 75 个 node:test 通过；输入 snapshot/一致性 7 个 Vitest 通过；CSV 30 个 Vitest 通过。
- 新分配次数用例在旧实现失败；CSV 并发用例在旧实现观测峰值 1 而失败，新实现通过。
- build、`npx tsc --noEmit`、`git diff --check` 通过。
- source → optimized / optimized2 / warm：361,857 条 Unity/过程步骤/runtime-root CALLS 事实的规范化哈希多重集一致，包含 reason/confidence/step；完整 parity seed、File 清单、fileHashes、输入 receipt、stats、capabilities、资源失败记录、contentRetention/ftsProfile/analysisFeatures/indexCoverage 一致。
- 图统计：278,531 nodes / 841,741 edges / 7,700 communities / 2,400 processes；源文件统计 137,313，含补充资源的 File 节点为 155,806。
- 输入 receipt：164,024 文件，digest `33042ff2174db8011fd7501cb2c907405cbdb6181d7e3607ac18fe5d7037e1db`。

## 排除的方案与限制

- `--cpu-prof` 继承到 worker 的样本在 worker 启动阶段挂起，已终止并排除；保留 source-profiler-aborted 记录，不参与性能结论。
- FileHandle.read 替换 ReadStream：真实资源文本完全一致，但暖缓存重复测量没有稳定收益，未修改产品。
- hashInputFiles 替换只在首次测量显著更快，重复流式读取后差异很小，未修改产品。
- 没有缩小 scope、禁用资源、取消输入复核、减少 FTS 内容或把热缓存时间冒充冷构建。
- 仓库自身图索引严重过期。按要求先做 impact，相关符号结果 UNKNOWN/partial，以完整文本调用点核对补充；UNKNOWN 不是低风险证明。未擅自重建该索引，也未提交代码。

## 第二轮冷构建剩余耗时

| 阶段 | 秒 |
|---|---:|
| 开始输入核验 | 33.044 |
| scan | 13.501 |
| parse | 66.887 |
| scopeResolution | 48.102 |
| unity-resources | 85.152 |
| CSV/COPY | 34.587 |
| full FTS（日志事件起止） | 67.914 |
| 发布前输入复核 | 72.868 |

上述核心阶段合计约 422 秒，另外包含其他派生阶段、初始化、发布和退出。单独优化已确认的资源/CSV 热点不足以到达 180 秒，不能把尚未测量的改造收益当作承诺。

热构建初始输入核验出现 139.765 秒波动；短时 macOS sample 记录主线程主要在 kevent、4 个 libuv worker 主要在 read，表明该时段主要等待文件 I/O。这不是死锁，也不能用 parse-cache 命中推断整体 wall 更短。

热构建没有证明稳定的整轮加速。其输入核验两次分别 139.765 / 51.711 秒、资源 200.539 秒、CSV/COPY 54.585 秒，明显不同于冷构建的 33.044 / 72.868 秒、85.152 秒、34.587 秒。两轮均保留全量内容核验，系统缓存/压力未受控；只能对局部 allocation / async 调度 / 串行读取的减少作确定归因。热构建开始阶段使用过 1 秒 macOS sample，未启用 JS profiler。

## 收尾与交付状态

- 无变更复跑退出 0，未运行 pipeline；metadata 字节对应 JSON 与运行前完全一致，独立数据库 inode/mtime/size 不变。harness 的 `eligibleForTarget` 明确排除 warm/noop，避免把无变更小于 180 秒当作全量达标。
- neonspark HEAD、工作区 status、原 `.gitnexus` metadata/seed 哈希和数据库 inode/mtime/size 均与实验开始记录一致。
- 保留修改前源码基线 source/index 和最终 optimized2/index；清理本次创建的 baseline/index、optimized/index 以及两份 CSV 局部实验输出，保留对应日志、计时、哈希/事实导出与 invocation。
- 基线提交只包含本次改动与记录；未发布、未替换全局 CLI。没有修改 CLI/MCP 参数、对外契约或阶段类型，因此无需修改安装 skills；Unity 实现真理源已同步。
- 测量阶段完成 112 项相关测试、类型检查、构建及真实仓库多轮结果对照；提交前全量测试结果另记基线提交验证记录。没有跨硬件复测或清空 OS 缓存，不能保证其他机器上的耗时。
- 下一步优先解决输入核验 I/O 和 full-content FTS 的成本，再评估资源扫描并发/复用及 scope-resolution；这些都需要保持当前内容一致性与完整性检查，不应以跳过检查达标。

## 提交前验证（2026-10-23）

- Node 24.15.0：`npm test` 完整运行 1047 秒，1113 个文件通过、13 个跳过；22,060 个用例通过、83 个跳过，唯一失败是历史归档日志含 raw NUL 的 source-hygiene 检查。
- 已确认该归档文件与原 HEAD 完全一致；仅将 44 个 raw NUL 分隔符改为可见 `\0`，内容顺序和其余字节不变。重新运行 `npm test -- test/unit/source-control-bytes.test.ts`，9/9 通过。没有在此文本修复后重复整个 17 分钟套件，也不把首次完整运行称为全绿。
- 格式化后重跑 Unity 定向 node:test，75/75 通过；build、Node 24 类型检查、ESLint（0 errors）、diff whitespace 检查通过。首次使用默认 Node 26 的全量运行已主动取消，不计为通过。
- 提交前执行 `detect_changes` 的 all 和 staged 检查，risk 为 medium。旧索引只给出有限的 resolver 映射，不能证明完整调用覆盖；沿用先前调用点核对和真实 neonspark 事实对照作为补充证据。
- 本次仅整理既有实现、仓库要求的格式、记录和历史文本卫生；没有重新运行 neonspark 长时性能基准。表中性能数字来自前一轮实测，不能视为本次格式化后的新测量。

## 重复测量条件决议（2026-10-23 续查）

对应决策票：[建立可比较的重复测量条件](measurement.md)。本节记录新一轮事实，以上历史记录不改写。

### 输入变更与失败样本

首次重复构建 `repeat-a1` 在 422.168 秒以 exit 1 结束：`Unity input-failure: inputs changed during analysis; previous index retained.` 构建前检查确认原业务工作区与历史记录一致；构建后发现 11 个字体资源由已修改变为干净，HEAD 未变。该轮不能计为成功基线，失败日志完整保留，不静默剔除。随后只读探针对旧 receipt 的断言也失败，确认内容身份已改变，而非只看 Git HEAD 猜测。

用户明确选择“以当前输入建立新基线”。新 receipt：version 1，164,024 文件，digest `36bee572b3d501679bc11429fbf47b612e0fa9efc78d85d3a7115ba39a74c416`。旧 `baseline.json` 的 digest `33042ff2…` 和 436.177 秒保留为历史，禁止跨输入直接计算代码收益。

### 三轮独立冷构建

产品源码保持 `bbf05f4eeb9630fecd531010edab9f1e7f674500`，工作区 HEAD 为仅增加路线图文档的 `1c9138747f2533b1a2463a6128f0736aa5660807`；重建 dist 后未修改产品源码。Node 24.15.0、原 scope/defines、full content/FTS、无 embeddings、相同堆参数和监控开销。每轮独立空 storage/parse-cache/home；不清 OS 缓存，不停止用户后台进程，不并行运行性能实验。

| 阶段/指标 | current-a1 | current-a2 | current-a3 |
|---|---:|---:|---:|
| 完整 wall | 464.367 s | 461.322 s | 371.989 s |
| 启动输入核验 | 34.013 s | 35.145 s | 35.720 s |
| scan | 11.501 s | 11.808 s | 11.470 s |
| parse | 37.651 s | 65.266 s | 50.662 s |
| scopeResolution | 33.016 s | 38.831 s | 34.294 s |
| unity-resources | 83.427 s | 85.188 s | 81.503 s |
| CSV/COPY | 32.551 s | 37.986 s | 32.794 s |
| FTS 全部 | 57.989 s | 107.131 s | 62.008 s |
| 其中 File.file_fts | 45.341 s | 75.701 s | 43.236 s |
| 发布前核验 | 161.703 s | 65.304 s | 52.002 s |
| 进程 peak footprint | 12.40 GiB | 12.05 GiB | 12.27 GiB |
| 整机 swap-in 增量 | 9.56 GiB | 20.65 GiB | 6.12 GiB |
| 整机 swap-out 增量 | 10.70 GiB | 24.97 GiB | 8.11 GiB |
| 整机 page-in 增量 | 35.62 GiB | 43.09 GiB | 30.39 GiB |

三轮 exit 0，receipt、fileHashes、stats、coverage、capabilities、contentRetention、ftsProfile、analysisFeatures、analysisInputFingerprint 一致，Unity resource failures 均为空。统计为 278,531 nodes / 841,741 edges / 7,700 communities / 2,400 processes；所有 22 个 FTS 表均有 ready 日志。FTS 计时按日志事件，整机换页差值不是索引器专属 I/O。

三份独立 DB 的 361,857 条 Unity/过程步骤/runtime-root CALLS 事实哈希多重集、155,806 个 File 清单和完整 parity seed 均一致。新输入测量前后的目标 HEAD、working-tree status、原索引 metadata/seed 哈希与数据库 inode/mtime/size 一致；只写独立实验目录。构建及文档 whitespace 检查通过。本轮未改产品代码，未重复全量单测/类型检查；未做新的中英文/尾部关键词召回实验，FTS 优化票仍需完成这些验收。

中位数 **461.322 秒**，范围 **371.989–464.367 秒**，跨度 **92.378 秒**。三轮均超过 180 秒。前两轮总时长接近，但 FTS 与发布前核验的波动相互抵消，不能据总 wall 接近推断压力相同。后台逐进程负载未采样，现有整机换页数据明确不稳定；本组可用于确定瓶颈与噪声量级，**不能单独用于归因小幅代码收益**。不把第三轮更快算成代码优化。

### 重复枚举假设的检验

只读探针复用当前 snapshot 实现，添加阶段计时、readdir 计数和 ignore 回调累计计时；未改产品文件。三次 glob 分别读取 21,504 / 8,127 / 19,085 个目录，后两次重复访问已见目录 8,127 / 17,324 次，确有重复遍历。但 `source-glob` 的 9.710 秒中，ignore 回调累计 9.093 秒：`ignored` 调用 679,947 次，`childrenIgnored` 调用 8,170 次。说明这一段主要是过滤计算，不能将整个 glob wall 当成目录 I/O。

因此否决“直接合并三种目录遍历”为当前首选实现。它需要处理不同 dot/ignore/error 语义，且未证明大收益。改用更小的单变量实验：只对一次 glob 内相同 Path 对象的 `ignored` 返回值使用 WeakMap 缓存，保持 `childrenIgnored`、readdir 和三种选择规则不变。

| 顺序配对 | 原实现 A | 局部缓存 B |
|---|---:|---:|
| 1 | 10.789 s | 8.653 s |
| 2 | 9.948 s | 8.851 s |
| 3 | 9.822 s | 9.004 s |

六轮 source glob 均得到 195,180 个候选文件，规范化清单 SHA-256 均为 `2c9846ddb8edda5fc760d954e042e1b373bcd6a8f2559bd5656214110485a1af`，readdir 均为 8,127。B 每轮命中 390,360 / 679,947 次（57.4%）。中位数降低 **1.097 秒 / 11.0%**。这是局部清单等价和时间证据，不是完整内容 receipt/完整 wall 的收益证明；同进程交替运行未隔离 GC，结束 RSS 从约 0.72 到 1.54 GiB 漂移，不能证明缓存的峰值内存无回归。

### 决议与下一步

- P0 已取得重复基线和可复跑模板，可以结票；它的答案包括“不稳定样本不能用于小收益归因”，不是宣称环境已被控制。
- 下一主研究项改为[降低 full-content FTS 构建成本](fts.md)：File 表占新基线 FTS 的约 70–78%，并与发布前核验的大幅波动共同指向需要分辨 native 工作、JS/native 内存驻留和文件等待。先测量，不能把换页相关性当成因果，也不先假设某对象可以安全释放。
- [降低输入核验 I/O 成本](input-validation.md) 保留局部 ignore 缓存候选；每次快照约 1.1 秒的局部收益优先级低于数十秒波动。正式实现前仍需 impact、否定规则/错误路径测试、独立峰值内存和完整 A/B；本轮未采纳产品改动。
- 后续 A/B 必须使用上述新 receipt；每臂至少三轮、串行交替、空索引/解析缓存；完整记录压力与阶段计时。若背景压力持续不同，应报告“完整收益未证实”，不能只选快轮次或降低完整性门槛。

本地资产均位于 `.scratch/neonspark-perf-20261023/`：`repeat-a1/`（失败）、`current-a1/` 至 `current-a3/`（invocation/result/log/memory/pressure/metadata）、`current-baseline-summary.json`、`enumeration-probe.log`、`ignore-ab.mjs` 和 `ignore-ab.log`。复跑使用 `run-current.mjs` 的新目录约束；已有名字拒绝覆盖，新实验应改为新的样本 ID。完整调用参数见各 invocation.json；这些大型本地资产不随 Git 提交，本节保留关键测量值。

## FTS 与核验压力续查（2026-10-23）

对应调查票：[降低 full-content FTS 构建成本](fts.md)。本轮继续使用新 receipt `36bee572…c416`，产品源码和原索引不修改；所有写入性探针仅操作已有实验 DB 的独立副本。

### 既有三轮的进程级 CPU 与 JS 堆

将输出事件与每 2 秒的主线程 memory/cpu 采样对齐。CPU 是**整个进程**的 user+system，包括 native、GC 等，并非主线程或纯哈希 CPU；取阶段内部首尾样本，覆盖略短于完整阶段。不把 worker 的进程 CPU/RSS 重复相加。

| 指标 | current-a1 | current-a2 | current-a3 |
|---|---:|---:|---:|
| File FTS wall | 45.341 s | 75.701 s | 43.236 s |
| 内部采样 CPU | 88.777 s | 95.365 s | 91.260 s |
| 内部采样平均使用核数 | 2.02 | 1.31 | 2.17 |
| File FTS 期间 JS heapUsed | 1.954 GiB | 0.543–4.366 GiB | 2.022 GiB |
| 发布前核验 wall | 161.703 s | 65.304 s | 52.002 s |
| 内部采样 CPU | 152.244 s | 165.442 s | 150.353 s |
| 内部采样平均使用核数 | 0.96 | 2.55 | 2.92 |

相近 CPU 消耗对应大幅不同 wall，支持进一步调查调度、I/O 和换页等待；不能仅凭这些采样把等待全部归因于 swap，也不能分离 native/GC 各自的精确份额。第二轮 FTS 期间堆显著下降，另两轮基本保持不变，提示临时对象回收时机值得实测；heapUsed 不等于必需存活数据，更不是 native 内存。

### File 内容分布

只读查询 `MATCH (f:File) RETURN f.filePath, size(f.content)`，汇总引擎的字符长度，不冒充 UTF-8 字节。

| 类型 | File 行数 | 内容字符数 |
|---|---:|---:|
| .prefab | 7,953 | 432,345,948 |
| .meta | 128,032 | 350,510,173 |
| .asset | 10,471 | 131,913,936 |
| .cs | 9,281 | 59,855,815 |
| .unity | 69 | 4,586,952 |
| 合计 | 155,806 | 979,212,824 |

最大单行内容 522,896 字符，最大的十行合计约占 0.53%；不是一两个超大文件主导。prefab/meta 合计约 80%，但删除其内容或改为 name-only 会违反完整搜索契约。既有 `gitnexus/bench/analyze-phase-breakdown.md` 已测并否决并行 FTS、增大连接线程数、删减 File 内容等方向，本轮不重复采用这些方案。

### native buffer pool：降低预算的失败边界

当前 `estimateBufferPool(278531 + 842448)` 在本机返回 8 GiB，hintless 打开为 2 GiB。用 macOS `cp -c` 从 `current-a3/index/lbug` 创建独立副本，每个探针新进程打开，然后调用原有 `createSearchFTSIndexes` 重建全部表；没有 pipeline JS 堆，没有 COPY，不是完整冷构建。重建前的内容聚合和查询会预热 DB，因此不能与冷构建直接比较速度。

| 池预算 | 结果 | 进程 peak footprint |
|---|---|---:|
| 2 GiB | File.file_fts 报 `Buffer manager exception: Unable to allocate memory! The buffer pool is full and no memory could be freed!` | 5.22 GiB |
| 4 GiB | 同样在 File.file_fts 耗尽池；拒绝视为完整成功 | 6.92 GiB |
| 8 GiB | 22 表全部重建、catalog/columns 验证通过；FTS 总计 76.949 s，其中 File 53.104 s | 8.90 GiB |

8 GiB 成功样本为 `fts-pool-8c`：重建前后 File 行数及内容长度合计一致，英文 `MonoBehaviour`、`guid` 的前 20 个结果 ID 一致，中文 `按钮` 的 12 个结果 ID 一致。这个检查不是全部内容的逐字节哈希，也未覆盖大文件尾部查询，不能替代产品优化验收。

结论：**否决直接将当前 corpus 的 FTS 池降到 2/4 GiB。** 8 GiB 是本轮已通过点，不是证明它是理论最小值；6 GiB 等未测。不能将普通查询的 hintless 预算套用到 FTS 构建，更不能据此降低全程 COPY 预算。

保留实验失败：`fts-pool-8a` 因 Node 强制 reflink 返回 ENOSYS 未运行 FTS；`fts-pool-8b` 完成重建/断言后因 BigInt 结果序列化失败，未计正式成功样本。修复记录脚本并自检后才运行 8c。所有样本独立目录，不覆盖失败记录；正常退出前 checkpoint，再 process.exit 回收 native 资源，未强杀 worker 或更改 native destructor 策略。

本节原始资产：`.scratch/neonspark-perf-20261023/fts-phase-telemetry.json`、`fts-content-inventory.json`、`fts-pool-probe.mjs`、`fts-pool-*` 目录及对应日志。查询实验副本时 adapter 将缺失 shadow 的 WAL sidecar 隔离留档；仅涉及 scratch DB，未触碰 neonspark 原索引。

### FTS 前 GC：回收量成立，稳定提速未成立

在隔离的 `gc-probe` CLI 包中仅添加一个诊断块：CSV/COPY 完成后、FTS 开始前调用一次 `global.gc()`，记录前后 memoryUsage；以 `--expose-gc` 启动，先验证该参数与 worker 启动兼容。原产品源码和原 dist 均未修改。图检索仍落后 1760 commits，`runFullAnalysisInner` impact 为 UNKNOWN；补查当前源码确认其封装入口及图数据后续用途，未把 UNKNOWN 当作低风险。

| 指标 | gc-before-fts3 |
|---|---:|
| GC 耗时 | 0.366 s |
| heapUsed 前 → 后 | 1.968 → 0.548 GiB |
| heapTotal 前 → 后 | 2.381 → 1.144 GiB |
| RSS 前 → 后 | 2.436 → 3.457 GiB |
| 完整冷构建 wall | 457.981 s |
| File FTS / 全部 FTS | 40.378 / 63.928 s |
| 启动 / 发布前核验 | 32.686 / 165.398 s |
| 进程 peak footprint | 11.949 GiB |

确认 **1.420 GiB 的 JS 临时对象在该边界可回收**，但 RSS 即刻上升，不能把逻辑堆减少等同于物理驻留内存下降。GC 可能触碰已换出的页，当前采样不能证明具体机制。此探针在 native DB 打开和 COPY 之后执行，无法消除之前已经出现的峰值；不据此推断“提前清空 graph”安全。

完整 wall 仍在未改代码的 371.989–464.367 秒范围内，发布前核验 165.398 秒也没有改善证据。**不采纳“仅加一次强制 GC 就能稳定提速”的结论。** 单个诊断样本没有控制后台压力；要判断提前回收是否能降低峰值，需在 DB 打开前另设单变量实验，而非拿这轮与最快/最慢基线挑选比较。

该轮 exit 0，新 receipt、fileHashes、stats、155,806 个 File 清单、完整 parity seed 及 361,857 条 Unity/过程步骤/runtime-root CALLS 事实多重集与 current-a1 一致；原目标 HEAD、工作区状态、原索引 metadata/seed 哈希、DB inode/mtime/size 均未改变。保留 `gc-before-fts3/` 的 invocation/summary/日志/导出事实。早先 `gc-before-fts/`、`gc-before-fts2/` 分别因临时包缺 vendor/leiden 和 hooks/claude 资源在分析前失败；补齐 package.json 声明资源并通过完整 CLI 模块导入检查后才运行有效样本。这些失败未计入性能结果。

### 下一调查顺序

1. **先拆解真实发布前核验的 165 秒。** 在同一完整构建的首次/最终 `captureUnityInputSnapshot` 内分别记录枚举、ignore、metadata、文件读取/哈希、排序/receipt 聚合、进程 CPU 与堆；带上读取字节、文件数、并发和 native DB 所在阶段。独立进程快照不能替代这个测量。判据：确定额外 wall 落在哪个具体子阶段，而不是继续把所有等待叫作“FTS 内存压力”。
2. **验证 native 工作集与核验的生命周期重叠。** 保持 8 GiB 已通过预算、完整 FTS 和两次哈希，比较核验时 writer/native DB 仍存活与真正释放后的情况。必须先设计安全的 checkpoint/进程退出与暂存 DB 所有权；`closeLbugBeforeExit()` 只 checkpoint，故简单把核验移到它后面不会释放内存。成功核验前不得发布，失败仍保留旧索引；不能用强杀 worker 或提前 native destructor 绕过已知安全约束。
3. **定位临时堆的产生阶段。** 在 pipeline 返回后、DB 打开前及 COPY 后比较存活堆和可回收量，再用分配采样定位来源。优先减少分配和缩短临时缓存生命周期。`run-analyze.ts` 的 embeddings、关系完整性检查及 `countCallsByLanguage` 后续仍使用 graph，不得直接清空；增量路径的 deferred phases 也可能保留上下文。当前证据未定位到具体分配者，不直接归罪于 CSV 或 parser。

本轮只完成调查和诊断实验，未形成通过完整重复 A/B 的产品优化；FTS 票保持 open，释放认领。2/4 GiB 预算和直接强制 GC 均不作为已采纳方案。保留 full content/FTS、输入失败传播、embeddings 保留、native shutdown 和原子发布契约；后续仍需峰值内存、错误路径与完整搜索召回验收。


## 完整构建内的核验分段（2026-10-26）

继续「降低 full-content FTS 构建成本」调查。源码 HEAD 仍为 `1c9138747f2533b1a2463a6128f0736aa5660807`，生产 runner 与 current-a3 SHA 一致；目标 HEAD、工作区与原索引检查通过。图 impact 对 `captureUnityInputSnapshot` 仍为 UNKNOWN，补查当前源码的首次/发布前两处调用及 hashInputFiles；没有修改产品函数。临时 CLI 仅在 snapshot 内加入阶段 wall、进程 CPU、memoryUsage 与读取计数；不加 GC，不改变并发、buffer pool、读取/失败语义或发布顺序。哈希一致性与缺失文件失败自检通过。

### 同一次构建的两次核验

独立空索引/解析缓存样本 `snapshot-phases-a1` 成功退出，完整 wall **329.161 秒**，峰值 footprint **12.495 GiB**，22 个 FTS 表 ready。两次核验均读取 **164,024 文件、6,201,643,401 字节、247,169 个 stream chunk**，并发仍为 16；receipt 与已批准基线完全一致。

| 子阶段 | 首次 wall 秒 | 发布前 wall 秒 | 首次进程 CPU 秒 | 发布前进程 CPU 秒 |
|---|---:|---:|---:|---:|
| candidate glob | 2.183 | 2.121 | 2.208 | 3.655 |
| 资源筛选、ignore 初始化及 source glob | 9.315 | 10.414 | 10.035 | 10.464 |
| source 筛选及 resource metadata | 0.352 | 0.381 | 0.366 | 0.389 |
| project glob | 2.017 | 2.916 | 2.495 | 3.190 |
| script metadata | 0.194 | 0.193 | 0.175 | 0.196 |
| controls | 0.001 | 0.001 | <0.001 | <0.001 |
| 输入排序 | 0.005 | 0.007 | 0.005 | 0.007 |
| 文件 stat、读取与哈希 | **17.649** | **29.270** | **34.685** | **121.884** |
| receipt 聚合与 reusable 判断 | 0.080 | 0.100 | 0.089 | 0.296 |
| 完整 snapshot（含插桩开销） | **31.798** | **45.403** | — | — |

发布前比首次多 13.605 秒，其中哈希阶段多 **11.621 秒（约 85%）**，额外进程 CPU 为 **87.199 秒**。这轮多出的成本主要落在 stat/stream/hash 这一段，而不是排序/receipt 聚合；本轮没有单独计时 ignore 回调或把 stat、读取、SHA 运算拆开，不能声称已定位到某个底层操作。

发布前核验开始 heapUsed **0.636 GiB**，经过枚举与 metadata 到哈希前升至 **2.048 GiB**，哈希完成后降至 **0.641 GiB**。首次对应哈希前/后为 **0.526 / 0.104 GiB**。这些是边界时刻的已用堆，不能当作 retained heap 或直接算作该段总分配量。进程 CPU 包含所有线程的 GC/native/其他工作，不是 SHA 函数独占 CPU；CPU 放大与堆下降支持优先验证 GC/分配假设，但还不是归因证据。

**没有复现此前 165.398 秒的慢核验，也没有证明 native DB 是或不是根因。** 此次没有性能优化，329.161 秒低于旧三轮范围只能作为环境波动/诊断样本，不能宣称提速，更未达到 180 秒目标。不能将本轮 13.605 秒差额推广为慢样本的全部差额。

### 调整后的下一方向

1. **优先测 snapshot 自身的临时分配及 GC，尤其是枚举结束到文件哈希这一段。** 在相同完整构建插桩上增加 GC 事件/分配采样，覆盖首次与最终核验；区分枚举遗留对象、每文件 ReadStream/异步迭代器分配及其他存活堆。先争取捕获慢核验，不能只用独立进程微基准解释它。不要先加一次强制 GC 就作为修复。
2. 若采样确认分配成本，最小候选是 **有界读取缓冲复用、减少每文件 stream 临时对象**，或缩短已无用途的枚举中间对象存活期。两者分别验证，不一并重构。必须保持完整字节 SHA、稳定排序、读取前后 size/mtime/ctime/ino 校验、并发有界及整批 settle 后错误传播；覆盖空文件、超大文件、短读、途中变更和读取失败。历史 FileHandle/read/hash 替换在暖缓存重复测量中没有稳定收益，仍保留该否决；只有新增分配/GC 证据能解释此前差异，才值得重试缓冲方案。本轮未实现或证明这个候选能改善完整构建。
3. **native 工作集生命周期实验保留为后续分支**：若相同读取方案在受控 GC 后仍有明显慢化，再比较安全退出 writer 后的核验。现有 closeLbugBeforeExit 仅 checkpoint，不释放 native；必须保留暂存 DB、核验后发布、失败保留原索引与安全退出，不提前调用已知危险 destructor。先完成较小范围的归因，再决定是否值得改进程边界。

### 验证和留档

与 current-a1 比较：receipt、全部 metadata fileHashes、stats、155,806 File 清单、完整 parity seed、361,857 条 Unity/过程步骤/runtime-root CALLS 事实多重集一致。未对全部通用边及全部 FTS 内容逐字节比较；22 表 ready 不是完整搜索召回验收。原目标 HEAD、工作区状态、原索引 metadata/seed 哈希与 DB inode/mtime/size 未变，生产 runner SHA 未变。

原始数据：`.scratch/neonspark-perf-20261023/snapshot-phases-a1/` 下的 invocation、result、analyze.log、memory.ndjson、pressure.log、snapshot-summary.json、semantic-comparison.json 及事实导出；诊断包 `snapshot-phase-probe-20261026/`，runner `run-snapshot.mjs`。仅本地诊断和文档更新，不提交大文件，不发布/替换 CLI。未修改产品代码，未运行全量单测/类型检查；完成插桩语法、哈希/失败断言、完整构建和语义对比。FTS 票仍 open，释放认领。


## GC 归因与小文件缓冲候选（2026-10-26）

### 诊断方法与边界

在上一轮分段诊断副本上，仅在首次/最终 snapshot 期间启动主线程 inspector CPU 采样（10 ms）、HeapProfiler 抽样分配（平均 1 MiB，包含已被 major/minor GC 回收的对象）及 perf_hooks GC observer。结束采样后写盘；不在完整构建中主动调用 GC。采样器自检用临时对象+显式 GC 确认回收后的分配栈仍可见，该强制 GC 只在独立自检进程执行。

A = `snapshot-gc-a1`，B = `snapshot-small-buffer-b1`，各自独立空索引/解析缓存。B 与 A 的唯一业务逻辑差异是临时副本 hashInputFiles 的 ReadStream 参数：`highWaterMark: Math.max(1, Math.min(64 * 1024, before.size))`；不改变并发 16、完整读取到 EOF、SHA、前后 stat 比较或整批 settle 错误传播。产品源码及生产 dist 未改。图对 captureUnityInputSnapshot/hashInputFiles 均返回 UNKNOWN，补查实际调用及现有测试，不将空 caller 当作安全证明。

### 测量结果

| 指标 | A 原方案 | B 按文件大小限制缓冲 |
|---|---:|---:|
| 首次哈希 wall / 进程 CPU 秒 | 20.052 / 39.226 | 17.849 / 23.508 |
| 首次哈希 major GC 次数 | 452 | 127 |
| 最终哈希 wall / 进程 CPU 秒 | 30.828 / 118.540 | 20.256 / 44.559 |
| 最终哈希 major GC 次数 | 231 | 67 |
| 最终哈希 GC observer 时长秒 | 4.936 | 2.172 |
| 最终哈希主线程 GC 采样估计秒 | 7.664 | 3.502 |
| 最终哈希 createUnsafeBuffer 主线程采样秒 | 4.613 | 0.740 |
| 首次完整 snapshot 秒 | 34.555 | 32.028 |
| 最终完整 snapshot 秒 | 45.964 | 36.879 |
| 完整构建秒 | 444.073 | 412.676 |
| 峰值 footprint GiB | **11.282** | **12.438** |

两轮两次 snapshot 均为 **164,024 文件、6,201,643,401 字节、247,169 chunk**。A 最终哈希的 GC 与 Buffer 分配采样明显高于首次；部分 major GC 事件带 ALL_EXTERNAL_MEMORY 标记。该标记不是完整触发原因证明；observer 时长、CPU 采样估计和全进程 CPU 是不同口径，不能相加，也不能据此把全部 CPU 放大量归为 GC。此次仍未复现 165 秒慢核验。

抽样 JS 分配估计 A 首次/最终约 9.22/9.29 GiB，B 约 8.90/9.18 GiB；这是抽样加权分配估计，既非存活堆，也不覆盖 Buffer backing store 的全部外部字节。热点包括 glob/readdir、source 路径筛选、stat 等。B 的主要证据是 Buffer/GC 行为改变，并非消除了大多数 JS 对象分配。

### 为什么这个候选比重写读取实现更小

核对本机 Node 24.15.0 的 internal/fs/streams 实现：ReadStream._read 先按请求大小分配 Buffer，短读后再分配实际长度缓冲并复制。一个 512 字节临时文件中，默认方式调用 Buffer.allocUnsafeSlow 三次，累计 **131,584 字节**；按文件大小限制后两次、累计 **1,024 字节**，两者 SHA 一致。这是特定小文件的累计分配实测，不冒充整个 corpus 的内存峰值节省。

已有 stat.size 可用于控制缓冲，不需要改为 FileHandle、自建读取循环或更改核验契约。历史 FileHandle/hash 替换没有稳定收益的否决仍成立；本轮的新证据只支持这个更窄的缓冲候选。B 小型断言覆盖空文件、1/512 字节、64 KiB 边界和 131,073 字节内容哈希一致、缺失文件失败、读取前后变更失败。

### 决议与下一步

**将“按文件大小限制哈希读取缓冲”提升为下一优先验证项，交给「降低输入核验 I/O 成本」继续；暂不正式采纳。** 最终哈希 wall 减少 10.573 秒、CPU 减少 73.981 秒，major GC 次数约少 71%，已具备值得验证的机制证据。

不能将完整 wall 少 31.397 秒宣称为改动收益：只有顺序 A→B 一对、带采样器、后台压力未受控；scopeResolution 同时从 36.351 秒变成 92.013 秒，COPY 从 63.078 秒变成 33.353 秒。**B 峰值反而高约 1.156 GiB，未通过内存不恶化的验收要求**；这也不能由单对样本直接认定是缓冲改动导致，需要重复与阶段对齐。

下一轮去掉 CPU/heap 采样器，保留轻量阶段与内存记录，以相同输入交替 A/B 重复至少三对，分别报告首次/最终核验、整体 wall 和峰值；必要时逐轮校验后清理可重建 scratch DB，保留日志与事实。若整体验证收益不稳定或内存恶化，保持候选状态或否决，不扩大重构。正式落地前补短读、权限/中途读取失败、文件增长/同路径替换及已有输入核验回归；极小/空文件若读取中增长，极小 highWaterMark 可能让失败检测变慢，需要评估缓冲下限。保留 full FTS/内容、输入变更拒绝发布、native 安全退出与原子发布。

FTS/native 工作集生命周期调查继续保留，暂居其后；不能用关闭 FTS、降低已失败的 buffer pool 或移动到仅 checkpoint 后的核验替代这项验证。

### 一致性与资产

A/B 均 exit 0、22 FTS 表 ready，与 current-a1 的 receipt、metadata fileHashes、stats、155,806 File 清单、完整 parity seed、361,857 条 Unity/过程步骤/runtime-root CALLS 事实多重集一致；原 neonspark 工作区/索引未变，生产 runner SHA 未变。不等同于全部通用边及全部 FTS 内容逐字节检查，未跑完整搜索尾部召回验收。

本地资产：`.scratch/neonspark-perf-20261023/` 下 `snapshot-gc-a1/`、`snapshot-small-buffer-b1/` 的 GC/CPU/heap profiles、profile-summary.json、日志、metadata 与导出事实；`small-buffer-comparison.json`、`small-buffer-selfcheck.json`、`check-small-buffer.mjs`、`snapshot-profiler.cjs` 和诊断包。

空间管理：只移除了本任务可重建的 `current-a2/index/lbug` 与 `gc-before-fts3/index/lbug`，各自新增 database-retirement.json；其报告、metadata、事实/seed 导出保留，current-a1/a3 DB 保留。没有删除失败样本或用户原索引。最初一次 compare 命令 cwd 错误未执行比较，修正 cwd 后通过；不计测量失败。

本轮未修改产品代码、未提交/发布，未跑全量单测或类型检查。完成采样自检、小文件分配/哈希/失败断言、两次完整构建及语义对比。FTS 票保持 open，释放认领；下一主项转回输入核验候选的重复验收。


## 无采样器三对验证与存储等待转向（2026-10-26）

### 决议

**暂不将小文件缓冲候选合入产品。** 三对完整构建证明了最终哈希进程 CPU 的稳定下降，但没有满足“完整 wall 有重复收益且峰值不恶化”的验收要求。下一主项改为 **源文件访问的操作级等待诊断**；不继续凭单次 wall 调整缓冲/并发，也不把 native DB 存活当作唯一根因。

### 实验条件与结果

沿用相同源码 HEAD、Node 24.15.0、配置与已批准 receipt。A 为原读取方案，B 仅在诊断副本设置 `highWaterMark: Math.max(1, Math.min(64 * 1024, before.size))`。去掉 inspector CPU/heap 采样和 GC observer，保留双方一致的轻量 snapshot 分段及每 2 秒 memory/CPU 记录。顺序 **A1→B1、B2→A2、A3→B3**，每轮独立空索引/解析缓存，不并行运行构建。

| 样本 | 完整 wall 秒 | 首次核验秒 | 最终核验秒 | 最终哈希 wall / 进程 CPU 秒 | peak footprint GiB |
|---|---:|---:|---:|---:|---:|
| A1 | 536.192 | 31.960 | 181.627 | 167.448 / 143.509 | 12.767 |
| B1 | 326.289 | 30.000 | 37.061 | 20.981 / 46.130 | 12.169 |
| B2 | 447.557 | 30.195 | 167.459 | 152.930 / 50.800 | 14.379 |
| A2 | 335.005 | 32.139 | 48.971 | 33.662 / 119.007 | 13.881 |
| A3 | 441.236 | 97.688 | 44.654 | 29.588 / 114.694 | 13.562 |
| B3 | 495.387 | 31.918 | 172.828 | 112.365 / 55.929 | 13.488 |

- 完整 wall 中位数 A **441.236 秒**、B **447.557 秒**；范围分别 335.005–536.192、326.289–495.387 秒。B−A 的三对差值为 **−209.903 / +112.552 / +54.151 秒**，只有一对更快；不能宣称整体验证提速，也不能据这三对推断 B 必然使整体变慢。
- 最终哈希 CPU 中位数 **119.007→50.800 秒，下降约 57.3%**；B 三轮 46.130–55.929 秒，均低于 A 的 114.694–143.509 秒。首次哈希 CPU 中位数也从 32.134 降至 22.935 秒。缓冲/GC 的局部机制证据保留，不因 wall 验收失败而抹去。
- 峰值中位数 A/B **13.562 / 13.488 GiB**，但最大值 **13.881 / 14.379 GiB**，第二对 B 高约 0.498 GiB。不能确认峰值稳定不恶化，也不能从单个峰值反例认定因果。A2/B2 都在 FTS 末段附近出现约 4.2 GiB 的主线程采样堆，高堆并非候选独有；采样 RSS、JS heap 与 time 的 peak footprint 不是同一口径，不能替代其峰值或精确定位 footprint 峰值时刻。

### 慢核验已复现，但并非只有 GC 或 DB 重叠

A1 最终核验 181.627 秒，其中哈希 167.448 秒；B2 即便 CPU 降至 50.800 秒，哈希 wall 仍为 152.930 秒。B3 最终核验中，project glob **46.068 秒 wall / 7.297 秒 CPU**，哈希 **112.365 / 55.929 秒**。等待分散在枚举与读取阶段，不是只存在于 SHA 或 GC。

更关键的是，A3 在 **DB 尚未打开的首次核验**中，candidate glob 用 **53.627 秒 wall / 4.257 秒 CPU**；同一次构建的最终 candidate glob（DB 仍存活）只有 **2.348 秒**。首次 source glob、project glob 也分别用 17.213、8.689 秒。这排除了“所有慢枚举都必须由 DB 存活触发”的解释，但没有证明某个文件系统或设备就是根因。

每 30 秒整机 vm_stat 的相邻窗口中，慢哈希 A1/B2 的 swapin 约 0.354/0.331 GiB；较快 A2 的窗口反而约 0.816 GiB。窗口长度不同、包含邻近阶段，而且是整机计数，不能作进程/源盘归因；现有记录不足以把所有等待称为 swap。pagein 也不是指定设备的读字节。详细窗口边界保存在 buffer-pressure-summary.json。

### 明确源盘与索引盘边界

确认工作区别名 `$NEONSPARK_REPO` 实际指向 **`$NEONSPARK_SOURCE_REALPATH`**。diskutil 报告源卷是 **外置 PCI-Express SSD、Journaled HFS+、disk4s2，分配块 4 KiB**；实验索引位于内置 APFS 数据卷。源卷约 543 GiB 可用，实验盘容量紧张不能等同于源卷容量不足。

此前的耗时/receipt 仍属于同一实际目标，这不是本轮切换了仓库或输入。新增的是环境拓扑记录，见 storage-topology.json。一次短时 iostat 观察到源物理盘约 222.68 MB/s，而首次慢枚举的直接成因未被捕获；该观察不是带宽基准，更不是“外置盘一直很慢”或“HFS+ 有问题”的证据。

### 下一调查方向与判据

1. **在相同真实输入上拆开文件访问等待。** 继续使用独立诊断副本，在 strictGlob 的实际 readdir 回调及 hashInputFiles 的 stat/open/read/close 边界收集调用数、总/分位/最大端到端时延、文件大小分组和少量慢路径；按首次/最终核验分别记录。不要把 16 路并发调用时长相加当 wall，也不要把回调时延直接称为纯磁盘服务时间。
2. **同步记录源物理盘和索引盘的 I/O，以及线程池排队线索。** 区分低 CPU 的等待究竟主要落在目录/metadata、小文件打开关闭、大文件读取，还是 libuv 排队/调度。保留相同读字节和错误传播；先捕获一快一慢样本，再选择单个实现候选。不先加并发、改线程池或迁移文件系统。
3. **声明并记录测量前的 I/O 状态。** 当前 OS cache/后台活动未受控；每轮事实导出与 scratch DB 清理可能影响后续缓存/设备状态，未测得静默窗口。下一阶段先记录源盘/索引盘的测量前活动，再决定更受控的 A/B。不能以本轮总 wall 对小改动做因果归因。
4. 若等待证据指向 DB/内存竞争，再回到 pipeline→DB 的临时堆存活与 native 工作集生命周期实验。继续保留 8 GiB 已通过预算、两次完整内容核验、native 安全退出、核验成功后原子发布；closeLbugBeforeExit 仅 checkpoint 的限制不变。小缓冲保留为 CPU 优化候选，不作为已采纳的耗时优化。

### 正确性、清理与留档

新增独立断言已通过：强制短读后的完整 SHA、初始 0/1 字节文件增长拒绝、同路径同大小替换拒绝、途中 EIO/EACCES 传播、混合成功/缺失批次失败。没有将大小/mtime 替代内容哈希。

六轮均 exit 0、22 FTS 表 ready；每次读取 **164,024 文件、6,201,643,401 字节、247,169 chunk**。与 current-a1 比较，receipt、metadata fileHashes、stats、155,806 File 清单、完整 parity seed 和 361,857 条 Unity/过程步骤/runtime-root CALLS 事实多重集一致。每轮原目标工作区及原索引检查通过；未改产品源码、生产 dist、全局 CLI 或原目标索引，未提交/发布。完整 FTS 查询召回及全部通用边逐字节比较不在本轮覆盖内。

资产位于 `.scratch/neonspark-perf-20261023/`：`buffer-repeat-plan.json`、六个 `buffer-repeat-*` 样本目录、`buffer-repeat-results.json`、`buffer-repeat-summary.json`、`buffer-repeat-regression.json`、`buffer-pressure-summary.json`、`storage-topology.json`，以及对应 runner/比较/断言脚本。运行结束后的 B3 实验 DB 保留。

为满足磁盘空间条件，移除了已验证的 snapshot-phases-a1/snapshot-gc-a1 两份可重建 lbug；本轮前五个样本在事实导出/校验后回收各自独立 index 目录，保留 metadata-after、压缩 seed、事实多重集、File 清单、阶段/压力日志，并记录 database-retirement.json。失败样本、current-a1/a3 基准 DB 与用户原索引未删。清理只发生在样本退出并验证之后。

结论：完成三对验证，否决本轮直接采纳；输入核验票仍 open，下一步转为文件访问等待定位，释放认领。没有产品变更，因此未运行全量单测或类型检查；完成诊断断言、六次完整构建、语义/原索引验证及文档差异检查。180 秒目标仍未达到。


## 操作级等待诊断与新输入快照（2026-10-26）

### 输入边界重新记录

本次启动时发现目标 HEAD 已从 `7062ac342f835bf67943922441554abe27f45d45` 前进到 **`2f935a041d43626eb32e0cb164e8b41194afee2a`**，提交间有 56 个文件变更，工作区另有三份字体 asset 修改及一个未跟踪文档。默认 Node 已变为 26；本轮显式使用仍可用的 **Node 24.15.0**，保留用户工作区原状。

按当前输入建立的是**只读诊断快照，不是新的完整冷构建基线**：164,026 文件，receipt `9ccebc857c296547d2fc0de699d23995a0b14d4ead6a62408a87eb896a235382`；逐文件有序哈希清单 SHA 为 `075e5e1f78e93445c846092bbe07973aa3a62d943314d215ed6bf5bc51368f38`。不得与旧 164,024 文件完整构建样本直接归因比较。

### 更短的诊断循环

直接调用原 captureUnityInputSnapshot 及其独立插桩副本，无数据库、解析或 FTS。使用实际路径 `$NEONSPARK_SOURCE_REALPATH`，scope/defines 和调用 cwd 与目标配置一致。原实现运行一次，插桩实现连续运行两次；五个有效样本（含后续目录限流对照）的 receipt 和全部逐文件哈希完全一致。

插桩在 snapshot 的 readdir/stat、ReadStream 的 open/read/close、同步 hash.update 边界记录调用数、时延直方图、少量慢路径、文件大小/扩展名分组和 event-loop delay。保留完整内容读取、读取前后稳定性校验、错误传播及并发 16；不改变缓冲参数，不主动 GC。只保留有界统计，不逐请求写日志。原样记录两块物理盘的 iostat 输出；它是设备级综合 I/O，不是本进程独占读流量。

自检覆盖原实现/诊断实现 receipt 与哈希相等、open/close/stat 数量、read 与 hash-update 字节相等、句柄全部关闭、失败批次传播。图 impact 对 hashInputFiles/strictGlob 仍为 UNKNOWN，补查当前源码实际调用，未修改产品函数。

| 样本 | snapshot wall 秒 | 进程 CPU 秒 | candidate glob 秒 | source glob 秒 | project glob 秒 | 内容哈希秒 |
|---|---:|---:|---:|---:|---:|---:|
| 原实现 original-b | 34.287 | 45.896 | 未细分 | 未细分 | 未细分 | 未细分 |
| 相同插桩 io-b1（慢） | **157.324** | 59.263 | 10.197 | 15.597 | **45.799** | **85.148** |
| 相同插桩 io-b2（快） | **35.976** | 54.522 | 2.289 | 12.056 | **2.267** | **18.242** |

**无 DB 条件下已复现一快一慢，不需要每次完整建图才能研究这类等待。** 相同插桩也能快速完成，故不能把这次全部差额直接归于插桩固定开销；但探针仍有扰动，以上不是产品优化 A/B 或原始实现慢样本的精确归因。

首个入口 original-a 因传入符号链接路径，底层枚举未识别到 Unity 输入、返回 undefined，runner 在读取 hashes 时失败；不计有效样本。改用既有 snapshot-repro 相同的实际路径后正常运行，失败日志/调用记录保留。未因此更改产品路径处理。

### 哈希慢在 read 回调等待，而非 SHA 运算

两轮有效插桩均记录 328,052 次 stat、164,026 次 open/close、411,203 次 read（包括 EOF），247,177 个 hash-update chunk，实际读取 **6,202,205,435 字节**，无读错误或遗留描述符。

下表为**并发调用耗时累计值**及直方图分位上界，不能当作可相加的阶段 wall；回调延迟包含线程池排队、系统调用与调度/事件循环，尚未分离纯磁盘服务时间。

| 操作 | 慢样本累计秒 | 快样本累计秒 | 慢/快 P99 上界 ms |
|---|---:|---:|---:|
| stat | 36.956 | 22.366 | 1 / 1 |
| open | 23.913 | 18.522 | 1 / 0.5 |
| **read** | **814.873** | **143.227** | **32 / 2** |
| close | 23.650 | 11.504 | 2 / 1 |
| 同步 hash.update | **2.448** | **2.376** | 0.125 / 0.125 |

慢样本 read 最大回调时延 536.382 ms，快样本 51.060 ms；哈希期间 event-loop delay 最大值仅 46.957/26.427 ms（监测分辨率 20 ms）。这支持将主要新增等待收窄到 read 路径，而非 SHA 运算或长时间主线程阻塞；不能据此排除所有 GC、调度或线程池影响。

**128,103 个 .meta 占输入数约 78%，但仅约 350.54 MB（读取字节约 5.7%）。** 其文件生命周期累计值慢/快为 627.498/127.773 秒，约占全部文件累计生命周期的 69.6%/64.8%；这是重叠的文件活动时间，不是 wall 占比。大 prefab 贡献大多数读取字节，小 meta 则贡献大量高频访问和等待，二者需要分开看。

### 目录排队不等同于单次磁盘读耗时

三次 glob 的 readdir 次数分别为 **21,504 / 8,127 / 19,085**。原插桩最多同时有约 5,800 个已提交但未完成请求；慢 project glob 的最长回调时延约 26.289 秒，而其 event-loop delay 最大值约 28 ms。该长尾可能包含大量排队，不能解读为“某一个目录的磁盘读取就需要 26 秒”。

在另一个独立副本中只给底层 readdir 加 **32 请求上限**，保留排队、错误与排序语义；Promise 分支也复用同一限流器。100 个失败枚举请求均传播 ENOENT、释放槽位，后续成功请求正常；完整 snapshot 的清单/哈希一致，实测提交到底层的未完成请求上限确为 32。

| 样本 | snapshot 秒 | candidate / source / project glob 秒 |
|---|---:|---:|
| cap32-c1 | 32.214 | 2.103 / 9.520 / 2.167 |
| 紧随其后的无限流对照 io-control-c1 | 32.129 | 1.895 / 10.208 / 2.426 |

**这一对未显示整体提速，暂不采纳目录限流。** 它减少了已提交到底层的请求，但 JS 层仍有待调度任务，不能宣称将全部挂起任务从 5,800 消除了。未在可控制的冷缓存慢样本下验证，也未做完整构建峰值验收；不能推广为所有限流方案都无效。

### 下一项值得验证的方向

**优先检验哈希批次屏障：保持最多 16 文件并发，完成一个立即补位，而不是每 16 文件全部完成后才启动下一批。** 当前源码按排序后的文件逐批 Promise.allSettled，混合小 meta 和较大 prefab；本轮观察到最大文件生命周期约 2.608 秒，具备长尾。是否因慢文件让已完成槽位闲置，仍是待验证假设，不能把累计时长差额直接当成可节省 wall。

下一实验先给每批记录开始/结束、每文件完成时刻与有效占槽时间，计算批次尾部等待；只在证据支持后做同为 16 上限的持续补位对照。必须保持输出哈希的原排序、全部文件/字节、两次独立核验；发生错误后停止新任务，并等待所有已启动 I/O settle 后再失败，覆盖读取中变化、短读、同路径替换、读取错误和 descriptor/concurrency 上限。先用当前只读循环获得一快一慢的可解释证据，再回到完整构建做峰值和端到端验收。

该方向不改变 SHA 算法、buffer pool、文件范围或 FTS。线程池大小与真实磁盘服务时间仍未分离，暂不凭设备吞吐或回调长尾直接增加线程池/文件并发。native 生命周期与 pipeline→DB 临时堆问题仍保留，但不是复现当前等待所必需的前提。

### 状态与资产

本轮没有重建图，因此**没有为新输入声称图事实一致性或完整冷构建收益**。新 target-before/target-preserved 对照确认目标 HEAD、用户修改状态、原索引 metadata/seed 哈希和 DB inode/mtime/size 未变；未改生产源码/dist，未发布、提交或清理既有数据库。输入核验票仍 open，释放认领。

原始资产在 `.scratch/neonspark-io-20261026/`：target-before/target-preserved、原实现 original-b、io-b1/io-b2、cap32-c1/io-control-c1 的 result/hashes/io 直方图与磁盘日志，io-summary.json、queue-selfcheck.json、自检日志和诊断 CLI。original-a 失败样本保留。全量单测、完整建图峰值和搜索召回未在本轮运行；完成只读差分、计数/字节/错误断言及文档检查。


## 哈希批次屏障与持续补位验证（2026-10-26）

### 决议

**持续补位得到可重复的只读哈希阶段小收益，保留为待完整上下文验收的候选；尚不修改产品。** 本轮确认了逻辑空槽，但没有证明能消除此前 100+ 秒的读取等待或满足完整构建 180 秒目标。下一步应验证真实构建首次/最终核验中的收益和峰值，而不是把槽位占用率直接换算成总体提速。

### 批次尾部确实存在

当前目标 HEAD、工作区状态及原索引与上一轮一致，沿用 164,026 文件、receipt `9ccebc857c296547d2fc0de699d23995a0b14d4ead6a62408a87eb896a235382`；Node 固定 24.15.0。图 impact 对 hashInputFiles 仍为 UNKNOWN，补查当前 capture 调用和既有测试。

首先仅在原 16 文件批次中记录开始、每文件完成与整批结束时刻。`batch-a1` 的 10,252 批累计 wall 17.044 秒，16 槽容量时间约 272.701 槽秒，文件活跃时间约 184.317 槽秒，**逻辑槽位占用 67.59%**。最长一批 271.561 ms，首个文件约 2.620 ms 完成，最后完成的是 BossRoom_VoidGod.prefab；该批存在明显长尾。

槽位占用表示文件任务是否仍存活，不表示磁盘利用率、CPU 并行度或真实设备队列深度。批次尾部时间仍有其他文件工作，不能把尾部时间总和或空槽比例直接当作可节省 wall。

### 候选保持 16 并发和原输出顺序

独立诊断副本保留单文件 stat→完整流式读取/SHA→stat 的原函数体，只把“每批全部完成后继续”替换为最多 16 个 worker 完成即领取下一个文件。结果按原输入下标保存，全部成功后按原输入顺序构建 Map；不按完成顺序输出。观察到失败即停止领取新文件，等待所有已启动 worker settle 后再抛出错误；错误不是空 hash 或成功返回。

候选没有使用上一轮小缓冲或目录限流，也未增加文件并发、线程池或读取范围。额外保存一个与文件数等长的结果引用数组，完整构建时的内存影响仍需测量，不能因只读峰值较小就忽略它。

### 三对只读 snapshot

先运行独立的批次占用探针，再使用新的六个样本做 **A2→B1、B2→A3、A4→B3** 对照。双方保留相同操作级探针，分别记录批次/worker 调度统计，用 /usr/bin/time 记录进程 peak footprint；没有 inspector CPU/heap 采样。均为独立进程、同一完整输入，OS 缓存与后台活动仍未受控。

| 样本 | snapshot wall 秒 | 哈希 wall 秒 | 哈希进程 CPU 秒 | 逻辑槽位占用 | peak footprint GiB |
|---|---:|---:|---:|---:|---:|
| batch-a2 | 32.458 | 17.937 | 31.747 | 67.64% | 1.885 |
| pool-b1 | 101.296 | 16.583 | 25.634 | 99.99% | 1.487 |
| pool-b2 | 27.646 | 13.678 | 24.287 | 99.99% | 1.898 |
| batch-a3 | 31.588 | 17.608 | 32.188 | 68.27% | 1.878 |
| batch-a4 | 31.083 | 16.876 | 29.546 | 66.93% | 1.900 |
| pool-b3 | 30.557 | 16.310 | 28.515 | 99.99% | 1.882 |

三对哈希阶段分别缩短 **1.354 / 3.930 / 0.566 秒**；中位数 **17.608→16.310 秒（约 7.4%）**，进程 CPU 中位数 **31.747→25.634 秒（约 19.3%）**。这些样本的哈希阶段均处于较快区间，尚未覆盖慢读取条件下的持续补位收益。

snapshot 总 wall 中位数 31.588→30.557 秒，但 pool-b1 总计 101.296 秒：其中 **project glob 64.928 秒**，发生在哈希调度之前。这是必须保留的反例，不能宣称总体稳定提速，也不能把这次枚举慢化归因于尚未执行的 worker 调度。

只读进程峰值中位数 A/B 为 1.885/1.882 GiB，最大值 1.900/1.898 GiB；第二对 B 比 A 高约 0.020 GiB。没有明显的只读峰值趋势恶化，但不构成包含 pipeline/native DB/FTS 的峰值验收，更不能等同于完整建图中约 12–14 GiB 的测量。

### 边界与一致性检查

- 原实现/候选逐文件 SHA 与 Map 顺序一致，覆盖空输入、空/小文件、大文件、反向输入及重复路径。
- 人为延迟首个文件时仍保持最多 16 个活跃任务；观察到首个失败后没有继续领取后续文件，已启动任务全部结束后才拒绝。
- 强制短读仍得到完整 SHA；EIO/EACCES 和读取中修改均拒绝，报错前所有已打开文件描述符关闭，实测描述符峰值不超过 16。
- 六轮 receipt 与完整有序哈希清单 SHA 均与 original-b 一致；每轮 164,026 次 open/close、6,202,205,435 读取字节，无遗留描述符或 pending 操作。
- 当前目标 HEAD、用户修改状态、原索引 metadata/seed 哈希与 DB inode/mtime/size 未变。原产品源码/dist、全局 CLI 未改。

### 下一步的具体门槛

1. 用当前新输入先建立完整构建对照，在首次/最终核验继续记录阶段 wall/CPU、逻辑并发、峰值和设备压力；旧 HEAD 的完整构建样本不能直接充当本候选 A 组。
2. 优先关注真实最终核验和慢读取条件，而非继续扩大快缓存微基准样本。若只有约 1 秒级只读收益而完整 wall/峰值不稳定，保留为低优先级候选，不为此增加更复杂调度。
3. 正式采纳仍需完整内容/FTS、图事实与发布一致性、失败后 settle、并发/描述符上限及取消路径回归。此候选没有解决 project glob 的长尾；目录/源盘等待仍是独立问题，避免混合两个变量一起修改。

资产：`.scratch/neonspark-io-20261026/` 的 batch-a1、batch-a2/a3/a4、pool-b1/b2/b3，scheduling-results.json、scheduling-summary.json、两份 pool16 自检结果、scheduling-target-preserved.json、对应 runner 和诊断包。初始占用探针不纳入三对性能统计。输入核验票保持 open，释放认领。

本轮未重建数据库、未对新输入声称图事实验收、未运行全量单测/类型检查或发布提交；完成独立诊断断言、三对只读差分、计数/字节/顺序验证及原索引保护检查。

## 持续补位完整构建与压力归因（2026-10-26）

结论：**暂不采纳 16 槽持续补位，降低该候选优先级。下一主项改为完整内容导入的 CSV 分段与系统压力归因。** 单对完整构建中，总 wall 下降不能归因于调度；最终哈希收益仅 0.339 秒、CPU 未降，最终 snapshot 整体还慢了 3.297 秒。已有三对只读的小收益证据仍保留，不将本轮负面结果解读为候选在所有环境无效。没有继续反向复测：本轮不主张采纳，当前最终核验收益不足以优先投入更多完整构建。

### 当前输入与测量边界

- GitNexus HEAD `1c9138747f2533b1a2463a6128f0736aa5660807`；产品逻辑沿用既有基线，候选只在独立 scratch dist 中改 hash 调度。
- neonspark HEAD `2f935a041d43626eb32e0cb164e8b41194afee2a`，保留既有用户修改；164,026 文件、6,202,205,435 字节，receipt `9ccebc857c296547d2fc0de699d23995a0b14d4ead6a62408a87eb896a235382`。这轮新输入首次有完整对照；不与旧 164,024 文件/361,857 事实基线直接比较。
- Node 24.15.0；独立空索引/解析缓存、原 scope/defines、full content/FTS。未清 OS 缓存，未控制背景负载。
- A→B 串行；两边都有轻量 snapshot 阶段/字节/调度探针，无 inspector CPU/heap 采样，移除前轮操作级 I/O 包装。批次和 worker 探针结构不同，因此秒级差异也不能当作无探针产品收益。2 秒内存与 30 秒整机压力采样保留。
- impact(hashInputFiles) 返回 UNKNOWN/未找到；补查真实函数与 capture/run-analyze 的前后两处调用，未把空 caller 当作安全证明。原产品源码/dist、全局 CLI 未修改，未重建过期源码索引。

### 完整 A/B

| 指标 | 原批次 A1 | 持续补位 B1 |
|---|---:|---:|
| 完整 wall 秒 | 526.995 | 442.504 |
| 首次 snapshot 秒 | 33.359 | 33.006 |
| 首次 hash wall 秒 | 17.856 | 15.795 |
| 首次 hash 进程 CPU 秒 | 34.440 | 32.757 |
| 最终 snapshot 秒 | 57.046 | 60.343 |
| 最终 hash wall 秒 | 40.011 | 39.671 |
| 最终 hash 进程 CPU 秒 | 142.367 | 143.054 |
| 资源阶段秒 | 137.087 | 88.394 |
| CSV emit 秒 | 122.308 | 27.525 |
| DB 导入总秒 | 136.901 | 45.804 |
| File FTS 秒 | 45.139 | 72.086 |
| peak footprint GiB | 12.075 | 11.781 |

B 的首次哈希快 2.061 秒，但两次 snapshot 总计反而多 2.944 秒。CSV emit 差异为 94.784 秒，大于整轮 84.491 秒的差异，资源/FTS/解析也独立波动。不能完全排除首次调度对后续进程状态的间接影响，但没有证据将这些大幅变化归因于持续补位。

B 两次最大活跃文件任务均为 16，完成后 active=0，全部 164,026 文件完成；最终逻辑槽位接近满占用，并未转化为显著 wall/CPU 改善。这说明提升逻辑槽位占用率不足以解决真实最终核验的主要成本。单对峰值略低也不能证明稳定峰值收益。

### 压力证据与下一实验

按 vm_stat 报告的 16 KiB 页换算，压力采样首尾的**整机**计数增量：

| 指标 | A1 | B1 |
|---|---:|---:|
| swap used 起→止 MiB | 23,106→29,073 | 28,993→32,959 |
| swap-in 增量 GiB | 1.178 | 13.100 |
| swap-out 增量 GiB | 6.977 | 17.223 |
| page-in 增量 GiB | 30.858 | 40.392 |

这些不是索引器专属 I/O，也不是源盘吞吐；page-in 不应与 swap-in 相加当独立读取量。swap 已用量是存量，不是本轮交换字节。两组压力明显不同，只能确认当前测量条件存在强系统干扰，不能据此断言外置 HFS+、native DB 或持续补位是根因。

下一项由 FTS 票承接其上游完整内容导入：

1. 不改并发/预读策略，先拆 CSV 的源内容读取、转义序列化、输出 write/drain 等待，记录 wall、CPU、字节和待写量，按文件类型/大小汇总。
2. 同步记录 GC、进程页故障与整机压力；在同一实现下先捕获快慢样本，区分 CPU/分配、源读取和输出背压。测量背景压力，但不擅自关闭用户进程或清系统缓存。
3. 若源读取主导，再用相同内容做外置源盘/内置临时副本的交替回放；该对照同时改变设备/文件系统，须如实标注，且仅作归因。若转义或写等待主导，再试对应单变量优化，不提前新增缓存架构。
4. 保持两次独立完整哈希、full content/FTS、错误/取消与原子发布；不提前销毁 native DB 或终止正在 native 调用的 worker。

### 一致性与资产

两组 exit 0，均完成 22 项 FTS。stats 一致：137,315 files、278,539 nodes、841,653 edges、7,707 communities、2,378 processes、0 embeddings。361,665 条 Unity/STEP_IN_PROCESS/runtime-root CALLS 相关事实多重集（含 reason/confidence/step）、完整 parity seed、File 节点 id/path 清单、metadata 文件哈希/receipt/覆盖与功能配置均一致。此处不是所有通用边或每个 FTS 内容字节/查询召回的全面校验，尚未达到正式产品采纳门槛。

候选自检覆盖空输入、顺序/重复路径、并发上限、强制短读、EIO/EACCES、读取中修改、失败后停止领取且等待已启动任务 settle；无遗留 FD。取消路径和全产品回归仍属于正式采纳前检查，本轮未声称覆盖。

目标 HEAD/用户工作区状态、原索引 metadata/seed 哈希及 DB inode/mtime/size 均保持不变。为容纳完整实验，仅退役已经成功导出并核验的旧 scratch 数据库与本轮 A1 独立索引，保留对应 retirement 记录、全部日志/事实/metadata；B1 独立索引保留。失败样本保留，未删除用户原索引。

资产：`.scratch/neonspark-pool-full-20261026/` 的 run.mjs、run-pair.mjs、两份诊断包、results.json、pressure-summary.json、full-batch-a1/full-pool-b1、semantic-comparison.json、target-preserved.json 及两份 pool16 自检报告。压力汇总验证计数单调和 FTS 时间戳；两个完整样本均未达到 180 秒，地图与票保持 open，释放输入核验票认领。

本轮未修改产品实现，未跑全量单测/tsc，未提交或发布；完成两次真实完整构建、诊断自检和上述差分。当前仅一对完整样本，不声称稳定提速。

## CSV 预读长尾定位（2026-10-26）

**决定：下一方向收窄到小文件 readFile 的操作/排队等待，暂不修改 CSV 转义、预读并发或 native 生命周期。** 本轮一份成功完整构建和一份发布失败的慢样本，将 CSV 长尾定位到了预读边界。慢样本自身 95.1% CSV wall 在预读等待；因发布前检测到输入变化，它不能作为成功基线或严格同输入 A/B。

### 范围与探针验证

沿用 GitNexus HEAD `1c9138747f2533b1a2463a6128f0736aa5660807` 和 Node 24.15.0，独立 scratch CLI/索引。产品源码、dist、全局 CLI 未修改；原批次哈希、CSV 有界预读、scope/defines、full content/FTS、发布核验和 native 退出约束全部保留。图查询落后 1,760 提交且部分 FTS 查询失败；streamAllCSVsToDisk、FileContentCache、BufferedCSVWriter、escapeCSVField 的 impact 均 UNKNOWN，补查 lbug-adapter 的实际调用与 CSV 测试，不将空 caller 视为低风险。

探针记录节点/关系阶段边界、累计进程 CPU、resourceUsage、GC、cache hit/miss、按扩展名聚合的 stat/readFile 时延与字符数、prepare/normalize/escape、buffer join、同步 write 调用和 drain 等待。所有统计有界，不逐文件写日志。原 csv-emit 包含关系写出期间重叠执行的节点 COPY，新边界避免把全部时间误称为写盘。

夹具验证 full/symbol/none 三种配置输出字节一致，含重复节点、中文/引号/换行、符号内容、缺失文件的既有空内容行为、真实 drain 和输出路径失败。探针不是零开销；同步计时含调度/GC 暂停，I/O 累计时长重叠，不能相加当 wall；prepare 嵌在预读内，finish 与 drain 也可能重叠。

### 快慢完整上下文观测

| 指标 | csv-a1 | csv-a2 |
|---|---:|---:|
| CLI wall 秒 | 394.754，exit 0 | 659.975，exit 1（输入变化） |
| CSV 总秒 | 17.548 | 180.629 |
| 节点阶段秒 | 16.551 | 179.600 |
| 关系阶段秒 | 0.997 | 1.029 |
| CSV 进程 CPU 秒 | 19.280 | 33.788 |
| 预读 await wall 秒 | 9.544 | 171.784 |
| prepare 累计秒 | 0.773 | 0.928 |
| escape 累计秒（含关系） | 1.944 | 2.118 |
| normalize 累计秒 | 0.627 | 0.688 |
| buffer join 累计秒 | 0.202 | 0.216 |
| write 同步调用累计秒 | 1.239 | 1.280 |
| drain 累计秒 | 1.559 | 0.624 |
| 资源阶段秒 | 77.104 | 172.264 |
| 整轮 peak footprint GiB | 12.183 | 11.778 |

两者 CSV 时长相差 163.081 秒，预读等待相差 162.240 秒（约 99.5%）；由于输入漂移，该差异仅作诊断。更不依赖跨轮输入假设的证据是：**慢样本本身 171.784 / 180.629 = 95.1% 的 CSV wall 在预读 await 内**。慢样本 GC 记录为 minor 136 次/1.032 秒、major 17 次/0.171 秒、incremental 17 次/0.029 秒，没有与 163 秒长尾匹配的同步转换或 GC 时间。

两次探针计数相同：164,610 次 cache miss、256,917 次 hit、161,434 次成功 readFile、17,409 个预读批次、166 次节点 flush、1,134,006,182 个节点 CSV 写出字节；活跃 I/O 峰值 16，结束为 0，无 stat/readFile 错误。计数/字符数一致不等于全部内容 SHA 一致，不能覆盖发布核验失败。

| readFile 类型 | 次数 | 快样本平均 ms | 慢样本平均 ms |
|---|---:|---:|---:|
| .meta | 128,034 | 0.606 | 15.015 |
| .cs | 18,083 | 0.393 | 6.442 |
| .prefab | 4,813 | 1.884 | 2.483 |
| .asset | 10,436 | 0.867 | 1.132 |

.meta 约占读取次数 79%，内容约 350.5 MB；慢样本的 readFile 累计时长约 1,922 秒，是并发累积值，不是串行 wall。C# 读取比 9,281 个 File 节点多，cache 的符号内容复读也存在，但尚无证据把它当成长尾的主因。

readFile 计时包含内部打开、文件状态获取、读取、关闭、解码、线程池排队与 JS 回调恢复。本轮没有将这些内部步骤拆开，不能据此宣布磁盘、HFS+、libuv 或特定后台程序是根因。

### 独立 File 回放与旧日志复核

复用现有 csv-repro 思路，将已验收的 155,808 个 File id/path 清单按同一顺序回放，不加载 DB、不跑 pipeline；仍保留既有大小上限和完整内容转换。顺序 original-1→probe-1→probe-2→original-2：wall **12.599 / 8.194 / 7.876 / 7.580 秒**，进程 CPU 15.307 / 15.989 / 16.378 / 15.780 秒。四份 CSV 均为 **1,011,907,990 字节**，SHA `4a02e6da1e8c9c4cd44c57876cbbfd7edbf01753ab3c3d27ba6fcd17a2a70b81`。第二对 probe 比 original 慢约 0.295 秒；第一对受缓存/背景影响，不能将 probe 更快当作收益。这些回放未复现长尾，也不能代替完整构建。

旧 full-batch-a1 的 CSV 122.308 秒，在包围该阶段的 124.018 秒采样窗口中消耗约 31.854 秒进程 CPU；旧 full-pool-b1 的 CSV 27.525 秒，在 28.016 秒窗口中消耗约 30.458 秒 CPU。两轮最大采样间隔约 2.005/2.009 秒，支持异步等待方向；由于窗口有约 1.710/0.492 秒额外边界且 COPY 可重叠，不作精确 CPU 子阶段归因。其较宽整机压力窗口中，快样本换入/换出反而更多，不能用整机 swap 与 CSV 慢化简单建立因果关系。

### 发布状态与后续门槛

csv-a1 完成 22 项 FTS，137,315 files / 278,539 nodes / 841,653 edges / 7,707 communities / 2,378 processes；与当前已验收基线的 **361,665 条相关事实多重集、File 清单、parity seed、metadata fileHashes 和 receipt** 一致。receipt 仍为 164,026 文件的 `9ccebc857c296547d2fc0de699d23995a0b14d4ead6a62408a87eb896a235382`。

csv-a2 也完成 22 项 FTS，但最终 receipt 不同，原子发布被拒绝；不运行成功样本的事实验收，不把失败的 659.975 秒当作可发布索引成绩。运行器的成功摘要在此停止，保留 result、日志、压力、解析缓存等；临时替换 DB 按产品既有失败清理流程处理，并非人工删除失败证据。原 neonspark HEAD/修改列表与原索引元数据/seed/DB 文件状态检查通过；修改列表不变不代表内容不变，后续只读快照单独记录输入变化。

下一实验：

1. 固定回放清单和逐文件 SHA，记录当前输入的新变化；诊断副本与原工作区分离，不靠 Git status 证明内容稳定。
2. 优先用原 readFile 路径的操作级追踪区分 open/fstat/read/close、队列与回调等待；先在夹具验证追踪开销和标记含义，再在同并发下捕获快慢样本。若追踪需要替换读取实现，须另做字节/错误/短读差分，不能把实现变化与测量混为一谈。
3. 只有读等待证据支持时，再做同内容的外置源盘/内置独立副本交替回放，记录实际设备活动与缓存条件。设备、文件系统、缓存可能共同变化，结论须保留边界。
4. 不根据这次计数直接增加预读/线程池、重写转义或引入跨阶段内容缓存；正式优化仍需稳定输入下完整构建、FTS 内容/召回、错误取消与发布门槛。

资产：`.scratch/neonspark-csv-20261026/` 的诊断 CLI、setup-receipt.json、自检、run-one.mjs、csv-a1/csv-a2、csv-comparison.json、四次 replay、replay-results.json、historical-csv-windows.json、target-preserved.json。回放 CSV 在记录字节/SHA 后清理；成功数据库及失败日志保留。所有生产文件未改，未提交/发布，未运行全量单测/tsc；本轮诊断字节自检、成功全量差分与失败保护检查已完成。地图/FTS 票保持 open，释放认领。

发布失败后的只读复核耗时 100.605 秒，仍为 164,026 文件，新 receipt 为 `fca2212ac78e9879e5f93624259c77830f2dc1020f5c75c3079bff61caf9df7f`。相对最后验收的逐文件哈希，**仅 5 个生成项目文件改变**：Assembly-CSharp-Editor-firstpass.csproj、Assembly-CSharp-Editor.csproj、Assembly-CSharp-firstpass.csproj、Assembly-CSharp.csproj、Mirror.Tests.csproj；没有增删文件，其余输入哈希一致。证据为 input-drift.json / post-failure-hashes.json。这是事后快照，不证明变化在失败构建内的精确时间，也不自动升级为新的成功完整基线。Assembly-CSharp.csproj 参与 defines/项目语义，不能忽略其变化或绕过核验；后续须固定这些配置后再测。

## 小文件原生操作与线程池对照（2026-10-26）

**决定：保留 libuv 线程池排队为下一项完整构建候选，暂不改默认值。** 已在原读取实现下获得操作级证据，避免重写 readFile 后混淆测量；但 41 秒慢回放只出现一次，反向默认组也可在 6.9 秒完成，不能把全部慢化归因于线程池配置。

### 固定输入与追踪边界

使用 Node 24.15.0、原产品 dist 中的 FileContentCache（CSV 模块 SHA `e3a8d31db6d9bde970000b5a12de5f232baf92b19ffd4db57079090e646074b7`），没有修改读取函数或产品文件。图 context 找到 streamAllCSVsToDisk 与测试调用，仍标记过期/lower-bound，补查当前源码。诊断按原 16 文件批次调用 cache.get，缓存容量仍为 3,000。

清单固定为已验收 File 图节点中的 **128,034 个 .meta**，逐文件 SHA 取上轮事后快照。清单 SHA `84f7e2c88fa144959b2ec3635b3c90c89994866630581b44e19ffd0357edaa04`。每轮读取后将 UTF-8 内容重新编码并比对原始字节 SHA，全部通过；每轮 350,524,594 字符 / **350,528,272 字节**。这是固定清单回放，并非物理冻结整个仓库，也不校验新出现的清单外文件或生成的 csproj。

Node 的 node.fs.async 追踪在回放前开启、结束后关闭；fixture 及本地 Node 内置 internal/fs/promises 实现确认路径为显式 stat（产品大小门槛）→open→readFile 内部 fstat→read→close。无需猴子补丁或改用 FileHandle。每份有效追踪具有 1,280,340 条原生事件：五类操作各 128,034 对开始/结束，所有配对闭合、无操作错误，read 返回字节合计与输入一致。解析器测试覆盖 ENOENT、复用事件 ID、缺失开始/未闭合事件拒绝。

**事件跨度包含线程池排队、操作服务和完成回调调度，不是纯磁盘耗时**；同轮的累计操作时间存在重叠，不得相加作为阶段 wall。事件循环延迟、进程 CPU 另列，没有采集可直接分离内核服务与 libuv 排队的线程级时间。

### 无前置大资源读取的控制组

独立进程按 plain-a1→trace-c1→trace-c2→plain-a2 顺序：

| 样本 | 追踪 | 回放 wall 秒 | 进程 CPU 秒 |
|---|---|---:|---:|
| plain-a1 | 无 | 7.196 | 9.514 |
| trace-c1 | 有 | 7.871 | 10.104 |
| trace-c2 | 有 | 6.732 | 9.576 |
| plain-a2 | 无 | 6.626 | 8.462 |

两份有效快样本的 read 平均 0.329/0.277 ms，close 平均 0.167/0.141 ms，open/stat/fstat 均更短。未复现历史 15 ms 的整次 readFile；追踪存在开销，不能视为无扰动基准。上述 wall 包含每轮约 0.22 秒 SHA 验证；prefetch await 单独保留。

### 前置大资源读取及线程池对照

假设：前置大资源访问改变缓存/设备状态，可能复现后续小文件读取慢化。每轮先以 4 文件并发流式读取并核对 SHA 的 **3,176 个 >512 KiB 资源，共 4,966,394,789 字节**，再执行同一 .meta 回放。未清 OS 缓存、未分配人工压力堆，也没有修改目标文件；前置读取约 6.8–7.9 秒，和下面回放时间分列。

| 顺序 / 样本 | UV_THREADPOOL_SIZE | 回放 wall 秒 | 进程 CPU 秒 | read 平均 ms | close 平均 ms |
|---|---|---:|---:|---:|---:|
| conditioned-d2 | 未设置（默认） | 41.179 | 11.546 | 2.192 | 1.111 |
| conditioned-p16-e1 | 16 | 6.198 | 13.890 | 0.238 | 0.0164 |
| conditioned-p16-e2 | 16 | 6.143 | 13.604 | 0.238 | 0.0158 |
| conditioned-default-d3 | 未设置（默认） | 6.863 | 9.720 | 0.283 | 0.143 |

四轮内容及大资源输入 SHA 都通过，文件并发始终 16。D2 的 read p95/p99 为 11.185/13.694 ms，fstat 为 0.635/9.758 ms，close 为 7.087/9.974 ms；显式 stat 与 open 的 p99 仍为 0.118/0.216 ms。事件循环最大延迟 18.678 ms、p99 11.084 ms，未见与 41 秒 wall 对应的长时间 JS 阻塞。慢化分布在 read 与后续请求等待，值得继续验证排队机制。

但同样读取大资源后的 D3 回到快区间，所以**前置大资源读取不是充分复现条件**，D2→E1 的约 35 秒差异不能全部归功于线程池 16。反向快区间 E2/D3 只差 **0.720 秒（约 10.5%）**，E2 CPU 比 D3 增约 **40.0%**。16 线程的 close/fstat 延迟缩短提供队列因素的线索，同时也带来明显 CPU 代价；未验证其在真实解析/资源/FTS 共存时的峰值、取消或完整构建收益。

### 失败采集也保留

- trace-b1 使用固定文件名，轮转后只剩末尾 231,764 条事件，解析器发现缺少开始事件并拒绝。后续全部采用包含 rotation 的绝对路径，多分片归并后严格核对计数，不用残缺尾段归因。
- conditioned-d1 的相对追踪路径随 chdir 指向不存在目录。Node 报无法打开文件后停顿；1 秒 sample 显示主线程在 NodeTraceWriter::Flush / uv_cond_wait 等待。已用 SIGINT 停止本次自建只读诊断进程，exit 130；不是索引器 native worker，也未终止用户进程。该停顿**不是文件读取性能证据**。修正绝对路径并验证可写后才运行 D2；错误日志、sample 和 invalid.json 保留。

### 下一步与验收限制

1. 在真实 CSV 慢阶段启用已验证的原生文件追踪，确认 read/fstat/close 的同类长尾是否成立；先核对完整输入 receipt，生成 csproj 变化仍必须拒绝发布。
2. 若真实构建证据一致，在独立 CLI 进程做默认/16 的单变量交替完整对照。保留文件并发、读取内容、scope/defines、两次核验、FTS、发布原子性与 native 生命周期。不能仅看 close 延迟或一次 wall，须记录整轮 CPU、峰值和其它阶段退化。
3. 只有完整收益可重复且代价可接受才考虑采用；否则保留默认值，转向同字节、不同存储位置的受控对照，区分源盘访问与队列竞争。不新增产品配置、不直接增大默认线程池。

资产：`.scratch/neonspark-readfile-20261026/` 的 replay/conditioned/series、原生 trace 分片与摘要、results.json、condition-results.json、selfcheck.json、verification.json 及两份失败采集记录。有效回放全部逐文件 SHA 一致，原索引保护检查通过；产品实现/全局 CLI 未改。未重建全量索引、未运行全量单测/tsc，未验证完整 FTS 召回或新完整基线；本轮仅解决追踪可用性和候选筛选。地图与 FTS 票保持 open，释放认领。


## 线程池完整构建交替验证（2026-10-26）

### 输入、变量与边界

在源码 HEAD `1c9138747f2533b1a2463a6128f0736aa5660807` 的同一隔离诊断 CLI 上，按 **默认 A1 → 16 B1 → 16 B2 → 默认 A2** 顺序完成四次空索引/空解析缓存构建。唯一处理变量为进程启动环境 `UV_THREADPOOL_SIZE=16`；CSV 文件预读上限仍为 16，保持原批次哈希、scope/defines、full content、全部 FTS、两次完整输入核验及发布原子性。Node 24.15.0；不清 OS 缓存，不并行运行性能实验。CSV 段开启相同轻量分段及 `node.fs.async` 原生追踪，使用已验证的绝对轮转路径。它是带诊断的完整构建对照，还不是无探针验收。

目标 HEAD `2f935a041d43626eb32e0cb164e8b41194afee2a`，164,026 文件。四次首次/最终核验都与新参考 receipt `fca2212ac78e9879e5f93624259c77830f2dc1020f5c75c3079bff61caf9df7f` 一致，逐文件哈希集合一致。此前 5 个生成 csproj 变化已进入这个新基线，不能与旧成功构建的 receipt 直接混用。预检发现新增未跟踪 `.scratch/agent-certification/`，初次启动在构建前拒绝；只读检查未发现相关源码/资源扩展名，复核目标 HEAD、内容快照与原索引保护信息后更新实验状态参考，保留漂移记录。

### 四轮结果

| 样本 | 完整 wall 秒 | CPU 秒 | 峰值 GiB | CSV 秒 | 预读等待秒 | scope 总秒 | scope 内部秒 | 首次/最终核验秒 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| default-a1 | 514.982 | 792.12 | 13.161 | 24.073 | 15.201 | 141.144 | 19.204 | 38.629/47.769 |
| pool16-b1 | 364.263 | 804.80 | 12.820 | 15.429 | 9.104 | 31.506 | 15.963 | 29.564/47.972 |
| pool16-b2 | 349.393 | 804.20 | 12.916 | 16.186 | 9.427 | 31.535 | 16.455 | 31.209/54.444 |
| default-a2 | 550.903 | 838.50 | 13.010 | 19.227 | 11.811 | 116.175 | 16.861 | 39.974/51.760 |

四轮均 exit 0。两对完整 wall 差分别为 **150.719 秒、201.510 秒**，方向一致；默认组中位数 532.943 秒，16 线程组 356.828 秒，相差约 33.0%。这是本机四个带探针样本的描述，不能视作跨机器或稳定 SLA。CPU 首对增加约 1.6%、反向对降低约 4.1%，两组 16 线程峰值均低于对应默认组；未出现此前只读快回放中约 40% 的整轮 CPU 增幅。但反向对 CSV CPU 为 30.552/25.689 秒，局部 CPU 代价仍存在。

CSV 两对分别减少 8.644、3.041 秒，不能解释 150–202 秒整轮差异。作用域阶段分别减少 109.638、84.640 秒，是更大的可定位差异。首次核验两对改善约 9 秒，但最终核验无一致收益（47.769→47.972，51.760→54.444 秒）。资源阶段默认 85.360/80.701 秒、16 线程 75.883/77.035 秒。FTS 及其他阶段仍有波动，不能将剩余整轮差值全部归因于线程池。

### CSV 原生操作与完整性

四次追踪均完整配对且错误为零：stat 164,610 次、open/close 各 161,499 次、fstat/read 各 161,434 次，读取 **1,039,562,758 字节**。源内容读取计数/字符量一致，预读峰值 16，结束时活动 I/O 为零。输出 write 系统调用次数略有变化，这是流合并/背压调度现象，不能用它替代内容一致性验证。

| 操作 | 默认 A1/A2 平均 ms | 16 线程 B1/B2 平均 ms |
|---|---:|---:|
| read | 0.400 / 0.346 | 0.273 / 0.267 |
| fstat | 0.138 / 0.104 | 0.050 / 0.050 |
| close | 0.204 / 0.173 | 0.014 / 0.018 |

close p99 从默认 1.316/0.845 ms 降到 0.069/0.092 ms，支持排队因素值得继续研究。原生事件跨度含服务、排队与回调调度，不是纯磁盘耗时。本轮 CSV 均在 15–24 秒，**未复现或证明消除历史 180 秒长尾**。

四轮均核对 155,808 个 File 的 id/path 与存储内容 SHA、361,665 条 Unity/流程相关关系多重集、完整 parity seed、输入哈希、统计、覆盖及能力元数据，均一致；22 个 FTS 表均 ready。反向 B2/A2 另导出全部 **841,653 条 CodeRelation**，比较 source/target/type/规范化 reason/confidence/step/staticGated 的排序哈希多重集，完全一致。首对数据库在这一补充导出前已释放，因此不宣称首对也完成了全关系比较。节点统计均为 278,539，资源错误与功能配置元数据保持一致。

这些结果支持候选继续验证，但 FTS ready 与内容 SHA 不能替代实际检索召回；本轮未新增中英查询、大文件尾词及取消路径验收，也未验证含既有 embeddings 的迁移场景。

### 下一方向：作用域准备 I/O，并验证线程池候选

**保留线程池 16 为优先候选，暂不修改产品默认值。下一实验优先拆分 scope-resolution 准备阶段，随后做关闭本轮探针的完整交替验证。**

现有 `runScopeResolution` 内部计时只有 15.963–19.204 秒。scope 总计减去该内部计时，默认组还剩 **121.940/99.314 秒**，16 线程组仅 **15.543/15.080 秒**。这部分包含配置加载、数据准备和其它 phase 工作，不可直接命名为扫描耗时。

源码入口为 `scope-resolution/pipeline/phase.ts` 的 `provider.loadResolutionConfig`（在 `runScopeResolution` 之前）；C# 的 `loadCsharpResolutionConfig` 并行调用 `scanCSharpProject` 和 `loadRazorViewComponentConfig`。`language-config.ts:scanCSharpProject` 逐目录枚举、按目录有界读取 csproj 和 C# 命名空间，目录上限 20,000、深度上限 24、文件读取并发 32。其排除目录为 node_modules/.git/bin/obj；本轮日志确有 Library/PackageCache 与 .trellis 下配置加载，以及 namespace scan truncated 警告。警告并未区分目录/深度上限和读取失败，不能据此断言触发了哪个上限。`loadImportConfigs` 也引用该扫描器，但当前未找到外部调用点，**没有运行时重复扫描证据**。

下一步在隔离 CLI 中只增加计时和计数：

1. 分开配置加载、Razor、命名空间扫描、scope store/内容准备与解析器内部；记录 wall/CPU、目录数、C# 文件数/字节和明确截断原因。保持遍历顺序、配置优先级、范围及错误处理完全不变。
2. 以同输入默认/16 交替，判断差异是否集中于 namespace 文件流的原生请求。不要同时改线程池和扫描算法；只有先验证瓶颈，才考虑复用已取得的命名空间证据，并证明扫描范围与配置顺序等价。
3. 候选采纳前关闭 CSV/原生探针再重复完整 A/B，补全文检索召回、错误/取消与目标平台检查。必须保留完整图/内容/receipt 验证，不能凭 33% 单机样本直接设置全局环境或产品默认值。

源码图仍过期，相关 graph 查询不足且 impact 为 UNKNOWN，已有文本核对补充；未静默重建索引，未编辑产品函数。任何后续实现仍需 impact，并补足证据，不把 UNKNOWN 当低风险。

资产：`.scratch/neonspark-uv-full-20261026/` 的自检、输入参考、四份 invocation/result/summary、原生 trace 分片、File 内容哈希、关系导出、`results.json`、`verification-final.json`、保护检查和状态漂移记录。仅在成功导出并校验后回收已验证的 scratch 数据库，以满足反向实验磁盘预算；保留证据及最终 A2 数据库。原 neonspark 索引、业务文件、全局 CLI 未改，失败样本保留。未运行全量 npm test/tsc：本轮仅诊断副本及文档变更；自检、四轮构建和导出校验已完成。180 秒目标仍未达，地图与 FTS 票保持 open，释放认领。


## 现有验证项收口与候选否决（2026-10-26）

用户要求继续到现有待验证项完成，并明确要求清理巨大临时文件。本轮覆盖作用域准备归因、线程池无新增探针对照、真实全文检索、资源读取分布及错误/取消/预算回归；允许连续收口既有票。**结论是现有候选不采纳，180 秒验收未通过，不是完成性能目标。** 已否决方案无需再补其采纳所需的扩展实验；条件性存储迁移/新缓存设计不自动变成已经证明必要的实现。

### 作用域准备：范围、截断与耗时已拆开

隔离副本仅加计数和计时，先用含 Unicode 命名空间的小样本验证与原实现结果相同。对原始 neonspark 运行默认/16/16/默认配置回放，输出配置（保留 csproj 顺序）、命名空间集合和 Razor 结果完全一致，摘要 SHA `257f2168c4926151cf4e74c5190b71a8333b29b44f5d99002c26809526131515`。

| 回放 | 默认 A1 | 16 B1 | 16 B2 | 默认 A2 |
|---|---:|---:|---:|---:|
| wall 秒 | 10.000 | 8.924 | 8.776 | 8.841 |
| CPU 秒 | 5.642 | 5.082 | 5.117 | 4.449 |
| readdir 秒 | 6.606 | 6.369 | 6.243 | 6.315 |
| 命名空间读取/扫描秒 | 3.311 | 2.483 | 2.460 | 2.451 |

每轮扫描 **19,097 个目录、255 个 csproj、16,126 个 C# 文件，读取 125,174,798 字节 C# 内容**。目录/深度上限命中数和不可读目录/文件数均为零。`truncated` 来自 Addressables 的 `Tests/Editor/NamespaceTests.cs` 与 `Tests/Runtime/NamespaceTests.cs` 两个文件：结构扫描器返回 incomplete；不是触及 20,000 目录上限或读取失败。保留原 fail-open 行为，未改解析器或排除这两个文件。

完整诊断默认组配置加载/准备分别 **12.811/5.142 秒**，scope 总计 37.400 秒；16 线程诊断组为 **23.843/9.905 秒**，scope 总计 65.312 秒。后者与用户要求的大文件清理重叠，只作归因/语义证据，不是严格 A/B。另一个因磁盘保护中断的默认样本也测得 11.788/4.669 秒。此前默认组 99–122 秒的内部计时外成本未稳定复现，没有证据证明固定重复扫描或某个目录必然造成百秒成本。

**决策：不重写扫描器，不删 Library/.trellis，不只扫描已索引文件，不将 UNKNOWN 调用图结果解释为安全。** 本轮回答了现有计时/截断验证问题；未声称解释了所有历史环境长尾。

### 完整构建：无探针对照否决线程池候选

同一产品实现（与上轮 CLI 的差别仅为移除 CSV 诊断），Node 24.15.0、原 scope/defines/full content/FTS、空索引和空解析缓存、两次完整核验。输入仍为 164,026 文件、receipt `fca2212ac78e9879e5f93624259c77830f2dc1020f5c75c3079bff61caf9df7f`。无探针组关闭新增 scope/CSV/native trace 和内存 preload，保留一致的原有 verbose 日志、`/usr/bin/time` 与外部磁盘/系统压力监控，不声称零测量开销。

| 样本 | 完整 wall 秒 | CPU 秒 | 峰值 GiB | 首次核验秒 | 最终核验秒 | scope 秒 | 资源秒 |
|---|---:|---:|---:|---:|---:|---:|---:|
| diag-a1 | 399.286 | 811.27 | 12.868 | 35.393 | 55.213 | 37.400 | 77.792 |
| diag-b1 | 840.050 | 1019.81 | 13.055 | 126.504 | 237.895 | 65.312 | 122.280 |
| plain-a1 | 567.162 | 859.31 | 14.471 | 117.548 | 48.340 | 39.346 | 80.703 |
| plain-b1 | 1632.677 | 1217.93 | 12.120 | 65.730 | 574.811 | 97.665 | 201.467 |

`diag-b1` 的清理干扰另记 `interventions.json`，不与 A 作收益归因。两个无探针样本均正常 exit 0，且未发生磁盘保护中断。16 线程 wall 比默认增加 **1,065.515 秒（约 187.9%）**、CPU 增约 **41.7%**；峰值降低不能抵消耗时失败。最终核验 574.811 秒、资源 201.467 秒、解析 133.716 秒等均有慢化。整机 swap 使用量约 26–34 GiB，背景条件不一致；这不是“线程池必然导致每一项慢化”的因果证明，但足以否定从前轮快样本推出稳定收益。

原计划默认/16/16/默认四轮。第一对中 B 已明显慢于 A，完成前明确加上失败即停止判断：B 正常完成并通过全部语义/检索校验后，若完整 wall 不优于 A，则否决候选、取消余下 `plain-b2/plain-a2`。本次触发了该判断。**只完成一对无探针对照，不能写成四轮完成；剩余重复属于已否决候选的采纳验证，不再为了寻找快样本继续执行。** 构建自身 exit 0；编排器之后的 `CANDIDATE_REJECTED`/exit 1 是停止后续实验的决策，不是索引构建失败。

**不采纳 `UV_THREADPOOL_SIZE=16` 作为默认或 neonspark 性能处方。** 前轮带探针的 33% 差异不能再作为优化收益。保留原默认配置，不增加产品选项。

### 一致性与实际召回

四份成功构建均与同一参考比较：155,808 个 File 的 id/path/存储内容 SHA、全部 **841,653 条 CodeRelation** 的 source/target/type/规范化 reason/confidence/step/staticGated 多重集、361,665 条相关 Unity/流程事实、完整 parity seed、输入逐文件哈希/receipt、统计、覆盖、能力和失败元数据，均一致。22 个 FTS 表 ready；此处“全部关系一致”表示与固定实现的参考等价，不意味着取消了实现原有的范围/扇出限制。

实际查询固定在 `Assets/CrashSight/Scripts/CrashSightAgent.cs`：英文 `CrashSightAgent`、中文 `全平台接口`、存储内容约第 **37,870 字符**处的 `CrashSightStackTrace`。四轮均召回预期 File，前 200 个返回 ID 的排序集合一致；真实大文件后段查询不只检查表存在。读回时适配器记录了缺少 shadow 的 WAL 隔离/从 checkpoint 打开警告，保留日志；查询与全部导出均通过，原 neonspark 索引未参与恢复或修改。

默认和 16 线程环境各运行 **89 个 Vitest 测试 + 51 个 Node/native 资源测试，全部通过、无跳过**。范围为 full-file/CJK FTS 实际 COPY→搜索、CSV 资源内容预算、输入快照、C# 命名空间与 scope source policy、run-analyze、资源行/会话/discovery/access/publication 和 ingestion；覆盖取消、输入中途修改、spill 预算、清理错误以及既有 embeddings 保留/失败策略。用 `GITNEXUS_REQUIRE_FTS=1` 禁止缺扩展时静默跳过。未做其它操作系统的性能迁移验证，也未将本轮无 embeddings 的 neonspark 构建称为既有真实向量库迁移验收；候选已否决，不再为采纳补这些扩展实验。

### 资源 I/O 分布与复用决策

复用原 `resourceLineChunks`，从固定 parity seed 的资源清单串行读取，每个文件检查前后指纹，对实际迭代出的行计算哈希。两轮 **19,539 文件、5,705,017,456 字节**，各分组计数/行数相同，行流 SHA 均为 `d3e1285d416764fd9056be54bdff10edc8f34d7733c5f874d7f620331fafc085`。

| 类型/大小 | 文件数 | 读取字节 |
|---|---:|---:|
| prefab >512 KiB | 3,205 | 4,951,994,596 |
| prefab ≤512 KiB | 5,150 | 477,832,455 |
| asset >512 KiB | 59 | 130,965,545 |
| asset ≤512 KiB | 11,046 | 138,545,732 |
| unity >512 KiB | 1 | 982,191 |
| unity ≤512 KiB | 78 | 4,696,937 |

大 prefab 占读取量约 **86.8%**。回放默认/16 为 139.139/48.980 秒、CPU 45.266/44.928 秒；它包含额外逐行哈希/指纹，只有正向一对且受缓存顺序影响，不能视作真实解析耗时或线程池稳定收益。`selectedFiles` 在回放 JSON 中仅指 seed 里出现过 GUID hit 的资源集合，不等于 canonical 选择后的完整 pipeline 实际解析清单。

完整构建已有计数显示 discovery 19,539 opens / 5.705 GB、后续 resolution 16,617 opens / 5.301 GB。后者包含有界的小资源解析与大资源轻量绑定；它与发现阶段承担不同事实与行号职责，且读取间保留指纹核验。上一组默认 discovery 38.819 秒（含 spill 写约 1.200 秒、读约 0.063 秒），仅优化 spill 无法解释全部资源成本。

**决策：当前不采纳跨阶段内容缓存、合并遍历或盲目提高资源并发。** 已定位重复字节规模及主要文件组，现有证据未证明能等价复用解析结果，不能用一次少读替换行号/组件证据或资源修改检测。范围/事实/错误/取消/预算回归通过；更深的有界资源事实复用属于需要单独设计证明的新方向，不是本轮已采纳实现。

### 既有验证项的最终状态

| 项目 | 本轮收口决策 |
|---|---|
| 小文件缓冲 / 持续补位 / 目录限流 / ignore 缓存 | 沿用此前完整负收益或收益不足证据，不采纳；不继续扩大微优化，也不为已否决代码补采纳测试。 |
| FTS buffer pool 2/4 GiB、FTS 前 GC | 沿用预算失败/无稳定整轮收益结论；保留安全预算与生命周期，不新增实现。 |
| CSV 转义/序列化重写 | 等待而非序列化主导历史慢样本，缺乏收益依据，不实施。 |
| 线程池 16 | 无探针对照未通过 wall/CPU 门槛，不采纳，取消后续采纳重复。 |
| scope 准备 | 拆分计时与截断原因已完成；无固定重复扫描证据，不改范围或扫描器。 |
| 资源 I/O | 分布与实际重复读取已测，错误边界通过；未证明等价复用，不实施缓存/合并。 |
| 完整性 / FTS / 错误与取消 | 当前环境下上述检查通过。 |
| 180 秒验收 | **未通过**。无探针默认 567.162 秒；没有三次 ≤180 秒的结果，地图和目标验收票保持 open。 |

四个调查票按现有候选的采纳/否决决策收口；关闭调查不等于优化成功。后续若推进性能目标，应先建立可解释、可迁移的负载/存储条件，或就有界资源事实复用开启新的设计验证；不得把当前不稳定环境中的快慢样本继续累积成确定收益。

### 失败样本、清理与验证边界

- 隔离 CLI 首次缺 vendor，启动 5.276 秒即失败，未进入建图；日志存 `invalid-diag-bootstrap`，补齐依赖后才重试。
- 一个默认诊断样本因剩余空间低于 2 GiB 收到 SIGINT并正常清理，431.903 秒、exit 1，保留 `invalid-diag-disk` 的日志/元数据，不计成功性能样本。后续启动空间门槛提高至 24 GiB，保留运行中 2 GiB 的保护。
- 用户要求清理大文件后，检查文件无进程持有，删除已结束实验的 DB、CSV、解析缓存及失败残留，集中清理清单记录约 **44.31 GiB 逻辑体积**。本轮后续成功索引也在全量导出/检索检查后立即删除。原始日志、输入指纹、统计、关系/内容哈希和失败原因保留；历史文字中“保留数据库”是当时状态，当前以各 `database-retirement.json` / `large-file-cleanup.json` 为准。
- 最后清理后系统可用空间约 **60 GiB**；本任务 `neonspark-*` 实验目录中已无 >500 MiB 的单个文件。原 neonspark 业务文件/索引、其它任务目录、全局 CLI 均未修改。
- 资产在 `.scratch/neonspark-pending-20261026/`：scope 四轮 JSON、自检、诊断/无探针 invocation/result/summary、FTS 固定查询与结果、完整比较导出、`regressions.json` 与测试日志、资源回放、`candidate-rejected.json`、清理记录和目标保护检查。scratch 不提交 Git。
- 本轮没有产品函数、依赖或配置变更；未运行全仓 npm test/tsc、未提交/发布，也无需同步 CLI 安装契约。针对性回归、文档链接及 diff whitespace 检查完成。跨平台/长期压力性能和全部 FTS 查询空间不在本轮证明范围内。

## 当前基线新方向的无人值守收口（2026-10-26）

成本总账与有界复用两票已完成，6 GiB 池因完整 FTS 崩溃否决，资源投影因阶段收益不稳定及峰值超限否决。五轮成功构建完整语义与 FTS 校验通过，失败样本保留，取消重复不计成功。详细矩阵、门槛及环境限制见[完整对照收口](phase-accounting-analysis.md#完整对照收口与新基线)。

已更新[当前基线](baseline-current.json)：默认三轮 452.759 / 830.656 / 373.027 秒，中位数 452.759 秒；保留既有 bbf05f4e 产品实现。所有当前候选均已决策，180 秒目标仍未达。大型实验产物清理完成，原索引不变。

## 合并后架构候选收口（2026-10-27）

[逐项验证](architecture-validation.md)完成：采纳 CSV 按需分行，额外缓存预算与 C# 结构复用不实施。恢复输入后的两对完整对照通过性能门槛及全量语义；源码和正式 dist 已落盘、未提交。完整 wall 921.195→715.251 / 580.117→446.985 秒，CPU 均降低约 2.9%；不将全部 wall 差异归因于代码。新基线和精确补丁已保存，180 秒未达，原索引不变，实验大文件清理完成。
