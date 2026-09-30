# Unity 全量构建优化交接

日期：2026-09-30。下一会话目标：继续分析并设计 neonnew 全量/热缓存重建优化，保留上一轮输入一致性修复与无变化快路径。

本文件按用户明确要求保存到仓库 `docs/plans/`，覆盖 handoff 技能默认的系统临时目录。该目录被 `.gitignore` 的 `docs/*` 忽略；用户随后要求整理修改提交，本交接作为相关文档单独加入提交，不改变目录级忽略规则。2026-09-30 用户授权归档提交并取消外部回写，仍未授权下一轮实现。

## 先读哪些已有产物

不要重新推导上一轮已证明的问题，也不要用本交接替代行为规范。

| 入口 | 内容 |
| --- | --- |
| `openspec/changes/archive/2026-09-30-fix-unity-incremental-input-consistency/specs/unity-incremental-input-consistency/spec.md` | 上一轮的行为规范与不可破坏的正确性约束 |
| `openspec/changes/archive/2026-09-30-fix-unity-incremental-input-consistency/design.md` | 假删除根因、用户已确认的全量安全写入取舍 |
| `openspec/changes/archive/2026-09-30-fix-unity-incremental-input-consistency/benchmark.md` | 完整冷/热/两次无变化测量、源码与输入 pin、阶段耗时、内存、具体事实对照 |
| `openspec/changes/archive/2026-09-30-fix-unity-incremental-input-consistency/verification.md` | 测试覆盖、未达项、平台/输入闭包限制 |
| `openspec/changes/archive/2026-09-30-fix-unity-incremental-input-consistency/implementation-evidence.md` | 测试命令、失败诊断、impact 与实现审计 |
| 同 change 的 `tasks.md`、`binding.md`、`writeback.md` | 任务完成度、外部授权约束与回写草稿 |
| `openspec/changes/archive/2026-09-29-optimize-unity-resource-access/` | 更早已归档的资源读取优化，尤其设计中的 canonical、背压、暂存和失败语义 |
| `docs/unity-runtime-process-source-of-truth.md` | Unity 当前架构及查询/发布契约 |

## 当前状态与用户意图

- 更早的 `optimize-unity-resource-access` 已归档。
- `fix-unity-incremental-input-consistency` 已按用户 2026-09-30 指令归档到上表路径，并同步正式 spec；任务为 21 项执行完成、1 项用户取消（22/22 closed）。外部治理回写已取消；本次归档、实现与交接一起整理提交。
- `openspec status` 的 `isComplete: true` 表示规划产物齐备，不能解释成已归档、全部任务完成或测试全绿。
- 上轮针对性回归、build/tsc、neonnew 四轮语义验收通过；完整 npm test 在 30 分钟边界超时，另有历史归档 NUL 检查失败。详细原因和后续专项通过记录见 verification，不重写历史证据以制造全绿。
- 用户原始关注点是带缓存的项目重建曾约 130 秒。旧 1.5.x 项目规模/commit/日志没有可靠 pin，无法承诺恢复该绝对时间，也不能把无变化跳过构建与真实变化后的重建混为一谈。
- 用户已接受上一轮“正确性优先：真实 Unity 变化暂用完整暂存重建”的取舍。最近追问的是全量为什么仍慢、下一轮还有哪些优化空间；尚未要求创建下一轮 change 或开始实现。

## 本轮分析新增结论

以下是基于已存日志与当前源码的只读分析；优化方案尚未做新 A/B，不能当作已实现或已证明的收益。

### 1. 上轮没有减少全量工作量，并增加了输入核验

完整输入快照在 pipeline 前和发布前各执行一次。每次通常至少三组 glob 枚举，另有串行 sidecar stat，以及按固定 16 文件分批、整批等待的流式哈希。pipeline 与 Unity 读者还会自己枚举和读取。

源码：`gitnexus/src/core/unity/analysis-input-snapshot.ts` 的 `captureUnityInputSnapshot` / `hashInputFiles`，以及 `gitnexus/src/core/run-analyze.ts` 的两处调用。

