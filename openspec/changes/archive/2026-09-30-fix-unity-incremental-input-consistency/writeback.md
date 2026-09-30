# Writeback

## 回写摘要

- change：`fix-unity-incremental-input-consistency`。
- 回写结论：用户于 2026-09-30 明确要求“不用外部回写了”。本地摘要保留供审计，外部回写已取消，未执行任何外部写入。
- 关键结果：独立验证 Unity 分析输入；内容无变化时复用索引；旧 receipt 或真实变化时完整暂存重建；读取、版本一致性或不完整替换失败不覆盖已有图。历史普通重跑的假删除已由真实 CLI 回归复现并修复。

## Capability / Spec 增量摘要

| Capability | 变更类型 | 对应 spec 文件 | 增量摘要 |
| --- | --- | --- | --- |
| unity-incremental-input-consistency | New | `specs/unity-incremental-input-consistency/spec.md` | 8 requirements：完整输入、最终输出清单、无变化复用、真实变更安全重建、失败与删除区分、receipt 迁移/发布、兼容与可观测性、真实语义/性能验收 |

## 验证结论与证据入口

| 验证维度 | 结论 | 证据入口 |
| --- | --- | --- |
| Spec-to-Implementation | 核心实现、故障回归及 neonnew 四轮通过；完整测试超时且有既有 NUL 检查失败，不能宣称全套通过 | [verification](verification.md) |
| Task-to-Evidence | 命令、固定输入、四轮测量、逐事实对照、已通过检查及未达项逐项记录 | [implementation-evidence](implementation-evidence.md) |

## 可回写的结果摘要

- 根因：延迟派生阶段的临时 File 节点集合被当成完整输入/删除依据，造成无变化重跑假删除；dirty 工作树也不能区分已索引内容与新变化。
- 修复：独立完整输入摘要与成功 receipt；无变化在重型 pipeline 前复用；真实 Unity 变化/旧 receipt 完整暂存重建，失败不覆盖旧完整索引。
- neonnew：无变化 45.237 / 36.504 秒（旧 335.431 秒且丢事实）；352,780 条具体事实、完整 seed 与 154,296 个持久 File/哈希在四轮完全一致；正常索引/工作树不变。
- 取舍：本次冷/热全量 754.104 / 691.188 秒，**全量未提速**；新增前后输入核验成本，且系统压力不同。旧索引先修复一次，真实变更暂不选择性写回。
- 验证限制：针对性测试、build/tsc 通过；完整 npm test 30 分钟超时，归档中既有 NUL 检查失败保留。没有宣称全套通过、130 秒保证或运行时 closure 完备。
- 证据：[verification](verification.md)、[benchmark](benchmark.md)、[implementation-evidence](implementation-evidence.md)。

## 回写目标与字段映射

| 目标页 | 同步字段/区块 | 回写内容 |
| --- | --- | --- |
| `repo://orbitos/20_项目/GitNexus 开发/Project_GitNexus_Progress.md` | 本次开发进展（实际区块待重读目标确认） | change/capability 链接、根因、修复行为、验证与性能数字、全量重建取舍和未完成项 |

## 回写执行结果

| 目标页 | 执行结果 | 执行时间 | 执行人 | 结果说明/链接 |
| --- | --- | --- | --- | --- |
| `repo://orbitos/20_项目/GitNexus 开发/Project_GitNexus_Progress.md` | 用户取消 | 2026-09-30 记录取消；未执行写入 | 本 change 执行者 | 用户明确要求归档提交、无需外部回写。任务 4.3 按取消关闭，不记作回写成功。 |

## 取消说明

用户已取消外部动作，外部标准/目标页重读和授权核对不再作为本次归档前置工作。历史目标仅供追溯。

## 不回写的内容

- 不复制完整 proposal、design、specs、tasks 正文。
- 不混入上一 change 或无关工作区改动。
- 不把中止试跑、测试失败或未执行的外部动作写成成功结果。
