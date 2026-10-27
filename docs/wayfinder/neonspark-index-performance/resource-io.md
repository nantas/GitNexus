---
id: neonspark-perf-resource-io
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: closed
assignee: null
blocked_by: [neonspark-perf-measurement]
---
# 定位资源扫描剩余 I/O


已于 2026-10-26 按现有候选决策收口：资源大小分布及 discovery/resolution 重复读取已测；没有等价复用证明，不实施缓存/合并，错误/取消/预算回归通过。 完整证据见[现有验证项收口与候选否决](resolution.md#现有验证项收口与候选否决2026-10-26)。下文为历史调查顺序；关闭本票不表示 180 秒目标已达成。

## Question

资源阶段在 85–200 秒间波动的剩余时间，来自哪些文件大小区间和重复读取；能否安全减少打开/读取次数？

## Evidence and next experiment

- 分拆 discovery、轻量 binding、deep parse、spill 和指纹核验；按文件大小/类型统计 opens、bytes 与 wall。
- 先验证仍有哪些实际重复读取，再考虑复用或有界并发；不预先决定跨阶段缓存设计。
- 保持 canonical 选择、确定性输出顺序、逐组件行号/证据、256 KiB 行限制、spill 预算、abort 和错误清理。
- 保持 strict hydration / parity rerun 以及资源修改检测的现有语义。

## Acceptance

与同输入参考比较完整 parity seed 和相关事实多重集，包含 reason/confidence/step（历史输入 361,857 条；当前输入 361,665 条，并补全 841,653 条全部关系比较）；增加错误/取消/预算边界验证，整轮 A/B 有稳定收益。

## Assets

- [已固定的测量基线](baseline.json)
- [基线实验记录](resolution.md)
