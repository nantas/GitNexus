---
id: neonspark-perf-neonnew-rebaseline
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: closed
assignee: codex
blocked_by: []
---
# neonnew 重立基线（2026-10-27）

## Question

neonspark 工作区转入活跃开发（Unity Editor 常驻），性能实验需要一个新的基准输入仓。改用
`/Users/nantasmac/projects/neonnew` 后：同一产品构建在新输入上的冷启动成本是多少？语义产出是否与
neonspark 基线等价可验证？180 秒目标的可测量性是否受当前环境影响？

## 结论

- **语义产出完全可复现**：同一输入三次完整构建与两次纯代码构建之间，输入 receipt、文件清单、内容
  哈希、代码符号、Unity 事实（361,910 行逐行哈希）、九类代码关系（code/full 对齐）、FTS 召回
  （英文/中文/>10KiB 尾部 token）全部一致；neonnew 既有 `.gitnexus` 索引（641 文件）全程未被触碰。
  独立冷启动验收证据成立。
- **阶段级成本复现旧基线**（热页缓存时）：scan 10.2s（旧 10.9）、parse 38.5-55.1s（旧 35.9）、
  scopeResolution 20.9-28.9s（旧 30.0）、unity-resources 104.2-140.3s（旧 150.2）。纯代码整轮
  138.8s / 163.5s（旧 133.9-145.5）。产品行为在 neonnew 上未变。
- **端到端整轮被环境噪声支配**：完整构建三次分别 1502.6s / 1310.0s / 1452.7s，均为旧参考 464.5s
  的 2.8-3.2 倍。每次运行恰好出现一个约 1000s 的慢区，且落点不同：冷缓存时 unity-resources
  1093.5s（668,699 次 .meta 读，~1.6ms/次）；热缓存后慢区分别转移到 CSV/DB 导入段（959.3s）与
  FTS 后静默段（979.3s）。采样器（run.mjs 30s 定时器）同期被饿死，说明系统级 I/O 饱和而非进程内
  抖动。
- **排除项**：非 swap 抖动（各运行 Swapins 增量≈0）；非 Spotlight（运行期 mds CPU≈0）；非输入漂移
  （receipt 跨运行字节一致）；非 dirty paths（全部为 0）；非工作量差异（io 计数与旧运行几乎相同：
  .meta 668,699 vs 668,764）。未定罪根因：内部 SSD（88% 满，承载系统+swap+索引写入）在大批量写入
  后的长尾停顿，与常驻 Unity（neonspark 开发）+ 18GB swap 占用的内存高压叠加。
- **180 秒目标在当前环境下不可判定**：连旧参考 464.5s 都无法在当前环境复现。验收需要一个
  噪声策略决定（安静窗口纪律 / 阶段锚定判据 / 噪声容忍方法），已立新票。

## 测量设计

沿用 [namespace 范围修复](namespace-scope-fix.md)轮的 harness 结构（`/usr/bin/time -l`、
`--max-old-space-size=18432`、io-guard、30 分钟截止、2GiB 磁盘保护、30s 压力采样、receipt 回执），
仅更换目标仓与输出目录：`.scratch/neonnew-rebaseline-20261027/`。产品构建复用旧基线的两个 pinned
dist（未重编）：

| 变体 | dist | 关键哈希（sha256 前 16） |
|---|---|---|
| 完整 ×3 | `neonspark-namespace-fix-20261027/full/dist` | resolver 9996e7a62fd0ee82、snapshot 3c4b8a5ecf2c27f3、csv d84b45aee66cc2ee |
| 纯代码 ×2 | `neonspark-namespace-fix-20261027/code/dist` | resolver 9996e7a62fd0ee82、snapshot 84d051db9178edf7 |

code/dist 是剥离资源输入闭包的诊断构建（旧基线同款）；full/dist 与产生 464.5s 参考的构建逐字节相同。
曾误用 full/dist 跑 code 变体：产品输入闭包无条件哈希资源文件（`Assets/**/*.asset` 等），io-guard
按 CODE_ONLY 拒绝 `.asset` 读取后运行失败——保留为 `code-b1-rejected-full-dist/`，这同时记录了产品
行为：**输入 receipt 覆盖范围由资源闭包决定，与 includeExtensions 无关**。

输入：neonnew HEAD `4c17e2c6d1f1`（Feature/content-truth-db，2026-10-26），完整 receipt 157,169
文件（旧 neonspark 157,189），纯代码 receipt 9,537（旧 9,539）。neonnew 树内无 tracked 改动；
`.gitnexusrc` 与旧口径等价且被显式 CLI flags 覆盖（CHANGELOG 约定 flags 优先）。

