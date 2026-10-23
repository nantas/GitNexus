---
id: neonspark-perf-fts
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: open
assignee: null
blocked_by: [neonspark-perf-measurement]
---
# 降低 full-content FTS 构建成本

## Question

FTS 的 68–86 秒主要来自哪个表、分词/写入步骤或 native 内存压力；是否存在保持完整搜索语义的安全优化？

## Evidence and next experiment

- 按表记录 FTS wall、输入内容字节、buffer pool、数据库体积和 page-in，区分 CPU 工作与 I/O 等待。
- 检查 Apple Silicon 页粒度相关预算与实际用量，不能盲目降低 COPY 安全下限或扩大默认内存。
- 只在测量支持时试验批次/执行顺序/安全资源生命周期；不得触碰已知 native destructor/worker shutdown 安全约束。
- 保持 full content、既有表覆盖、CJK/换行分词、失败恢复及 embeddings 保留行为。

## Acceptance

验证 File/符号内容一致、所有 FTS 表可用，并用中英查询与大文件尾部词检查召回；完整 A/B 收益可重复，COPY/FTS 不出现 OOM 或降级。

## Assets

- [已固定的测量基线](baseline.json)
- [基线实验记录](resolution.md)
