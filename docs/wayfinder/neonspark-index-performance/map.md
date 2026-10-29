---
id: neonspark-index-performance
labels: ["wayfinder:map"]
status: open
---
# 恢复 neonspark 冷启动全量建图性能

## Destination

在相同 neonspark 输入、配置和完整分析能力下，将本 fork 1.6.12 的冷启动全量建图优化到 180 秒以内，保留可复现基线、阶段计时及语义一致性证据。

## Notes

- 2026-10-28 续：[容器成员接收者修复](receiver-container-fix.md)已实现并验证，产品改动已提交 `3989db52`（fix(scope-resolution): ground collection receiver members on the container）：Case 4 门控 + provider 钩子 + `TypeRef.boundAs` 所有权判据 + `elementErasedTypeApplication` 形态函数；全量 22,096 通过，neonnew A/B 消除 -103 CALLS/-123 ACCESSES 假边与 9 条幻影 process 步骤，硬锚点（符号/清单/内容哈希/UNITY 资源事实/FTS）全一致，元素传播与 repo 容器落地保留。声明驱动候选发现重评已解锁。注：集成测试依赖 dist，源码改动后须先 npm run build。

- 2026-10-28 续：[集合接收者与元素类型混淆调查](receiver-element-type.md)完成——绑定期无条件拍平坐实，现网 441 条 import-resolved 容器方法边存在系统性误配（验证例 `List<UnlockContent>` 的 `.Add` → `AssetRefValueDict.Clear`）；修复设计已移交[实现票](receiver-container-fix.md)，实现前置 impact 与语料 A/B。声明驱动候选发现的重评依赖该修复。

- 2026-10-28 最新：用户选定**阶段锚定判据**（[决议](acceptance-noise.md)）：≥3 次安静窗口冷构建的区段中位数之和 ≤180s，端到端 wall 降为参考。同窗口补测的 full-b4 安静参考 **308.5s**（CPU 727.9s ≈ 旧参考；receipt/语义产物与 full-b1 逐字节一致；unity-resources 69.8s——旧 464.5s 参考含外置 HFS+ 源盘惩罚 150.2s）。当前缺口 ~126s；FTS+发布段（94.5s）成为第二大区段且无内部标记，若成为主项需先加区段日志。

- 2026-10-27 最新：基准输入仓已切换。neonspark 工作区转入活跃开发（Unity Editor 常驻），按用户指示不再作为测量输入；改用 `/Users/nantasmac/projects/neonnew`。[neonnew 重立基线](neonnew-rebaseline.md)完成：同产品语义全对齐、阶段锚点复现，但端到端完整 wall 被环境噪声支配（1310-1503s，旧参考 464.5s 不可复现）。验收噪声策略已立新票；neonnew 既有 `.gitnexus` 索引受保护未触碰。

- 2026-10-27 最新：[namespace 范围修复与对照](namespace-scope-fix.md)完成，纯代码 152.257→133.875 秒，完整参考 464.535 秒。代码内容/符号、资源事实、FTS 与 302 项回归通过；已更新 baseline-current，清理约 12.33 GB 实验索引。180 秒未达。扩大声明候选方案不采纳，后续先区分集合接收者与元素类型。

- 2026-10-27 最新方向：[拆分纯代码与 Unity 资源分析基线](code-resource-baseline.md)，先建立代码基线，再从资源需求审查全范围分析；允许隔离测量，不将删减能力计作完整构建达标。

- 2026-10-26 用户授权无人值守连续完成当前基线与新方向下的候选验证，逐项采纳/否决后重建基线并汇报；覆盖 wayfinder 单会话只解决一票限制。候选须由成本和等价性证据产生，不将探索无限扩展；不提交、发布或触碰原 neonspark 索引。
- 当前基线已重设为 [baseline-current.json](baseline-current.json)：已采纳改动已在 bbf05f4e 落盘，默认线程池/当前输入证据固定。按[新分析](rebaseline-analysis.md)重新排序：先整轮耗时/生命周期总账，再选择跨阶段复用，不拘泥旧方向。两个新票记录后续验证，旧票保持历史决策。

