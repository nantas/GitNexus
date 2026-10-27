---
id: neonspark-perf-phase-accounting
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: closed
assignee: null
blocked_by: []
---
# 补齐整轮耗时与生命周期总账

## Question

以 baseline-current.json 为唯一当前参考，启动和发布前未归属时间具体花在哪里？各阶段有哪些重复工作和同时存活的数据，使整轮 wall/峰值显著高于单个热点成本？

## Evidence and next experiment

- [新基线分析](rebaseline-analysis.md)发现启动剩余 77.780 秒、另一慢样本发布准备剩余 92.427 秒；这些是推算区间，不是函数归因。
- 原 glob/Git 只读探针目前仅约 2/1.6–1.8 秒，未复现长尾。先对 CLI 预检、runner identity、配置/写入目标、Git metadata、发布准备加少量边界计时；不同时修改算法。
- 记录每阶段输入字节、CPU、输出表示大小和最后使用点，区分总工作量、关键路径、异步重叠与背景压力。完整 wall 必须有闭合账本，不能把剩余时间默认为 I/O。
- 产品函数改动前重新 impact；旧图 UNKNOWN 需补证据。保持全部校验和失败语义，不静默刷新原索引。
- 性能实验串行；默认不重建大索引做可由只读探针回答的问题。需要完整构建时至少留 24 GiB，导出校验后立即回收实验 DB/CSV/cache，只保留小型证据。

## Acceptance

整轮时间能够闭合，未覆盖/重叠区间明示；至少区分一个可操作的重复工作或确认具体环境等待，给出收益上限和所需语义证明，不用单轮相关性宣布根因。

## Resolution

见[新基线的编排计时与复用筛选](phase-accounting-analysis.md)。785.574 秒整轮账本闭合，10.871 秒未细分部分明示；真实发布前 Git / identity 为 4.236 / 1.089 秒，没有复现历史残差。资源两阶段重复读取约 5 GB，进入有界投影规模筛选，其收益不可能超过资源阶段总成本，仍需绑定、行号、文件变更及失败语义证明。parse→scope 已复用；graph 仍有后续消费者，不能直接释放。

全量事实、内容、输入收据及实际 FTS 召回通过。构建期间外部文档提交推进目标 HEAD，原索引未变、分析输入 receipt 未变；不宣称工作区未变。关闭本票代表计时与候选依据完成，不代表历史长尾根因已证明或 180 秒目标达成。
