# Verification

## 验证结论

验证目标：本 change 的 [unity-resource-access spec](specs/unity-resource-access/spec.md)，本仓未提交工作区实现，Node v24.15.0。

本地实现、业务回归及 neonnew 完整 A/B 技术验收通过。24 项任务全部完成；用户已授权并完成外部回写，随后归档并整理提交。未发布。

- 最终构建与 TypeScript 检查通过；构建后的 Unity / processor / hydration / publication 用例 173 项通过。
- 全量 npm test 遵守 30 分钟上限后中断，后续按未完成文件补跑，并逐一修复验证三项实际失败。分批合计覆盖 1125 个测试文件：1112 个通过、13 个跳过。这不是一次不间断全量命令通过；大部分无关测试在最后的 Unity 边界修复前运行，最终 Unity 行为另有 173 项专项覆盖。
- 完整 A/B 两版退出 0：总耗时 786.176 → 512.561 s（−34.80%），Unity 阶段 533.882 → 243.398 s（−54.41%），采样峰值堆 6.07 → 1.92 GiB（−68.35%）；RSS / footprint 均下降。352780 条具体关系和完整 seed 相同，资源失败 0，输入和原索引不变。环境限制见 [performance-results.md](performance-results.md)。

## Spec-to-Implementation Coverage

`evidence_ref` 相对于本 change；`external_ref` 是本仓可定位源码/测试引用。pass 表示该行场景已验证，不推导整个 requirement 的全部性能要求通过。

| scenario_key | 场景 / 实现 | evidence_ref | external_ref | verification_result |
| --- | --- | --- | --- | --- |
| TSD-1 | canonical 使用去重资源命中、保留竞争规则与排序 | unity-final-tests.log | //repo://gitnexus/gitnexus/src/core/unity/scan-context.test.ts | pass |
| TSD-2 | 无脚本 prefab-source 仍进入独立记录流 | boundary-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resource-session.test.ts | pass |
| TSD-3 | scope 与超 File.content 大小资源的发现 | unity-final-tests.log | //repo://gitnexus/gitnexus/src/core/unity/scan-context.test.ts | pass |
| RLR-1 | 真实 discovery 后同资源全部选定 GUID 共用一次 semantic open | unity-final-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resource-access.test.ts | pass |
| RLR-2 | 重复 hit 防御、多脚本及同脚本多实例保留独立身份 | unity-final-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resolver.test.ts | pass |
| PRS-1 | 小 YAML 的 local/list/override、AssetRefPath 和 serialized type 输入 | unity-final-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resolver.test.ts | pass |
| PRS-2 | 大资源保留外部 GUID，使用每个组件自身 evidence | unity-final-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resource-access.test.ts | pass |
| PRS-3 | 混合大小写 GUID、negative/stripped objectId | unity-final-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resource-access.test.ts | pass |
| BIW-1 | 消费暂停时不打开下一资源；没有后台结果队列 | boundary-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resource-session.test.ts | pass |
| BIW-2 | 单组件 2000 引用的低预算 spill 与内存事实等价；长 scalar 有界；文件增长不越过 small-input cap | boundary-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resource-session.test.ts | pass |
| BIW-3 | resource/component 完成后释放解析与记录状态；仅必要路由和最终图驻留 | implementation-evidence.md | //repo://gitnexus/gitnexus/src/core/ingestion/unity-resource-processor.ts | pass |
| RTS-1 | memory/file adapter 顺序与记录内容等价，独立临时 I/O 计量 | boundary-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resource-record-store.ts | pass |
| RTS-2 | 预取消、读取中取消、提前关闭、写入/重放/清理故障；保留原始与清理错误 | boundary-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resource-session.test.ts | pass |
| RTS-3 | 独占 mkdtemp，仅清理自有目录，不读复用或删除其他运行遗留 | boundary-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resource-record-store.ts | pass |
| ERC-1 | 坏资源隔离、无可解析组件显式不完整；实际发布 failure receipt、普通 analyze 修复后重试清除 | boundary-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resource-publication.test.ts | pass |
| ERC-2 | discovery/resolution 指纹变化与 missing file 标明资源失败，独立资源继续 | boundary-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resource-session.test.ts | pass |
| QPC-1 | query/parity/lazy 复用选定资源解析，不新增全仓发现 | unity-final-tests.log | //repo://gitnexus/gitnexus/src/mcp/local/unity-lazy-hydrator.ts | pass |
| QPC-2 | strict compact fallback 仍要求 parity rerun，解析成功不等于 runtime closure | unity-final-tests.log | //repo://gitnexus/gitnexus/src/mcp/local/unity-enrichment.test.ts | pass |
| QPC-3 | seed 保留完整 canonical/GUID/resource 映射；不回填全部 prefab-source 流 | unity-final-tests.log | //repo://gitnexus/gitnexus/src/core/ingestion/unity-parity-seed.ts | pass |
| QPC-4 | derived skip、runtime root 清理、资源单跳/双跳及 overlay 失效保持 | unity-final-tests.log；incremental-before.log | //repo://gitnexus/gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.test.ts | pass |
| OAC-1 | 增加脚本数仍为 discovery 一次、semantic 一次；成本分类与暂存计量 | unity-final-tests.log | //repo://gitnexus/gitnexus/src/core/unity/resource-access.test.ts | pass |
| OAC-2 | 用户指定 neonnew 固定输入、两版禁用 parser cache 的完整 baseline/optimized A/B | performance-results.md；neonnew-final-semantic-comparison.json | //repo://gitnexus/.scratch/unity-resource-ab/run-complete.mjs | pass（单台忙碌机器观测，限制见报告） |

