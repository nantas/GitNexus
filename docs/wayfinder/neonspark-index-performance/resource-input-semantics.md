---
id: neonspark-perf-resource-input-semantics
parent: neonspark-index-performance
labels: ["wayfinder:grilling"]
status: open
assignee: null
blocked_by: []
---
# 选定资源输入的降本杠杆与等价判据

## Question

Unity 资源分析的三根候选杠杆——统一输入集合的语义、把安全过滤提前、分离 GUID metadata 读取与
`.meta` 全文物化——选择哪些进入设计与验证？每项的语义等价判据是什么？

新证据（[neonnew 重立基线](neonnew-rebaseline.md)）：冷缓存下 unity-resources 阶段 7 倍膨胀
（150.2s→1093.5s，668,699 次 .meta 读 ~1.6ms/次），说明该阶段的成本结构对读模式敏感；同时
[需求审查](resource-requirements-analysis.md)已确认部分 `.meta` 正文读取缺乏必要消费者。
不得以削减分析能力的方式降本。