## 结果

| 运行 | wall | CPU | peak RSS | 慢区 |
|---|---:|---:|---:|---|
| code-b1 | 163.5s | 538.0s | 3.95 GiB | 首触（冷） |
| code-b2 | 138.8s | 451.3s | 4.73 GiB | 无 |
| full-b1 | 1502.6s | 1405.6s | 4.70 GiB | unity-resources 1093.5s（冷缓存读） |
| full-b2 | 1310.0s | 932.1s | 5.80 GiB | 导入段 959.3s（静默） |
| full-b3 | 1452.7s | 1241.3s | 6.70 GiB | FTS 后 979.3s（静默） |

关系计数（code/full 对齐，均为 after-fix 语义）：CALLS 102,775；IMPORTS 543；EXTENDS 4,098；
IMPLEMENTS 1,082；METHOD_OVERRIDES 37,587；METHOD_IMPLEMENTS 2,659；ACCESSES 34,974；USES 4,064；
STEP_IN_PROCESS 13,197。Unity 事实：STEP_IN_PROCESS 13,197、UNITY_RESOURCE_SUMMARY 76,189、
UNITY_COMPONENT_INSTANCE 121,970、UNITY_ASSET_GUID_REF 71,760、UNITY_GRAPH_NODE_SCRIPT_REF 72,735、
UNITY_SERIALIZED_TYPE_IN 5,803、unity-runtime-root CALLS 256。图规模 278,478 节点 / 839,713 边
（旧 278,537 / 840,023，输入提交差异所致）。

与旧计数差（CALLS -195、ACCESSES -121 等）与两仓输入提交差（bcbf1f2e→4c17e2c6，-20 文件）一致，
属内容漂移，非行为漂移。

## 环境记录（2026-10-27 18:10-20:15 CST）

- Unity Editor 6000.0.73f1 常驻运行于 neonspark（~1 核 CPU、3GB 级 RSS）；Chrome/企业微信/QQ/VS
  Code/pi 会话并存。
- 会话开始时 swap 13.4/14.3GB；结束时 18.2/19.5GB（三次完整构建期间各增长 0.4-4.1GB，无
  swap-in，为被动换出）。
- 内部 SSD（数据卷 ~88% 满）承载系统、swap 与实验索引写入；三次完整索引各 ~6.5GiB，已全部回收
  （22.76 GiB，cleanup.json）。
- 旧参考 464.5s 的运行环境（2026-10-27 07:03）swap 占用同样很高（20.8/21.5GB）但当时无 Unity，
  且处于整日实验后的热缓存稳态。

## 对路线图的影响

1. 阶段锚定判据现在有三次完整+两次代码的本地方差证据：**纯代码整轮（≤165s）与热缓存阶段成本
   （scan/parse/scope/unity-resources）是当前机器上可靠的测量锚**；端到端完整整轮 wall 在当前
   环境不是可靠指标。
2. 冷缓存下 unity-resources 的读延迟（668k 次 .meta 读、~1.6ms/次、阶段 7 倍膨胀）为
   [资源需求审查](resource-requirements-analysis.md)方向提供了新证据：资源 I/O 的成本结构对
   顺序/并发/预取敏感，属于已记录的候选设计空间（统一输入集合语义、早期过滤、GUID metadata 与
   .meta 全文物化分离）。
3. 180 秒验收前必须先解决测量噪声策略（新票：验收噪声策略）。
4. 旧 baseline-current.json 存在一处记录瑕疵：`distFilesSha256` 中 analysis-input-snapshot.js 的
   哈希 a3e7a768 与两个实际 dist（84d051db/3c4b8a5e）均不符，为记录时点产物；本次基线以
   invocation.json 记录的运行时哈希为准。

## 边界

- 未重新运行全量测试套件（产品未变，沿用 [发布准备](../../releases/1.6.13-preparation.md) 的
  22,080 通过记录）。
- 未在 neonspark 上做对照运行（该仓正在执行开发任务，按用户指示不再触碰）。
- 慢区根因（SSD 长尾 / 内核回写节流 / 其他后台任务）未定罪；本票只主张"环境噪声支配端到端
  wall"这一可复现观察，不主张任何具体根因。
- 沿用既有约定：不提交、不发布、不触碰 neonnew 既有索引与业务文件；harness 与证据留在
  `.scratch/neonnew-rebaseline-20261027/`，详见 [README](README.md) 的收录边界。
