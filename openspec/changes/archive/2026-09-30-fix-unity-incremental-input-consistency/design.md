# Design

## Context

规范依据：[unity-incremental-input-consistency](specs/unity-incremental-input-consistency/spec.md)，共 8 requirements。用户已确认方案；此文件承载完整实现决策，不依赖 docs/plans 是否被版本控制收录。


根本错误是把图的阶段性输出当作完整分析输入，再将其作为数据库删除依据。

1. 同 HEAD 但有未提交修改时，`runFullAnalysisInner` 不走早返回；它没有区分“刚发生的修改”和“上次已索引的同一份脏内容”。这是重复工作的触发条件，不是资源丢失的直接原因。
2. 增量候选跳过包含 Unity enrichment 的派生阶段。本轮此时只有 135,935 个文件哈希；上一轮完整图包含 154,296 个。
3. 基于不完整 File 节点集合计算的 `hashDiff` 把 18,361 个尚未补入的 `.asset/.prefab/.unity` 误判为删除。输入清单前后逐字节一致，日志为 `changed=0, added=0, deleted=18361`。
4. 非空差异触发 deferred derived phases，花 186.1 秒重新处理 Unity。然而 `allFilePaths/newFileHashes/hashDiff` 并未随最终图重新计算。
5. 假删除进入 `filesToDelete`；增量子图也没有把这些资源当作待写入文件完整恢复。落库边数从 813,225 降至 478,293；`UNITY_ASSET_GUID_REF` 从 70,788 降至 0。
6. 同一份过早计算的哈希清单被发布到 metadata，错误延续到下一轮。完整 parity seed 仍相同，资源解析没有失败；增量模式跳过全图 collapse 校验，因此 CLI 退出 0。

代码依据：`run-analyze.ts` 约 1929、2203、2294、2344、2359、2808、3198、3283、4087、4253 行；`pipeline.ts` 约 560–603 行。

历史线索：延迟派生阶段来自 `94f67d79`（#3016/#3102），图 File 节点驱动文件哈希更早存在。问题是这两套机制与 Unity 补充 File 节点之间的契约不一致。没有对旧提交做完整二分，不能把该提交认定为独立、唯一的首个坏版本，也没有证据说明上次资源读取优化单独引入了此问题。


实测 pin：源 HEAD `1666e83e`；目标 neonnew HEAD `a9b2894c67ee9087bf2c2e984a356ca7e5135f97`；155,513 路径 manifest SHA256 `c6798e8d9cc7150090f17ff814bbd01aa124f91638930b71434c4bd1faba977a`。Node 24.15.0；冷/热强制全量为 477.559/338.911 秒，普通无变化为 335.431 秒但语义失败。冷/热 352,780 条具体 Unity/流程事实与完整 seed 相同；普通重跑缺失 334,941 条、增加 9 条，seed 却未变。原始输出位于 `.scratch/neonnew-warm-rebuild-20260929/`，正常项目索引未覆盖。性能数字为单组串行观测，有系统换页，不能替代修复后验收。

## Goals / Non-Goals

**Goals:** 满足完整输入、最终输出清单、无变化复用、安全写入、失败隔离和旧 receipt 修复规范；防止误删，并让同一脏工作树无新变化时跳过重型阶段。

**Non-Goals:** 选择性 Unity 资源写回、跨次资源解析缓存、扫描器/FTS 吞吐改造、语言解析变更、130 秒承诺、自动修改目标 Unity 项目或外部治理页面。

## Decisions

### 契约与 requirement 映射

- CompleteAnalysisInputSnapshot / IncompleteInputsAreNotDeletions：完整、可失败的独立输入快照。
- FinalOutputInventory：派生阶段完成后冻结输出路径与写入清单。
- UnchangedInputReuse / SafeUnityChangeRebuild：内容验证后的明确执行决策。
- ReceiptMigrationAndPublication：兼容性版本、修复与成功发布收口。
- CompatibilityAndObservability / SemanticAndPerformanceAcceptance：兼容契约、真实语义与计时验收。


