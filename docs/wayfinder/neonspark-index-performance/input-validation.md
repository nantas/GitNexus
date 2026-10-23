---
id: neonspark-perf-input-validation
parent: neonspark-index-performance
labels: ["wayfinder:task"]
status: open
assignee: null
blocked_by: [neonspark-perf-measurement]
---
# 降低输入核验 I/O 成本

## Question

能否在完整内容哈希、枚举错误传播和发布前重新核验都不变的条件下，减少重复目录遍历与小文件 I/O 调度？

## Evidence and next experiment

- 已测冷构建开始/发布核验 33.044 / 72.868 秒；热重建 139.765 / 51.711 秒；无变更核验 111.661 秒。
- 分别计时清单枚举、ignore/scope、metadata 探测、hash 读取；先确认真实冷读和缓存读差异。
- 依证据试验共享枚举结果、有界小文件读取或 I/O 调度；之前 FileHandle 直接替换没有稳定收益，不能据一次快样本复活方案。
- 不用 stat/mtime 代替内容哈希，不取消前后两次核验；保留新增/删除文件、控制文件变化、同路径替换、读取中修改和读取错误的检测。

## Acceptance

同一输入 receipt、哈希清单完全一致；输入一致性回归通过，A/B 完整 wall 有重复收益且峰值内存不恶化。失败或输入变化不得发布新索引。

## Assets

- [已固定的测量基线](baseline.json)
- [基线实验记录](resolution.md)
