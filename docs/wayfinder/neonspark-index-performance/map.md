---
id: neonspark-index-performance
labels: ["wayfinder:map"]
status: open
---
# 恢复 neonspark 冷启动全量建图性能

## Destination

在相同 neonspark 输入、配置和完整分析能力下，将本 fork 1.6.12 的冷启动全量建图优化到 180 秒以内，保留可复现基线、阶段计时及语义一致性证据。

## Notes

- 2026-10-23 用户要求先固定本轮提交作为新基线、更新后续路线图；源码基线为 `bbf05f4eeb9630fecd531010edab9f1e7f674500`，本轮不继续实现新优化。

- 2026-10-23 用户确认：冷启动全量为主验收口径；覆盖 wayfinder 默认 planning-only，建图后继续测量、实现和验收。
- 本地 Markdown tracker：front matter 的 parent/assignee/status 表示父子关系、认领及状态，blocked_by 表示依赖；resolution 单独文件记录答案。查询同目录 tickets 的 open、无未关闭 blocker、无 assignee 项得 frontier。
- 冷启动：独立空索引与解析缓存；不声称清空 OS 文件缓存。计时包含 CLI 启动、输入核验、完整 pipeline、DB/FTS、发布和退出。缓存全量重建与无变化重跑另记。
- 原 neonspark 工作区仅只读，使用独立 storage/GITNEXUS_HOME，不改变原索引、业务文件、全局 CLI。
- 遵循 diagnosing-bugs、gitnexus-debugging、gitnexus-cli、ponytail；Unity 真理源为 docs/unity-runtime-process-source-of-truth.md。
- 保留 scope、C# defines、资源与 process 事实、full content/FTS、输入一致性检查；不得通过减少分析能力达标。

## Decisions so far

- [测定并消除 neonspark 全量建图瓶颈](bottleneck.md) — 本轮确认资源/CSV 优化并建立新基线；完整冷构建 436 秒，目标未达，后续继续。

## Not yet specified

- 已识别的输入核验、FTS、资源 I/O、解析成本均已转为明确任务；任务入口和顺序见[后续优化路线图](roadmap.md)。
- 完成上述测量后，是否需要更深的跨阶段数据复用或存储架构调整，以及相应的跨仓库回归范围。
- 若测得机器/存储条件构成限制，如何建立可迁移的性能验收环境；不得直接降低完整性要求。

## Out of scope

- 修改 neonspark 业务逻辑、全局 CLI 安装、发布 npm 包、删除既有索引。
- 通过缩小 scope、跳过资源/FTS/一致性核验或复用热缓存冒充冷启动达标。