- 删除表示完整扫描确认文件不再属于当前有效输入/输出范围，不能表示某个 phase 尚未运行。
- 文件读取失败、扫描失败和合法删除必须区分；沿用 `computeFileHashesDetailed` 等明确失败信息，不能遗漏失败路径后交给 `diffFileHashes` 当删除。
- 分析输入清单与最终落库文件清单分开：前者用于判断是否重算，后者用于持久化与清理。不要把所有候选输入都当作必须有图节点的文件。
- 新增未跟踪资源、超出源码大小上限的资源、没有脚本引用的 prefab-source 资源也必须参与有效输入识别，不能只枚举旧 metadata 中已有路径。
- 同一批 dirty 内容已被完整索引且本轮没有变化，应允许复用；Git clean/HEAD 只能作为线索，不能单独证明 Unity enrichment 输入没有变化。
- 数据库图、metadata 清单及 parity seed 必须对应同一轮成功分析。无法形成可信结果时保留旧索引，不发布“最新且完整”。
- 实际变更发生在扫描与使用之间时，不发布可用于下一次 no-change 判定的完整 receipt；必要时中止并要求重跑。明确检测范围，不声称能防止任意并发文件写入。


### 3.1 独立、带完整度的输入快照

深化现有输入/增量 Module，Seam 放在“确认本轮有效输入，并选择分析策略”处。Interface 返回当前输入快照、与上次的内容差异及完整度；调用方不管理散落的路径补丁。

Implementation 复用现有 scanner、scope/ignore 规则、Unity 资源枚举和详细哈希能力。Unity 专属路径选择仍归现有 Unity Module；公共增量逻辑只处理通用路径、摘要和完整度，不新增语言名分支或通用插件框架。

快照必须覆盖源码、实际消费的 metadata/资源及语义配置。结合已存在的 analyzer identity、schema/features、分析配置指纹；核对 Unity 配置/规则、C# 工程输入等实际读取依赖。当前 `resolveAnalysisInputs` 只记录 scope/extensions/define symbols，不能假设它已覆盖所有语义输入。依赖覆盖无法证明完整时撤回快路径。

优先使用内容摘要，不用 mtime 相同作为内容相同的充分证明；大资源用有界流式哈希，避免现有 `readFile` × 100 并发模式引入新的峰值。每轮只维护一份可信清单，尽量复用已有扫描/读取结果。这是成功分析的 freshness receipt，不是 YAML/资源解析结果的跨次缓存。

### 3.2 明确的决策表

| 状态 | 推荐行为 |
|---|---|
| 新 receipt 完整、有效输入无变化、身份/配置未变、既有索引无待恢复状态 | 直接复用已发布索引；不执行 parse/scope/Unity/COPY/FTS |
| Unity 有效输入发生变化 | 本轮先完整重算并使用已有 staged full-write 发布；保留 parser cache |
| 旧索引没有新 receipt、版本不兼容、可能已受本问题影响 | 一次完整修复构建后发布新 receipt；保留 parser cache/既有 embeddings 契约 |
| 扫描/读取失败，无法区分变化与删除 | 不生成删除计划，不发布 fresh receipt；明确失败，保留上一完整索引 |
| 非 Unity 项目 | 保持现有增量策略，验证共享逻辑无回归 |
| 用户显式 `--force` 或 `--no-parse-cache` | 保持既有强制语义，不被 no-change 快路径短路 |

**用户已确认的取舍：本轮先让 Unity 的真实输入变更走全量写入。** 好处是避免在修复阶段同时承担跨资源引用、canonical 归属和序列化类型依赖的选择性写回风险；代价是一次小 C# 修改仍可能付出约热缓存全量构建的成本。无变化普通重跑获得快路径。后续可以单独设计经过语义验证的选择性资源写回，不能把这个取舍描述为“所有增量场景都会变快”。