候选：共享同轮完整文件清单、合并遍历、sidecar 有界并发、工作队列替代分批屏障；让实际消费的读取同时计算摘要，减少独立读取。不能直接取消发布前核验或退化为 mtime 判断。扫描范围并不统一：工程/namespace reader 会读取 scope/gitignore 外的 C#；统一枚举必须保留各消费者的选择语义及失败传播。

验证：拆分 enumeration/stat/hash/bytes 计时，测输入核验成本；保持新增、删除、ignored/external、读取失败、运行中变化及旧 receipt 修复回归。

### 2. 资源发现和解析仍分两轮，且均串行处理文件

现有日志显示发现与解析合计读取约 10.1 GiB。两轮原始字节数在修复前后相同，表明上一轮没有减少这里的工作量。`resourceLines` 对普通短行也执行 Buffer 拷贝、拼接和异步逐行交付，是值得 profile 的 CPU/分配候选，尚未证明其占比。

源码：

- `gitnexus/src/core/unity/resource-discovery.ts`：`discoverUnityResources`。
- `gitnexus/src/core/unity/resource-session.ts`：`UnityResourceSession.bindings`。
- `gitnexus/src/core/unity/resource-lines.ts`：`resourceLines`。
- `gitnexus/src/core/unity/scan-context.ts`：`buildUnityScanContext`。
- `gitnexus/src/core/unity/resolver.ts`：资源绑定解析。

先试普通行快速路径、减少拷贝/临时对象，再测小规模有界并发。更大的候选是发现时产生可重放的中间记录，canonical 确定后消费，避免二次读取；必须先评估记录大小、暂存 I/O 和内存成本。

关键约束：canonical 依赖全局资源命中统计，不能边发现边提前固定 Class 归属；长行、UTF-8 分块、取消、背压、资源版本变化及 prefab-source-only 文件必须保留。不要重新引入全仓 YAML/原文常驻内存。跨次资源解析缓存属于新设计范围，上个 change 明确未做。

### 3. CSV 内容准备存在可保持语义的优化入口

`FileContentCache` 默认按 3,000 个文件限制，而非字节预算；读取时同时保存全文与 `split('\n')` 数组，即使消费者只需要 File 全文。CSV 节点遍历中逐个 await 内容提取。

源码：`gitnexus/src/core/lbug/csv-generator.ts` 的 `FileContentCache`、`extractContent`、`streamAllCSVsToDisk`。

候选：字节预算、仅提取符号片段时生成分行数据、避免一次性 metadata 文本污染可复用源码缓存、有界预取并维持输出顺序。分别记录缓存命中/重读字节、CSV bytes、emit/COPY 分段、RSS/heap/footprint，避免把数据库 COPY 与 CSV 生成混作一个原因。

### 4. File FTS 有明显分析价值，但涉及搜索语义

从已保存 metadata 统计，最终 File 构成为：`.meta` 126,933、`.asset` 10,365、`.cs` 9,002、`.prefab` 7,927、`.unity` 69。约 82% 是 `.meta`。修复后热缓存轮 File FTS 占整个 FTS 时间约 79%；**文件数量占比不等于成本占比**，还需按类型统计文本字节和 tokenize 成本。

源码：`gitnexus/src/core/search/fts-schema.ts` 的 `FTS_INDEXES` / `getFtsIndexes`；默认 File 检索字段为 name+content。现有 `symbol-no-file-content` profile 及 `core/content-retention.ts` 可用于设计隔离实验，但不能无说明地改变默认能力。

候选：metadata/资源的搜索内容投影，保留需要的 GUID、路径和关键属性。先明确搜索/内容读取要求，再决定字段或索引策略；不能把减少节点、清空 File 全文或关掉 FTS 冒充等价优化。除图事实之外还需关键词检索与内容返回回归。

### 5. 全量耗时上涨不能全部归因于环境

机器物理内存 24 GiB，现有基准主进程 V8 heap 上限为 18 GiB，之外还有 worker、原生数据库及其他进程。整机换页明显；这证明存在压力，不能证明某阶段变慢完全由外部应用造成。新增核验也可能改变 GC 与文件缓存状态。

候选：按整次构建预算协调缓存、并发与原生内存，并检查“发布前重新枚举/哈希”是否与其他大对象同时存活。不要单纯扩大堆或线程数。下一轮采用同条件交替 A/B、重复样本；整机 swap 不当作本进程独占用量。

