---
id: neonspark-perf-measurement
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: closed
assignee: null
blocked_by: []
---
# 建立可比较的重复测量条件

已于 2026-10-23 完成：新输入三轮独立冷构建、局部枚举 A/B 和一致性验证均已记录；完整答案见[重复测量条件决议](resolution.md#重复测量条件决议2026-10-23-续查)。下文“本票保持 open”为前一轮的历史状态。本票结论不代表环境无噪声，也不代表 180 秒目标达成。

## Question

以本次源码基线为 A，后续单一优化为 B，怎样区分代码收益、OS 缓存和内存/磁盘压力造成的波动？

## Evidence and next experiment

- 固定 Node 24.15.0、源码 SHA、输入 receipt、scope/defines、full content/FTS 和 CLI 参数。
- A/B 交替运行，每组至少 3 次独立空索引/解析缓存；报告中位数、范围及每轮完整 wall。OS 缓存不清空时必须明确记录，不将其称为物理冷盘。
- 每轮记录资源字节/文件数、阶段耗时、进程 footprint、swap/page-in 和后台负载；只有同一输入、同一功能和相近压力条件的样本才能用于收益归因。
- 不停止用户进程、不修改业务仓库；保留独立 storage/home，拒绝覆盖原索引。

## Acceptance

得到可复跑的 A/B 记录模板与至少一组重复基线；异常轮保留原因，不静默剔除。后续任务引用这些条件，不自行改验收口径。

## Assets

- [已固定的测量基线](baseline.json)
- [基线实验记录](resolution.md)

## 2026-10-23 续查：阶段拆分与下一实验

本轮由 codex 认领并完成只读阶段测量，结束后释放认领。**本票保持 open**：三轮局部快照不是三轮独立空索引全量基线，尚未达到 Acceptance；两个 P1 的依赖不解除。未改产品实现、原业务文件、原索引或全局 CLI。

### 新测量

Node 24.15.0，源码 HEAD `1c9138747f2533b1a2463a6128f0736aa5660807`，与固定基线之间仅有路线图文档变化。复用本地 `snapshot-profile.mjs`：与当前 dist 比较，仅有 import 路径重定位和阶段计时标记。三次在同一进程顺序调用 `captureUnityInputSnapshot`，cwd 为 neonspark，selection 与基线相同；不清 OS 缓存，不运行 pipeline/DB/FTS。每轮 assert receipt 等于 baseline.json，三轮均通过：164,024 文件，digest `33042ff2174db8011fd7501cb2c907405cbdb6181d7e3607ac18fe5d7037e1db`。

| 快照轮次 | 总耗时 | 三次枚举合计 | 内容哈希 | 资源/脚本 metadata |
|---|---:|---:|---:|---:|
| 1 | 33.861 s | 14.371 s | 18.763 s | 0.637 s |
| 2 | 39.183 s | 17.597 s | 20.551 s | 0.945 s |
| 3 | 34.779 s | 14.872 s | 19.334 s | 0.494 s |

中位数 34.779 s，范围 33.861–39.183 s。枚举约占 42–45%，内容哈希约占 52–56%。`source-glob` 单段为 10.209 / 13.036 / 10.567 s。阶段边界还包含相邻过滤/集合工作，不能全部解释成系统调用等待；content-hashes 包含排序、前后 stat、读取与 SHA-256。metadata 不是此样本的主要成本。

原始新输出：`.scratch/neonspark-perf-20261023/measurement-followup.ndjson`；重算汇总：同目录 `measurement-followup-summary.json`。这些是本地资产，不随 Git 提交；上表为持久证据。此局部实验的短进程、无建图内存压力条件，不能替代发布前复核或完整 wall。

### 原始全量日志的新增拆分（不是新全量测量）

| 样本 | FTS 总计 | File.file_fts | 进程 peak footprint | 系统 swap-in 增量 | 系统 swap-out 增量 |
|---|---:|---:|---:|---:|---:|
| optimized | 86.140 s | 63.019 s | 12.89 GiB | 3.94 GiB | 7.54 GiB |
| optimized2 | 67.914 s | 47.449 s | 12.37 GiB | 1.69 GiB | 5.88 GiB |
| warm | 72.419 s | 47.869 s | 12.55 GiB | 7.39 GiB | 11.61 GiB |

FTS 起止按 `output-events.ndjson` 的 creating/ready 事件时间配对，包含日志传输延迟；footprint 来自 `/usr/bin/time -l`，swap 增量按 `pressure.log` 首尾计数差 × 16 KiB 计算。swap 是**整机**指标，不能全部归因给索引器。不要将 maximum RSS（optimized2 约 4.26 GiB）误作 footprint（12.37 GiB），也不要将各 worker 的进程 RSS 相加。

warm 比 optimized2 慢 184.530 s，但 parse 快 54.721 s；两次输入核验合计多 85.564 s，资源阶段多 115.387 s，而 FTS 仅多 4.505 s。缓存重建倒退主要落在输入核验/资源路径，不能归因于 FTS 或 parser cache 本身。整机交换活动更强，支持把内存压力作为干扰变量记录，尚不能证明其因果贡献。

### 下一步方向与可证伪实验

**首先研究单次输入快照内部的重复枚举成本。** 这是本轮新量化、之前容易被统称为“哈希 I/O”的约 14–18 s/快照。先计数三次 glob 的 readdir/lstat 次数、访问目录和过滤 CPU，确认重复遍历份额，再只比较一个变量：同一快照内复用目录发现结果，保持三种选择规则分别应用。不能直接合并 ignore/dot 规则，也不能跨开始/发布两次核验复用清单，否则新增/删除文件会漏检。若重复 I/O 不占主要成本，否决此方案，再研究 hash 批次调度；不要复活已无稳定收益的 FileHandle 替换。

预期信号：枚举 syscall/时间降低，逐文件哈希 Map 与 receipt 完全一致，错误传播不变。现有入口为 `gitnexus/src/core/unity/analysis-input-snapshot.ts`；两个产品调用点在 `run-analyze.ts` 的启动核验与发布前核验。已有回归在 `test/unit/unity-input-snapshot.test.ts` 和输入一致性相关测试。实现前重新 impact；本轮图索引落后 1760 commits、context 查不到该符号，不能把缺失看作低风险，未刷新索引。

**第二研究目标收窄到 File.file_fts。** 它占上述 FTS 总时长的 66–73%；应优先测其输入字节、native CPU/I/O 和与现存图堆的内存重叠，暂不花精力微调其他小表。不通过减少 File 内容、跳过表或提前释放仍需使用的数据获益，不用并行 native FTS 放大内存峰值。

上述都是候选方向，没有实测代码收益。按 436.177 s 基线，即使两次输入核验共 105.912 s 全部消失，仍需 330.265 s；即使再消除整个 FTS，仍需 262.351 s。180 s 必须继续处理其他阶段，不能承诺一个小优化完成目标。

### 后续完整重复测量记录模板

每轮记录：run ID / A或B / 源码 SHA 与构建产物身份 / Node与启动参数 / input receipt / scope与defines / full content与FTS / 空 storage、parse-cache 和独立 home / 开始结束时间 / 完整 wall / 分段时间 / exit code / 事实与FTS一致性 / peak footprint / 系统 page-in、swap-in、swap-out 增量 / 后台负载 / 异常说明。

A、B 各至少三轮独立空索引，串行交替；同机同盘、相同监控开销，OS 缓存未清则明确注明。压力异常轮保留，不能只留下更快轮次。先完成三轮 A 的完整基线，再判断 B 的收益；上述局部三轮只帮助选择实验，不满足该门槛。