即使有上述保守写入策略，完整构建也必须在派生阶段完成后冻结最终图文件清单；不能保留原来的过早哈希发布。只有输入清单与最终输出清单一致地完成各自职责，才能恢复真实删除语义。

### 3.3 旧索引兼容与发布约束

- 用新 receipt/契约版本触发一次重建，覆盖“图已缺边、但旧 metadata 看起来正常”的状态；不能只修未来运行而沿用受损索引。
- 复用现有 staged full-write，不直接修补旧数据库内部表；旧索引保持到新结果验证和发布成功。
- 发布 receipt 前校验其完整度、所选写入策略和图/seed 对应状态。保留现有失败与 embedding 恢复语义，不让快路径跳过未完成任务。
- 运行中已经失败或不完整的结果不允许成为下一次 no-change 的依据。
- 不假称本次提供了跨所有文件的 ACID 发布；复用既有发布/恢复顺序，新 receipt 不能抢在成功前写入。


### 备选方案与否决原因


| 做法 | 缺陷 |
|---|---|
| 只合并旧 resource 路径 | 漏掉新增资源；可能保留真实删除，不能证明扫描完整 |
| 只排除 `.prefab/.asset/.unity` 的删除 | 让真实删除失效，以数据陈旧换取不丢边 |
| 只在 deferred 完成后重算 diff | 可消除本次假删除，但每次仍先触发重扫；也未证明真实资源变更时选择性写回完整 |
| 只相信 Git clean 或 HEAD 相同 | 不覆盖已索引 dirty 内容、忽略但被实际读取的输入、外部/语义配置 |
| 只比较边数或 seed | 实测 seed 完全相同但图关系已大量丢失；必须检查具体事实 |
| 同时改扫描器并发、FTS 和缓存策略 | 难以区分正确性修复与吞吐收益；本轮先形成可信对照 |


### 测试 Seam 与可观测性

通过实际 CLI 和持久图验证全量→普通重跑，不以 mock 空 diff 替代。内部输入快照 Interface 可做文件读取/枚举失败注入；公开验收必须实际查询持久资源事实和有序 STEP_IN_PROCESS 成员。输出复用/legacy repair/真实变化/验证失败的决策原因；输入核验计入完整 wall。无变化行为门槛为不执行 parse/scope/Unity/COPY/FTS，不设置凭空推算的绝对时间阈值。

## Risks / Migration

- 输入集合漏项会使快路径错误复用：对实际读取依赖做审计；完整度未知时撤回快路径，不以旧 metadata 路径为全量来源。
- 为资源哈希引入 readFile 高并发会增加内存：采用有界流式摘要并复用同轮输入读取，保持大资源能力。
- 真实 Unity 小改动暂用完整写入，可能比有效选择性写入慢；此取舍已获同意，后续单独优化。
- 当前清单失败语义与既有资源解析 incompleteness 不同：前者不能据缺项删除；后者继续遵守既有 partial/失败状态，任何不完整结果不得进入新快路径。
- 旧索引一次修复，保留 embeddings 与 parser cache；新 receipt 缺失时不能仅因为 HEAD 相同就信任受损图。
- 保留既有 staged 发布/恢复机制，不声称给所有侧车文件新增跨文件 ACID 保证；receipt 必须晚于成功校验，失败不能标 fresh。
- 保持非 Unity 增量和显式 force/cache bypass 行为；shared ingestion 不新增语言名分支。
- impact 当前 UNKNOWN/缺目标，图落后 1757 commits；实施前重跑并补实际调用方，HIGH/CRITICAL 按仓库规则处理，不自行重建本仓索引。
- 用户已通过 openspec-apply-change 授权本仓实现与验证；实施、实测和未达项见 verification.md / benchmark.md。外部治理按 binding 单独执行，不继承上一 change 的授权。
