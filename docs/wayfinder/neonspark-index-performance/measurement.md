---
id: neonspark-perf-measurement
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: open
assignee: null
blocked_by: []
---
# 建立可比较的重复测量条件

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
