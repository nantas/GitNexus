---
id: neonspark-perf-bottleneck
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: closed
assignee: codex
blocked_by: []
---
# 测定并消除 neonspark 全量建图瓶颈

## Question

固定本 fork 1.6.12 与当前 neonspark 输入后，哪些阶段导致全量建图超过 13 分钟，最小的语义保持优化能否使冷启动完整 wall 不超过 180 秒？

按用户确认的执行覆盖，此任务包含独立基线、profile、必要实现、回归测试与最终全量对照；结果必须同时报告性能和完整性，未达目标不能关闭地图。

## Assets

- 实验日志与 harness：`.scratch/neonspark-perf-20261023/`
- 历史参照：`openspec/changes/archive/2026-09-30-fix-unity-incremental-input-consistency/benchmark.md`

## Progress / unresolved

- 已复现实际安装版 812 秒基线，定位并修复逐行 Buffer/async 开销及 CSV 串行内容读取。
- 最终补丁独立冷构建 436 秒；热缓存强制重建 621 秒。输入/图事实一致性通过，180 秒尚未达到。本 ticket 按用户要求以“本轮基线已固定”结案；这不是目标达标，剩余问题转入后续任务，地图仍为 open。
- 后续仍需在不削减分析能力的前提下处理：输入清单/内容哈希 I/O、full-content FTS 的内存与构建耗时、资源扫描的剩余 I/O，以及作用域解析。
- 证据、运行条件、失败/排除实验见 [resolution.md](resolution.md)。

## Resolution

本轮结论及验证证据见 [基线实验记录](resolution.md)。后续工作见 [后续优化路线图](roadmap.md)；此处不再承担整个 180 秒目标的追踪职责。
