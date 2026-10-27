---
id: neonspark-perf-stage-reuse
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: closed
assignee: null
blocked_by: [neonspark-perf-phase-accounting]
---
# 选择有界的跨阶段复用点

## Question

基于新成本总账，哪个阶段之间能以最少改动减少重复读取/解析/序列化，同时降低或保持峰值，并保留全部输入与图事实语义？

## Evidence and next experiment

- 不预选缓存实现；比较 snapshot→parse、parse→scope、resource discovery→binding、graph→CSV/FTS 的输入和派生证据生命周期。
- 用预计消除的总工作量、关键路径占比、峰值及验证成本排序，挑一个最小原型。既有否决只约束原候选，不排除不同证据支持的新设计。
- 保留开始/发布两次独立核验、scope/defines、full content/FTS、组件行号/canonical 选择、预算/abort/清理和原子发布。
- 不创建无界全内容缓存，不靠压缩范围或删除校验获益；遵守 phase-accounting 的实验磁盘预算和及时回收规则。

## Experiment (completed)

资源投影与 6 GiB native 池通过独立筛选后完成完整构建决策，详见[计时及原型证据](phase-accounting-analysis.md)。6 GiB 首轮完整构建失败，第二轮取消；投影的两对对照均已完成。两候选没有同时启用。

在结果产生前固定经验采纳门槛：两对完整 wall 都降低，平均 wall 至少降低 5%；每对 CPU 不超过 +10%、平均 CPU 不超过 +5%；每对峰值不超过 +5%，且全量内容/关系、receipt、parity 和实际 FTS 召回通过。单对 wall 或 CPU 退化超过 25% 时提前否决、取消剩余候选重复。该门槛不代表统计显著性，环境限制仍需写入基线。

资源投影还必须在两对资源阶段本身都改善、平均至少改善 5%，不能用未修改的 snapshot/CSV 阶段偶然变快代替实际资源净收益。对照已有 snapshot 39.395→150.600 秒、CSV/导入准备 44.205→211.075 秒的环境波动，最终报告不把完整 wall 差值全部归因于投影。

## Acceptance

先证明等价性与内存上界，再在固定新基线上验证完整收益；没有足够收益或语义证明则明确否决，不为了产出代码实施缓存。

## Resolution

两候选均不采纳。6 GiB 在 File FTS 阶段出现回滚错误并以 SIGSEGV 退出；投影虽减少约 4.81 GB 原资源重复读取且完整语义通过，但第一对资源阶段退化 45.6%，两对峰值均增加约 7.8%，未通过预先固定门槛。不能用未修改阶段的波动抵消失败门槛。

当前批次全部待验证项已完成决策，产品保留 `bbf05f4e` 已采纳实现；三轮默认对照及环境限制已写入 [baseline-current.json](baseline-current.json)。[完整决策与样本](frontier-validation.json)。180 秒验收仍未通过。
