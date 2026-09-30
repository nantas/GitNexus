# Verification

## 验证结论

本仓核心实现与 neonnew 四轮语义/性能验收通过；**完整仓库测试未获得全绿结果**。恢复状态组合补测也已通过。不得把 OpenSpec 文档校验当作测试通过。2026-09-30 用户在已知以下限制的上下文中明确要求归档并提交、取消外部回写；归档不改变测试结论。

源码基线 `1666e83ee433f7461fff6028afdf74ec4b5f50b2` 加本 change 工作区实现；Node 24.15.0。四轮源码/dist 内容 pin、命令和压力记录见 [benchmark](benchmark.md)。

neonnew 普通无变化重跑由旧版 **335.431 秒且语义失败**，变为 **45.237 / 36.504 秒且事实完整**。本轮冷/热强制全量为 **754.104 / 691.188 秒**，比旧测量慢；输入前后核验增加成本，系统压力也不同，不能宣称全量优化成功。真实变化及旧 receipt 一次修复仍采用完整暂存重建。

## Spec-to-Implementation Coverage

| Requirement | 实现落点 | 验证证据 |
| --- | --- | --- |
| CompleteAnalysisInputSnapshot | `core/unity/analysis-input-snapshot.ts` | 6 个快照单测：内容、新增大资源、scope/fallback、GUID、ignored 工程/外部 define、cwd 配置、prefab-source 开关、失败；162,488 个完整输入跨四轮 receipt 一致 |
| FinalOutputInventory | `core/run-analyze.ts` | 全派生后最终 File 清单；deferred 后重算 diff；真实 CLI 原版失败、新版通过；neonnew 154,296 个持久 File 与发布哈希逐路径一致 |
| UnchangedInputReuse | 重型 pipeline 前 receipt gate | dirty fixture 连续复用；neonnew 两轮无 phase/COPY/FTS，lbug/metadata/seed inode、mtime、大小及侧车摘要不变 |
| SafeUnityChangeRebuild | 强制完整重算、staged full-write，保留原 embedding 模式 | C#、资源增删改/重命名、GUID、canonical 切换、serialized type：普通 analyze 与 force 的具体事实/seed/文件哈希一致；热缓存 128 hit / 0 miss |
| IncompleteInputsAreNotDeletions | 严格枚举、16 路流式内容哈希、发布前重验 | 缺失/权限错误、目录不可读、运行中改写、可读但解析不完整的 replacement 均不发布错误完整结果；原图保留 |
| ReceiptMigrationAndPublication | version 1 receipt、成功发布后 metadata | 无 receipt 的旧索引完整修复；注入最终 rename 失败保留旧图/seed/receipt/indexedAt；恢复后成功 |
| CompatibilityAndObservability | 原有身份/恢复 gate、原因/验证成本日志、非 Unity 分支 | 共享增量目标批次与稳定源码专项复核；非 Unity 单测；force/cache bypass；中断/embedding 恢复组合补测见下文 |
| SemanticAndPerformanceAcceptance | 真实 CLI fixture、隔离 neonnew 四轮 | 352,780 条规范化具体事实（含有序流程成员）与完整 seed 完全一致；正常索引、工作树、155,513 路径 manifest 前后一致 |

## Scenario-to-Test Coverage

以下对应 spec 的全部 19 个 scenarios；“CLI”指 `gitnexus/test/integration/unity-input-consistency.test.ts`，“snapshot”指 `gitnexus/test/unit/unity-input-snapshot.test.ts`。

| Scenario | 可观察验证 |
| --- | --- |
| Deferred resource nodes | CLI red→green，旧版丢失 7 个资源哈希及实际关系；新版连续复用保留 |
| Newly added and large resources | snapshot 新增 2 MiB prefab、重命名/删除、没有脚本引用的资源仍进入摘要 |
| Configuration and metadata changes | snapshot GUID、外部 csproj、ignored C# 工程、Unity 配置和 env；scope/fallback |
| Derived stages add File nodes | CLI 最终 File/哈希；neonnew 全部 154,296 路径集合一致 |
| Actual resource deletion | CLI 删除新增 prefab，普通与 force 逐事实一致 |
| Same dirty working tree twice | CLI 与 neonnew 两次普通重跑，具体图/seed/清单一致且跳过重型阶段 |
| Clean HEAD with changed consumed input | CLI clean Git 下新增 ignored prefab 触发重建；snapshot 外部 define/ignored 工程改动改变摘要 |
| Explicit rebuild or pending recovery | CLI force、no-parse-cache 不复用；恢复组合补测：incrementalInProgress 修复、foreign embedding checkpoint fail-closed |
| Code changes with unchanged resources | CLI canonical script 切换实际 seed 路径，新增 serialized type 实际关系；每次与 force 对比 |
| Resource and GUID mutations | CLI source/resource edit、资源增删/rename/GUID，每次与 force 对比 |
| Failed replacement | CLI 注入 staging→lbug rename 失败，旧图/seed/receipt/indexedAt 保留并可恢复 |
| Read or enumeration failure | snapshot 缺失/不可读子树；CLI unreadable resource，原图及 metadata 字节不变 |
| Source changes during analysis | CLI onProgress 在初始摘要后追加源码，发布前拒绝，旧图保留 |
| Apparently healthy old index | CLI 删除两份 metadata 的 receipt，其余保留，仍执行 legacy-repair |
| Publication failure | CLI final rename 失败不发布新 receipt；可读但不完整 replacement 同样拒绝 |
| Non Unity analysis | snapshot 普通 TS repo 不进入 Unity 策略；共享 incremental/derived 目标回归 |
| Explain rebuild decision | CLI/neonnew reuse、legacy-repair、real-change、explicit-rebuild-or-recovery 与输入耗时；失败显式 input-failure |
| No change regression | 实际 CLI 持久关系/有序成员/File/seed/哈希，不以 exit 0 或 seed 相等单独验收 |
| Controlled neonnew comparison | 四轮隔离运行、固定源码/输入/配置、具体事实等价、系统压力与正常索引保护；acceptance.json 全部 true |

