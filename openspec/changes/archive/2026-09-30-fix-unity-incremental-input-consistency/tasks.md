# Tasks

规范依据：[unity-incremental-input-consistency](specs/unity-incremental-input-consistency/spec.md)；实现决策：[design](design.md)。下列 requirement 名称均指该 spec。执行证据见 [implementation-evidence](implementation-evidence.md)。

## 1. Spec 覆盖与实现准备

- [x] 1.1 固定源码 HEAD、runner/build、工作区现状及 neonnew 输入清单，建立 8 requirements 到代码/测试的覆盖表；保留现有 3 组测量与具体事实证据，不能用退出码 0 作为通过。
- [x] 1.2 对 run-analyze 编排、pipeline 派生调度、哈希/receipt、Unity 枚举拟改符号执行 impact；UNKNOWN/缺目标核对实际消费者，HIGH/CRITICAL 按规则处理，不擅自重建陈旧本仓图。
- [x] 1.3 在真实临时 Unity fixture 建立 full→同一 dirty 内容普通 analyze 的失败回归，查询持久节点、具体资源关系、有序流程成员、seed 和哈希清单，复现假删除；对应 FinalOutputInventory / SemanticAndPerformanceAcceptance。
- [x] 1.4 审计完整输入依赖和现有配置/identity 指纹覆盖，列出源码、metadata、资源、Unity 配置/规则、工程输入的枚举与内容判定来源，标明失败传播；对应 CompleteAnalysisInputSnapshot。

## 2. 核心实现任务

- [x] 2.1 实现独立完整输入快照及明确不完整结果，复用 scanner/scope/ignore 和 Unity 输入选择；验证新增未跟踪资源、大资源、prefab-source-only、scope 排除，禁止依赖旧图节点证明完整。
- [x] 2.2 实现有界内容摘要与同轮输入复用，保留 unreadable/枚举失败，不把缺哈希当删除；故障注入验证无删除计划且旧索引保留，对应 IncompleteInputsAreNotDeletions。
- [x] 2.3 分离并在必要派生阶段完成后冻结最终输出文件清单，清除过早 diff 的使用与发布；通过 1.3，验证真实删除仍生效、候选输入不被强制物化为图节点。
- [x] 2.4 按 design 决策表实现 Unity changed→完整重算/staged full-write，保留 parser cache 与 embeddings 契约；实际源码变化、资源增删改/重命名、GUID/canonical/serialized-type 变化与 force 结果逐事实对照。
- [x] 2.5 实现版本化成功输入 receipt 与 legacy 一次修复路径；覆盖旧索引无 receipt、已丢关系但看似健康、配置/分析器身份变更、失败不发布 receipt，对应 ReceiptMigrationAndPublication。
- [x] 2.6 在所有必要恢复与身份检查后、重型 pipeline 前接入内容无变化复用；同一 dirty 内容连续运行两次，断言 parse/scope/Unity/COPY/FTS 均未调用，图/seed/清单不变。
- [x] 2.7 验证 clean HEAD 下被实际消费的 ignored/external 输入变化不能命中快路径；显式 force/cache bypass、embedding checkpoint 和 incomplete 状态不能被短路。
- [x] 2.8 接通输入版本一致性与发布失败路径；阶段间修改、读取失败、replacement 失败不得产生可复用完整 receipt；复用已有发布恢复顺序，验证旧完整索引可恢复。
- [x] 2.9 增加 reuse/real-change/legacy-repair/input-failure 决策原因及验证成本输出，保持非 Unity 增量、Unity 查询/hydration、runtime-root 与 seed 语义；对应 CompatibilityAndObservability。

## 3. 收敛与验证准备

- [x] 3.1 运行 incremental/Unity/freshness/publication 相关回归，覆盖全部 spec scenarios；测试实际数据库事实，不只 mock diff、检查计数或 seed。
- [x] 3.2 在 gitnexus/ 执行 npm test、npx tsc --noEmit 和必要 build；单次 10–30 分钟上限，失败保留输出并定位，不自动重试。
- [x] 3.3 使用 neonnew 独立存储和固定输入，复跑冷缓存全量、热缓存全量及两次无变化普通 analyze；验证基准具体关系/流程成员/seed 等价，无假删除，正常索引与工作树不变，记录系统压力。
- [x] 3.4 对无变化运行验证无重型阶段与 DB 写入，输入核验计入完整 wall；报告实测耗时和内存，不把历史 130 秒设为保证。不修改 neonnew 用户 C#，真实修改场景使用 fixture。
- [x] 3.5 同步 Unity 真理源、CLI skill/shared contracts 和受影响 metadata/status 文档；检查 shipped mirrors，运行适用同步检查。整理实现证据 pin、完整命令、失败说明和语义对照。
- [x] 3.6 完成 diff 检查；若进入提交环节，先 detect_changes，partial/truncated/陈旧图不得冒充完整安全结论，不包含无关用户改动。

## 4. 验证与回写收敛

- [x] 4.1 依据真实实现生成 verification.md，覆盖 spec-to-implementation 与 task-to-evidence，明确未达项；规划校验不能代替实施验收。
- [x] 4.2 依据 verification.md 与 binding.md 生成 writeback.md，实际外部回写前重读标准/目标并核对本 change 授权，记录缺口，不混入核心实现任务。
- [x] 4.3 用户于 2026-09-30 明确取消外部回写；本项按取消关闭，未执行任何外部写入，不记作回写成功。

本仓任务已收口：21 项执行完成、1 项按用户指令取消（22/22 closed）。3.2 表示已执行规定命令，**不表示完整 npm test 全绿**；30 分钟超时和既有归档 NUL 失败见 verification.md。2026-09-30 用户明确要求归档并提交，且无需外部回写。
