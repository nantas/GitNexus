---
id: neonspark-perf-scope-resolution
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: closed
assignee: null
blocked_by: [neonspark-perf-measurement]
---
# 定位解析与作用域准备成本


已于 2026-10-26 按现有候选决策收口：配置、命名空间、Razor 与内容准备已拆分；截断原因已定位，无固定百秒重复扫描证据，不修改扫描范围或实现。 完整证据见[现有验证项收口与候选否决](resolution.md#现有验证项收口与候选否决2026-10-26)。下文为历史调查顺序；关闭本票不表示 180 秒目标已达成。

## Question

当前 scope-resolution 默认组 116–141 秒、16 线程组约 31.5 秒，而内部解析器仅 16–19 秒：配置加载、命名空间/Razor 扫描及数据准备分别占多少？能否保持证据范围和错误语义，安全减少等待或重复读取？

## Evidence and next experiment

- 入口及测量约束见[线程池完整构建交替验证](resolution.md#线程池完整构建交替验证2026-10-26)。先在隔离 CLI 中分别计时 provider 配置、C# 命名空间/Razor 扫描、scope 数据准备；统计目录/文件/字节和明确截断原因。保持扫描范围、顺序、并发和 fail-open 语义。默认/16 是唯一处理变量，不同时改扫描算法。
- 当前 namespace scan truncated 的具体原因未定位，不直接跳过 Library/.trellis 或仅使用已索引文件；没有运行时重复调用扫描器的证据。无探针完整验证及全文检索验收仍由 FTS 票承接。

- 分别 profile 冷解析和缓存回放，避免把缓存命中视作冷构建优化；禁止将 --cpu-prof 传播给原生解析 worker。
- 先刷新或隔离建立适用的源码图后做 impact；旧索引 UNKNOWN 不能代替调用点确认。
- 优先重复分配、重复索引构造和冗余查找；不跳过语言捕获、类型/继承/调用解析或 completeness receipt。
- 共享 ingestion 通过 provider/resolver 契约接入行为，不加入语言名分支。

## Acceptance

调用/继承/方法分派事实与 scope completeness 不退化；冷解析与热回放分别回归，整轮收益成立且没有 native worker 安全回归。

## Assets

- [已固定的测量基线](baseline.json)
- [基线实验记录](resolution.md)