## Task-to-Evidence Coverage

| Tasks | 证据与结果 |
| --- | --- |
| 1.1–1.4 | [implementation-evidence](implementation-evidence.md)：基线 pin、UNKNOWN impact 的源码核对、red 回归、输入依赖审计 |
| 2.1–2.9 | 新输入模块、可选 metadata receipt、编排/最终清单/发布保护；真实变更与故障注入测试及具体事实对照 |
| 3.1 | 最终 snapshot+CLI 7 tests 通过；6 个编译后 Unity suites 共 52 tests 通过；merge-review 4/4 通过；共享增量批次 44 pass/2 identity 漂移 fail，冻结源码后该 2 项专项通过；恢复补测日志单列 |
| 3.2 | build、tsc 通过；全量 npm test 在 1,800 秒上限停止（exit 124），既有归档 NUL 失败保留，未宣称全套通过 |
| 3.3–3.4 | [benchmark](benchmark.md)，四轮事实/seed/File/hash/receipt 一致；无变化不改 DB；正常项目完整状态与 manifest 不变；耗时包含输入核验 |
| 3.5 | Unity 真理源、CLI 四份镜像、runtime shared contract 两份同步；shipped-skills 检查随 75-test 批次通过；不改变 CLI 参数、MCP/query/hydration 契约 |
| 3.6 | 归档提交前 diff 检查通过；已运行 detect_changes(scope: all)，陈旧索引返回零符号不作为安全结论；80 项相关测试、构建及类型检查通过。提交范围排除无关修改，详见 implementation-evidence.md 归档记录 |
| 4.1–4.2 | 本文与 [writeback](writeback.md)：完整覆盖、测量、未达项及外部回写草稿 |
| 4.3 | 2026-09-30 用户取消，按取消关闭；未执行外部写入 |

## 关键证据入口

- [根因与决策](design.md)、[实现审计与全部运行历史](implementation-evidence.md)、[正式性能与语义报告](benchmark.md)。
- `.scratch/unity-input-tests-pinned.log`：最终 2 files / 7 tests，83.55s；`.scratch/unity-input-node-tests.log`：52 pass；`.scratch/unity-input-final-regression.log`：merge-review 4 pass（同轮另一项新 fixture 问题随后已修正）。
- `.scratch/unity-input-stable-identity-rerun.log`：2 pass / 27 intentionally skipped，39.25s；`.scratch/unity-input-recovery-acceptance.log`：恢复组合补测 1/1 通过，55.31s。
- `.scratch/unity-input-full-test.log` / `unity-input-full-test-result.json`：完整测试的真实超时/失败记录。
- `.scratch/neonnew-input-consistency-final-20260929/acceptance.json`：17 项检查 true；对应原始事实、seed、文件状态和 pin 同目录保存。

## 缺口、风险与未执行项

1. **全量测试不绿**：30 分钟边界内未完成，不能推断其余全部用例通过。`source-control-bytes` 的既有失败来自归档 `neonnew-working-tree-before.txt` 中 44 个 NUL；该文件与 HEAD 逐字节相同，是历史 status -z 证据，未为通过测试改写。测试政策/归档格式的单独处理不在本 change 范围。
2. **全量性能未改善**：详见上表和 benchmark；快路径只适用于成功修复后、完整输入无变化且没有恢复义务的索引。首次旧索引需要修复重建。未声称恢复旧 1.5.x 的全量 130 秒水平。
3. graph impact UNKNOWN，索引落后 1,757 commits；实际消费者已源码核对，未将空结果当 LOW risk，未擅自重建。新增未索引测试文件 impact 同样 UNKNOWN。
4. 输入摘要为保守集合，可能额外失效。混合语言依赖闭包未证明时禁用复用；Windows/config 无 staged swap 时拒绝 Unity 安全重建。前后摘要能检测观察到的变化，不能防止两次读取间改写又恢复，亦未新增跨所有侧车的 ACID 发布。
5. neonnew 导出器的只读打开出现既有 missing-shadow WAL quarantine 诊断；具体事实与主数据库前后状态一致。该导出在计时外，不将它误记为普通 analyze 的图写入。
6. 外部治理回写于 2026-09-30 按用户明确指令取消，4.3 按取消关闭。用户同时授权本地归档与提交；未执行外部发布。
