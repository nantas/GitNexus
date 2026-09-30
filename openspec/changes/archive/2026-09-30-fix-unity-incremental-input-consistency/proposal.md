# Proposal

## 问题定义

neonnew 固定 155,513 路径输入的实测中，热 parser cache 全量重建耗时 338.911 秒；同一脏工作树无输入变化的普通重跑仍耗时 335.431 秒，并误报 18,361 个 Unity 资源删除。持久图边数从 813,225 降为 478,293，70,788 条 UNITY_ASSET_GUID_REF 全部丢失，CLI 却退出 0。

根因是增量候选跳过 Unity 派生阶段后，从不完整 File 节点集合计算 hashDiff；补跑派生阶段后未重新计算清单，旧差异继续驱动删除与 metadata 发布。Git dirty 判断是重复分析的触发条件，图阶段输出与输入清单混用才是误删的直接原因。完整 seed 相等不能证明图未丢失。

## 范围边界

用户已确认：正确性修复＋无变化快路径；Unity 真实输入变化暂用全量安全写入，并复用 parser cache。分离完整分析输入快照与最终落库文件清单，明确失败、真实删除、新增和无变化语义，旧索引一次修复迁移。

无变化判定必须覆盖实际消费的资源、metadata、源码和语义配置；无法证明完整时不得快速复用或生成删除计划。保持显式 force、embedding 恢复、非 Unity 增量和已有查询/资源解析语义。

不实现选择性 Unity 资源写回，不新增跨次 YAML/资源事实缓存，不优化读取内核/并发/FTS，不承诺 130 秒，不自动修改 neonnew 源码或覆盖日常索引。

## Capabilities

### New Capabilities
- `unity-incremental-input-consistency`: 规定完整输入快照、最终图文件清单、内容无变化复用、Unity 变化时安全全量写入、旧索引恢复及语义验收。

### Modified Capabilities

无。既有 `unity-resource-access` 解析、资源完整度与 hydration 契约保持；新增能力约束 analyze 编排与成功索引复用，不替代资源解析规范。

## Capabilities 待确认项

- [x] 用户已确认本能力的全部行为范围与真实变化暂用全量写入的取舍；能力 ID 为该范围的规范归档名称。

## Impact

关注 run-analyze、pipeline 派生调度、输入指纹/哈希、metadata/freshness、Unity 资源枚举，以及 incremental/Unity/publication 测试。共享逻辑不新增语言名分支。graph impact 当前 UNKNOWN/缺目标，图落后 1757 commits；实施前重新 impact 并核对实际消费者。

增加真实 CLI 回归与 neonnew 独立存储三组对照，比较具体资源关系、流程成员、seed 和输入集合；同步 Unity 真理源及相关 CLI skills/contracts。无预定新依赖。旧索引缺新 receipt 时会付出一次全量修复成本，真实小改动暂不获得选择性落库加速。

## 关联绑定

- 关联 binding：`binding.md`。
- 标准、项目与回写目标沿用 binding 中的 `repo://orbitos` 引用；本轮不进行外部回写。
- 已确认设计输入：`repo://gitnexus/docs/plans/2026-09-29-unity-incremental-input-consistency-design.md`。
- 实测证据：`repo://gitnexus/docs/reports/2026-09-29-neonnew-cached-rebuild-benchmark.md`。设计和必要证据摘要将收入本 change，实施不依赖被忽略的报告。
