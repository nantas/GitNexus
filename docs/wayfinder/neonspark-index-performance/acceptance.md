---
id: neonspark-perf-acceptance
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: open
assignee: null
blocked_by: [neonspark-perf-phase-accounting, neonspark-perf-stage-reuse]
---
# 验收完整冷构建 180 秒目标

## Question

经过已接受优化后，能否在声明的测量条件下稳定完成 180 秒以内的完整冷构建？

## Evidence and next experiment

- **2026-10-27 最新结果：**按需分行已采纳，完整候选两轮 **715.251 / 446.985 秒**，中位数 **581.118 秒**，范围 **446.985–715.251 秒**。164,034 文件新输入不可与历史输入直接比较；4 轮对照完整内容/关系/FTS 通过。只有两次候选观测且均超过 180 秒，本票保持 open。证据见 [architecture-validation.md](architecture-validation.md)；下文为历史批次。

- 最新无人值守批次已完成：三轮默认完整冷索引/解析缓存构建 **452.759 / 830.656 / 373.027 秒**，中位数 **452.759 秒**，范围 **373.027–830.656 秒**，均超过 180 秒；完整内容、关系、receipt、parity、22 张 FTS 与实际中英/后段召回通过。新基线见 [baseline-current.json](baseline-current.json)，前次基线归档为 [baseline-pre-frontier-20261026.json](baseline-pre-frontier-20261026.json)。两项新候选均已否决，上游调查票已关闭；本票保持 open 表示目标未达，不表示候选仍待测。

- 后续只以 [baseline-current.json](baseline-current.json) 的已采纳源码/当前输入作为参考；[新分析](rebaseline-analysis.md)已建立下一轮成本总账与复用选择任务。旧输入数字不可直接用作新收益。

- 当前验收已执行但**未通过**：[现有验证项收口与候选否决](resolution.md#现有验证项收口与候选否决2026-10-26)中无探针默认 567.162 秒、线程池候选 1,632.677 秒；语义及实际召回通过，耗时不合格。其它现有候选已形成否决结论。本票与地图继续 open，不以调查票关闭或取消失败候选重复冒充三次 ≤180 秒。

- 每个上游任务都应有“采纳/否决及证据”的结论；不要求为每个方向都写代码。
- 至少 3 次独立冷索引/解析缓存构建，每轮完整 wall 都不超过 180 秒；另外报告中位数和范围，热/无变更结果不得替代。
- 核对全部输入 receipt、图统计、File 内容、Unity 事实及 parity seed；检查 FTS 查询与资源失败/解析 completeness。
- 记录准确提交、运行时、机器条件和可复跑命令，更新持久基线。

## Acceptance

只有完整性与耗时门槛同时通过才关闭地图。未通过时记录剩余阶段与证据，继续保留 open，不用缩减范围、关 FTS 或省核验宣布达标。

## Assets

- [已固定的测量基线](baseline.json)
- [基线实验记录](resolution.md)
