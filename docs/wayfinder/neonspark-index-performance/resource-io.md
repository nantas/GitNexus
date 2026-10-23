---
id: neonspark-perf-resource-io
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: open
assignee: null
blocked_by: [neonspark-perf-measurement]
---
# 定位资源扫描剩余 I/O

## Question

资源阶段在 85–200 秒间波动的剩余时间，来自哪些文件大小区间和重复读取；能否安全减少打开/读取次数？

## Evidence and next experiment

- 分拆 discovery、轻量 binding、deep parse、spill 和指纹核验；按文件大小/类型统计 opens、bytes 与 wall。
- 先验证仍有哪些实际重复读取，再考虑复用或有界并发；不预先决定跨阶段缓存设计。
- 保持 canonical 选择、确定性输出顺序、逐组件行号/证据、256 KiB 行限制、spill 预算、abort 和错误清理。
- 保持 strict hydration / parity rerun 以及资源修改检测的现有语义。

## Acceptance

与源码基线比较完整 parity seed 和 361,857 条相关事实的多重集，包含 reason/confidence/step；增加错误/取消/预算边界验证，整轮 A/B 有稳定收益。

## Assets

- [已固定的测量基线](baseline.json)
- [基线实验记录](resolution.md)
