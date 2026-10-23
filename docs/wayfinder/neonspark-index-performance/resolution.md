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