## 建议推进顺序

1. 先检查现有工作区和源/dist pin，明确下一轮基线包含正确性修复；检查当前 HEAD/工作区与历史 benchmark pin 的关系，不能拿修复前 HEAD 当新实现。
2. 使用已有记录重建分阶段预算；需要新增 profile 时仅记录能区分假设的成本，不立即重复完整大项目构建。
3. 第一批优先不改外部语义：输入遍历/读取复用、资源短行处理、CSV 字节预算与惰性分行。每次只改一个变量，通过小型真实 fixture 后再做 neonnew A/B。
4. 第二批另行设计：资源可重放中间记录/跨次缓存、FTS 内容投影。它们的失效、搜索与恢复契约更复杂，不混入低风险优化。
5. 用户要求推进时再用 OpenSpec 创建下一轮 change；上一轮现已按用户后续指令归档；下一轮仍需独立规划。

性能验收必须区分冷解析缓存全量、热缓存全量、真实变更重建及无变化普通重跑；所有产品内部核验计入 wall。具体事实、完整 seed、最终 File/哈希清单必须等价，发布失败保留旧索引，无变化继续跳过重型阶段。新增搜索策略还需检索质量验收。130 秒只是历史线索，不是未经验证的承诺。

## 运行与证据入口

- `.scratch/neonnew-input-consistency-final-20260929/`：runner、导出器、实现 pin、输入 manifest、measurements、semantic-comparison、acceptance、各轮日志与系统压力。`benchmark.md` 给出完整命令和存储位置，优先读它，不复制全部证据到交接。
- `.scratch/neonnew-warm-rebuild-20260929/`：修复前同输入测量，其中普通重跑语义失败，不是正确性基准；cold/warm 为正确全量参考。
- runner 拒绝覆盖已完成样本；新实验另建目录。使用 Node 24.15.0（从已保存 invocation 确认路径），默认 shell Node 曾为 26。
- 上轮较早被主动中止的试跑不算有效样本，见实施证据。不要重复全量 30 分钟测试而不先定位问题。
- neonnew 的正常索引与工作树已核验保持不变；继续用独立存储和独立 GitNexus home，不修改用户 C# 来制造实验变化，真实变更用临时 fixture。

## 仓库约束与容易误读的状态

先读根 AGENTS.md、GUARDRAILS.md 与 Unity 真理源。代码检索 graph first，编辑符号前 impact，提交前 detect_changes。图当前落后 1,757 commits；本轮概念 query 为 partial，新增输入模块 context 无目标，FileContentCache context 为 lower-bound。实际结论已用源码核对；不得把 UNKNOWN/空结果当成低风险，也不得自行重建陈旧索引。

工作区包含上一轮实现（本次归档提交包含它），以及原有 `.pi/`、`.scratch/`、`benchmarks/fixtures/unity-mini/` 等无关改动。先看 git status/diff，勿整体还原或整仓提交。`.gitnexus/run.cjs` 在本仓缺失，之前使用本地 `gitnexus/dist/cli/index.js` 作 CLI fallback。

外部治理回写已由用户明确取消，见归档 change 的 binding/writeback。未读取或修改外部治理仓，不存在待授权回写任务。

## Suggested skills

- `diagnosing-bugs`：以已有性能基准为反馈入口，建立可证伪假设，单变量测量。
- `codebase-design`：设计输入读取/内容预算/资源会话的 Module 与 Interface，集中完整性和生命周期契约。
- `gitnexus-debugging` / `gitnexus-exploring`：graph-first 导航及源码核对；使用前先读对应 SKILL.md。
- `gitnexus-impact-analysis`：进入代码编辑前检查影响，明确陈旧图的未知范围。
- `openspec-propose`：用户要求创建下一轮方案时使用；本交接不自动创建 change。
- `openspec-apply-change` / `openspec-verify-change`：方案获准后的实施与验收。
- `openspec-archive-change`：仅用户要求归档时使用，先核对未完成任务和验证限制。

下一位 agent 的第一条有效进展应是：确认现有基线与工作区，并选择一个有明确成本指标、能保持语义的优化切入点；不要重做上一轮假删除诊断，也不要直接宣称全量可恢复到 130 秒。