- 当前：[现有验证项收口与候选否决](resolution.md#现有验证项收口与候选否决2026-10-26)。用户要求连续完成现有验证并清理巨大文件；四个调查票已有决策，线程池候选无探针退化、不采纳。完整性/召回/回归通过，但 180 秒目标未通过，地图保持 open；大型实验索引已回收。下列“下一步”为历史推进记录。

- 当前：[线程池完整构建交替验证](resolution.md#线程池完整构建交替验证2026-10-26)显示 16 线程候选在正反两对完整构建中更快，但尚未采纳。下一主项是[作用域准备 I/O](scope-resolution.md)，再做无探针验收；180 秒目标仍未达。

- 最新：[小文件原生操作与线程池对照](resolution.md#小文件原生操作与线程池对照2026-10-26)已在 SHA 固定的 `.meta` 回放中验证原生追踪；read/fstat/close 长尾可见，16 线程缩短部分排队但增加 CPU。下一步由 [FTS 内容导入调查](fts.md)验证真实构建中的线程池候选，尚未采纳。

- 最新：[CSV 预读长尾定位](resolution.md#csv-预读长尾定位2026-10-26)将主项收窄到 `.meta` 小文件 readFile 等待。慢样本自身 95.1% CSV wall 在预读，但其最终输入发生变化、发布被拒绝；保留失败证据，不能作为成功基线。下一步固定回放输入后拆解文件操作，仍由 [FTS 内容导入调查](fts.md)承接。

- 最新完整对照：持续补位未显示有意义的最终核验收益，暂不采纳；当前输入已得到完整 A/B 及 361,665 条相关事实一致性证据。下一主项转至 [FTS 前内容导入的 CSV 等待与内存压力](fts.md)，详见[决议](resolution.md#持续补位完整构建与压力归因2026-10-26)。目标仍未达到。

- 最新：当前输入下三对只读对照确认持续补位的哈希小收益；[输入核验](input-validation.md)下一步做完整构建上下文/峰值验证。尚未正式采纳，不将只读差异外推为整体提速。

- 当前输入已前进到 HEAD 2f935a0，164,026 文件；本轮仅建立只读诊断快照，旧完整基线保留。操作计时已复现无 DB 的快慢样本，[输入核验](input-validation.md)下一步检验批次尾部等待/同并发持续补位；未采纳产品改动。

- 最新：2026-10-26 六次无采样器构建已完成，缓冲候选未通过完整 wall/峰值验收，暂不采纳。[输入核验](input-validation.md)下一步定位文件访问等待，区分外置 HFS+ 源盘和内置 APFS 索引盘；事实与结论见路线图最新决议。

- 2026-10-26 GC/缓冲对照已有机制证据，下一主项转到[输入核验候选重复验收](input-validation.md)；FTS 仍 open。最新调查见路线图，不以单对样本采纳优化。

- 2026-10-23 用户已同意继续并确认采用当前字体输入；重复测量条件已完成，下一主项为 File FTS/发布前核验压力。历史基线整理轮的暂停已结束。

- 2026-10-23 用户要求先固定本轮提交作为新基线、更新后续路线图；源码基线为 `bbf05f4eeb9630fecd531010edab9f1e7f674500`，本轮不继续实现新优化。

- 2026-10-23 用户确认：冷启动全量为主验收口径；覆盖 wayfinder 默认 planning-only，建图后继续测量、实现和验收。
- 本地 Markdown tracker：front matter 的 parent/assignee/status 表示父子关系、认领及状态，blocked_by 表示依赖；resolution 单独文件记录答案。查询同目录 tickets 的 open、无未关闭 blocker、无 assignee 项得 frontier。
- 冷启动：独立空索引与解析缓存；不声称清空 OS 文件缓存。计时包含 CLI 启动、输入核验、完整 pipeline、DB/FTS、发布和退出。缓存全量重建与无变化重跑另记。
- 测量输入仓为 neonnew（原 neonspark 工作区仅只读且现已转入开发）；两者均为同仓克隆，使用独立 storage/GITNEXUS_HOME，不改变目标仓索引、业务文件、全局 CLI。
- 遵循 diagnosing-bugs、gitnexus-debugging、gitnexus-cli、ponytail；Unity 真理源为 docs/unity-runtime-process-source-of-truth.md。
- 保留 scope、C# defines、资源与 process 事实、full content/FTS、输入一致性检查；不得通过减少分析能力达标。

## Decisions so far

- [区分容器成员的接收者解析修复](receiver-container-fix.md) — 实现+验证完成：集合接收者的直接成员解析落到容器（repo 容器 MRO/BCL 判 unresolved），切断元素同名误配的假边；A/B 证据齐全，残留（同值别名）已界定；声明驱动 namespace 候选发现重评解锁。

- [区分 C# 集合接收者与元素类型](receiver-element-type.md) — 混淆坐实：单参集合绑定无条件拍平为元素类型，容器成员落全库名字兜底产生错误边（441 条 import-resolved，116→NetworkWriter.ToArray、52→RoomRecorder.Add 等）；修复设计移交实现票，完成后重评声明驱动候选发现。

- [定验收噪声策略](acceptance-noise.md) — 用户选定阶段锚定判据；安静窗口参考 full-b4 308.5s（区段：快照 30.4/scan 13.4/parse 40.7/scope 26.1/unity-resources 69.8/导入 29.5/FTS+发布 94.5），旧 464.5s 参考含外置盘读惩罚，实际缺口 ~126s。

- [neonnew 重立基线](neonnew-rebaseline.md) — 同一产品在新输入仓上语义全对齐（receipt/符号/Unity 事实/九类关系/FTS 全部一致），阶段锚点复现；端到端完整 wall 被环境噪声支配（1310-1503s，各含一个落点不定的 ~1000s 慢区），连旧 464.5s 参考都不可复现，180 秒判定需先定验收噪声策略。

- [验证 namespace 证据范围与引用目标是否一致](namespace-scope-research.md) — 复现范围外 namespace 放行内部错误目标；真实源码 resolver 回放收窄后 19 处变未解析。后续[候选归属修复](namespace-scope-fix.md)已验证落盘；保留原候选生成，不扩展为 namespace 多目标重写。

- [拆分纯代码与 Unity 资源分析基线](code-resource-baseline.md) — 纯代码两轮 532.036/154.657 秒且输入/内容/全部关系一致；完整 879.226 秒与旧完整图一致。资源 phase 76.576 秒。转向输入集合、早期过滤与 `.meta` 物化需求，三轮实验索引已清理。

- [合并后执行效率候选验证](architecture-validation.md) — 采纳 CSV 按需分行；恢复输入后的两对完整 wall / CPU / 峰值门槛及全部语义通过。额外字节预算和 C# 结构复用不实施。新基线候选 715.251 / 446.985 秒，源码与 dist 已落盘、未提交；180 秒未达。

- [选择有界的跨阶段复用点](stage-reuse.md) — 当前全部候选验证决策完成：6 GiB 完整构建崩溃；投影语义通过但阶段收益/峰值门槛失败，均不采纳。新默认三轮基线 452.759 / 830.656 / 373.027 秒，中位数 452.759 秒；源码保持 `bbf05f4e`，180 秒目标未达。

- [补齐整轮耗时与生命周期总账](phase-accounting.md) — 785.574 秒账本闭合，旧启动/发布残差未复现；优先筛选资源投影复用，保留未知区间与环境限制。
- [测定并消除 neonspark 全量建图瓶颈](bottleneck.md) — 本轮确认资源/CSV 优化并建立新基线；完整冷构建 436 秒，目标未达，后续继续。
- [建立可比较的重复测量条件](measurement.md) — 已按用户确认的新输入完成三轮冷构建；识别阶段波动和有限的 ignore 缓存收益，下一主项转向 File FTS 与发布前核验压力。

- [降低输入核验 I/O 成本](input-validation.md) — 小缓冲、持续补位、目录限流与 ignore 缓存均沿用已有否决/收益不足结论，不采纳；两次完整哈希与输入变更回归保留。
- [降低 full-content FTS 构建成本](fts.md) — 线程池 16 未通过无探针整轮 wall/CPU 门槛，不采纳；实际中英及后段 FTS 召回和错误回归通过。
- [定位资源扫描剩余 I/O](resource-io.md) — 资源大小分布及 discovery/resolution 重复读取已测；没有等价复用证明，不实施缓存/合并，错误/取消/预算回归通过。
- [定位解析与作用域准备成本](scope-resolution.md) — 配置、命名空间、Razor 与内容准备已拆分；截断原因已定位，无固定百秒重复扫描证据，不修改扫描范围或实现。

## Not yet specified

- 现有输入核验、FTS、资源 I/O、作用域候选已完成验证决策，详见[后续优化路线图](roadmap.md)。验收噪声口径已立新票；阶段锚点（热缓存阶段成本、纯代码整轮 ≤165s）作为当前可靠的测量锚。
- 哪种存储/处理架构调整值得进入跨仓库设计与回归；可明确的跨阶段复用选择已转为新任务，不预设缓存方案。
- 环境慢区根因（SSD 长尾/内核回写节流/其他后台任务）未定罪；只有当候选优化需要引用它时才值得继续取证。

## Out of scope

- 修改 neonspark 业务逻辑、全局 CLI 安装、发布 npm 包、删除既有索引。
- 通过缩小 scope、跳过资源/FTS/一致性核验或复用热缓存冒充冷启动达标。
