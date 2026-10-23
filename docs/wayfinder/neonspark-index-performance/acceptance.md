---
id: neonspark-perf-acceptance
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: open
assignee: null
blocked_by: [neonspark-perf-input-validation, neonspark-perf-fts, neonspark-perf-resource-io, neonspark-perf-scope-resolution]
---
# 验收完整冷构建 180 秒目标

## Question

经过已接受优化后，能否在声明的测量条件下稳定完成 180 秒以内的完整冷构建？

## Evidence and next experiment

- 每个上游任务都应有“采纳/否决及证据”的结论；不要求为每个方向都写代码。
- 至少 3 次独立冷索引/解析缓存构建，每轮完整 wall 都不超过 180 秒；另外报告中位数和范围，热/无变更结果不得替代。
- 核对全部输入 receipt、图统计、File 内容、Unity 事实及 parity seed；检查 FTS 查询与资源失败/解析 completeness。
- 记录准确提交、运行时、机器条件和可复跑命令，更新持久基线。

## Acceptance

只有完整性与耗时门槛同时通过才关闭地图。未通过时记录剩余阶段与证据，继续保留 open，不用缩减范围、关 FTS 或省核验宣布达标。

## Assets

- [已固定的测量基线](baseline.json)
- [基线实验记录](resolution.md)