## Task-to-Evidence Coverage

| 任务 | 证据与状态 |
| --- | --- |
| 1.1–1.4 | implementation-evidence.md 的原始 pin、真实 discovery 基线、UNKNOWN impact 补证、业务语义基线；完成 |
| 2.1–2.6 | resource session、两阶段读取、resource consumer、预算与真实 spill；最终 173 项测试及 phase 原型；完成 |
| 2.7–2.8 | boundary-tests.log 的取消/清理/坏文件/增长竞态/实际 publication-retry；完成 |
| 2.9–2.10 | unity-final-tests.log 的 resolver、hydration、seed、overlay、derived/runtime 回归；完成 |
| 2.11 | resource-discovery / canonical / resolution / consumer / spill 指标；实际 processor 成本断言；完成 |
| 3.1 | performance-gates.md 在完整 A/B 前锁定数值门槛与默认预算；完成 |
| 3.2–3.3 | 173 项最终业务测试、分批全量覆盖、三项失败原因与修复后验证、build/tsc；完成，保留分批运行限制 |
| 3.4 | performance-results.md 与两份 neonnew-final-*.json：最终完整配对通过全部预设数值和语义门槛；完成 |
| 3.5 | 主资源文档、runtime 真源、CLI skill 及 hydration shared contract 已同步，69 项 shipped-skills 检查通过；完成 |
| 3.6 | 本文件、implementation-evidence.md、performance-results.md 已归并场景/任务证据与差异；未请求提交，提交前仍须 detect_changes；完成 |
| 4.1–4.2 | verification/writeback 已基于最终实测定稿，外部页面文本可审阅；完成 |
| 4.3 | 已按用户当次授权回写并回读核验；见 writeback.md 执行时间与目标 |

## 关键证据入口

| 证据类型 | 证据路径/链接 | 对应 requirement/task |
| --- | --- | --- |
| 执行时间线与精确命令 | [implementation-evidence.md](implementation-evidence.md) | 全部 |
| 数值门槛、预算与原型 | [performance-gates.md](performance-gates.md) | BIW / OAC / 3.1 / 3.4 |
| 最终构建与类型检查 | final-build.log、final-typecheck.log | 3.3 |
| 最终业务回归 | unity-final-tests.log、boundary-tests.log | 2.1–2.10 / 3.2 |
| 分批全量验证 | full-suite.log、remaining-suite.log/json、help-and-skills-final.log、additional-failures-fixed.log | 3.3 / 3.5 |
| 完整 A/B 原始证据 | //repo://gitnexus/.scratch/unity-resource-ab/complete-baseline/、complete-optimized/ | OAC-2 / 3.4，最终配对通过 |

## 缺口与阻塞项

- 首次基线磁盘压力及第一轮优化版清理干扰已排除；重新串行完成最终配对。环境仍有其他应用和 swap，结果是固定输入的一组观测，不是隔离实验室或跨机器保证。
- 外部回写已获本 change 明确授权并完成，无剩余回写阻塞。
- 索引落后于 HEAD，impact 返回 UNKNOWN/partial；已按规则补源码证据，未擅自重建索引，也未声明图检查干净。
- 分批测试不是一次完整命令成功；13 个测试文件因既有条件跳过，未擅自取消跳过或扩展支持承诺。
