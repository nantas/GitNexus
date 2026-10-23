---
id: neonspark-perf-scope-resolution
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: open
assignee: null
blocked_by: [neonspark-perf-measurement]
---
# 定位解析与作用域解析 CPU 成本

## Question

冷解析 67 秒和 scope-resolution 48–54 秒分别花在哪里，哪些重复工作可在不改变解析/解析缓存与调用解析语义的前提下去除？

## Evidence and next experiment

- 分别 profile 冷解析和缓存回放，避免把缓存命中视作冷构建优化；禁止将 --cpu-prof 传播给原生解析 worker。
- 先刷新或隔离建立适用的源码图后做 impact；旧索引 UNKNOWN 不能代替调用点确认。
- 优先重复分配、重复索引构造和冗余查找；不跳过语言捕获、类型/继承/调用解析或 completeness receipt。
- 共享 ingestion 通过 provider/resolver 契约接入行为，不加入语言名分支。

## Acceptance

调用/继承/方法分派事实与 scope completeness 不退化；冷解析与热回放分别回归，整轮收益成立且没有 native worker 安全回归。

## Assets

- [已固定的测量基线](baseline.json)
- [基线实验记录](resolution.md)
