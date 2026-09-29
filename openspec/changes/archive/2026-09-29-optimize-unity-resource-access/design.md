# Design

## Context

行为依据：[unity-resource-access spec](specs/unity-resource-access/spec.md)。用户已确认全部设计决策；本文件包含实施所需决策，不依赖 gitignore 中的原始设计报告。

当前 scan-context 的 `seenGuidInResource` 已按资源＋GUID 去重，canonical 选择使用资源命中数。resolver 仍按 symbol 访问命中资源；大资源 lightweight 分支对每个所选脚本重新流式读，deep 分支不缓存超过 512 KiB 的整文件对象。processor 的 `resolvedBySymbol` 和小资源缓存可驻留到阶段结束。发现和 prefab-source 工厂分别读取资源，文档所称“同次扫描”未等于同一次物理读取。

实测 unity-resources 787.321/1231.2 秒，采样 heapUsed 峰值 6.03 GiB；最大 RSS 与 memory footprint 分别约 3.68/15.73 GiB。系统已有内存压力，当前数字是诊断基线而非未来收益承诺。人为重复 hit 只属于防御性输入测试，不能替代真实 discovery 基线。

## Goals / Non-Goals

**Goals:**

- 满足 spec 的两阶段发现、资源级读取复用、语义与证据保持、预算/暂存、完整度、查询兼容及可观测性要求。
- 让关联脚本增多不增加同资源的 analyze 整文件读取/解析次数。
- 将中间数据生命周期从“整个 enrich 阶段”缩短为“仍有实际消费需要的资源/批次”。

**Non-Goals:**

- 不新增跨次缓存，不把大资源默认能力升级为完整深解析，不重做 hydration 调度。
- 不把 scan-context 变成完整语义求值器或图写入者，不改变 UI trace 与 runtime closure。
- 不承诺所有场景恰好一次磁盘读取或整个 Node 进程恒定内存；不新增通用远程存储抽象。

## Decisions

### 1. 资源级 Module 与 Interface

对应 ResourceLevelResolutionReuse、PreserveResourceSemantics、QueryAndPublicationCompatibility。

以资源级解析会话作为 Module，暂称 `UnityResourceSession`。Seam 放在“给定资源选择、已确定脚本归属和解析能力，按资源取得事实”的位置。Interface 包含结果身份/行证据、lightweight/deep 能力、不完整结果、背压、关闭与成本保证；不暴露可变缓存 Map。

Implementation 隐藏大小分流、资源内对象索引、所有所需脚本的关联、去重、读取复用与释放。按资源交付结果允许分批，不要求物化一个巨型 ResourceResult。producer 不写图；processor 统一构造关系身份/reason、summary、diagnostics 并写入已有图载体。

Depth 来自调用者不再管理文件读取与缓存；Locality 来自 analyze 和查询共用解析/证据规则。仅在当前 symbol resolver 加缓存的替代方案未选：它仍保留跨脚本读取和全阶段驻留风险。全仓持久缓存亦未选：首次构建无收益保证且增加失效机制。

### 2. 两阶段及独立信号

对应 TwoStageResourceDiscovery。

流程为资源/元数据选择 → 轻量发现 → canonical 归属 → 按资源解析全部选定脚本 → 统一消费 → 释放。兼容的 script GUID 与 prefab-source 识别共享发现流，但保持独立记录、去重和计数。

canonical 继续使用同一资源同 GUID 一次的命中统计和既有排序。归属未确定前不提前连接到 Class。无脚本的 prefab-source 仍保留；大文件不因 content size cap 被排除。发现记录只保存必要线索，不缓存全仓原文/YAML。

严格单遍方案未选：canonical 依赖全局发现，深解析也需资源内后续对象才能解释 local references/modifications；为单遍而缓存所有内容违反工作集目标。

### 3. 语义结果与身份

对应 PreserveResourceSemantics。

绑定按资源＋objectId＋script GUID 区分，保留 negative ID、stripped、GUID 大小写和路径规则。每个组件 evidence 从自身 m_Script 行提取，seed 的 line=0 只作定位提示。

小资源保留当前已支持的 scalar/reference、local/list、覆盖合并、AssetRefPath 和序列化类型关联输入。大资源只保留现有 lightweight 语义及普通外部 GUID 字段，不借本次扩展深解析能力。历史文档的完整覆盖链愿景不作为新功能悄悄纳入。

资源解析次数与选定脚本数解耦；发现读取、语义读取、临时记录回放分别计量。图摘要需要跨资源累计时，仅保留必要聚合，不保留已消费的全部 bindings。遍历顺序变化不得改变稳定图身份和有效事实。

### 4. 工作集与临时存储

对应 BoundedIntermediateWorkingSet、RunScopedTemporaryStorage。

预算覆盖 retained records、pending results、parse caches，按字节规模而非仅文件并发控制。首先背压和释放，再对必须保留的记录暂存；单资源高基数也走批次/暂存。文件读取缓冲与长行必须计入原型审计，不能用“小批次记录”掩盖无限单行分配。

会话内部采用内存记录与临时文件两个实际 Adapter；不把存储选择暴露为调用者的缓存职责。临时数据有运行身份，正常完成、提前停止、失败清理自有文件。崩溃残留只按可识别所有权回收，不复用为缓存，不删除其他运行/既有索引。

最终图、数据库、必要全局 GUID/canonical/seed 索引与既有 query deep-parser 不是该局部预算全部能控制的内存。分别计量这些类别，禁止将它们当作任意结果逃逸预算的容器。默认字节预算、批次、并发和记录编码在阶段原型后锁定；无需为这些实施参数再次增加业务决策。

### 5. 不完整结果和发布

对应 ExplicitResourceCompleteness。

文件级错误保留资源/能力身份，允许继续独立资源；消费和发布接收明确完整度状态。实施先核对 run-analyze、metadata/status 的现有不完整机制，再选择复用或最小扩展；不能只添日志而仍发布“全部资源完整”。如果需要新增 observable reason，补契约与说明，不在这里预定一个未经源码核对的字段名。

阶段间资源变化使用现有或补齐的一致性检查；无法保证同一版本就标为受影响结果不完整。临时存储损坏等使后续处理不可信的错误终止，不静默退回无界内存。清理失败保留诊断而不覆盖原始错误。

### 6. 查询、seed、overlay 与派生层

对应 QueryAndPublicationCompatibility。

query 仍按 symbol/路径请求，复用资源解析而不执行新全仓发现。保持 lazy 分批、parity seed/fallback、已有 deepParseLargeResources 请求和完整度解释。该共享改造不宣称单次巨型 query deep parse 已有内存上界。

seed 在既有发布时机写入完整必要映射，不能由局部批次替代，不能为了历史 prefabSourceRefs 字段重新积累全量数组。保持已有 overlay/parity cache 版本键与失效，不以裸路径全局缓存替代。不新增跨次构建缓存。

保持 skipGraph/skipDerived、derived runtime root 清理与重算/保留规则，以及资源单跳/双跳链语义。通过具体成员与引用身份验证，不能只比边数。

### 7. 测试与性能验证

对应 ObservableAccessCostAndAcceptance，所有测试从 spec 场景展开。

使用真实临时文件通过 Module Interface 测试；内部读取计量验证 Interface 的成本承诺。首个基线必须走真实 discovery，覆盖一个资源多个不同脚本，不能只手工重复 hit。

观察 discovery、canonical、resolution、consumer 写图和临时 I/O；记录 opens/bytes/parses、selected scripts、pending bytes、spill bytes、失败资源。旧业务测试保留或迁移；新 Interface 覆盖完成后删除仅镜像旧内部拆分的测试。

阶段原型锁定预算和数值验收门槛后，再完整 A/B。固定 runtime/build、目标内容、配置、缓存与 write plan，记录系统负载和 swap；验证语义、耗时和内存均改善。原先没有足够状态控制的两次日志不能当作修复对照。

## Risks / Migration

- canonical 与物理读取融合顺序：以两阶段解耦，冻结资源命中计数与排序测试。
- 图遍历顺序改变：稳定 ID 与最小聚合保持输出；允许纠正重复结果/行号，不把错误旧输出当黄金样本。
- 背压/取消泄漏或死锁：覆盖慢消费者、单资源超预算、提前退出、文件/暂存错误以及跨运行所有权。
- 参数选择尚无实测：先做阶段原型并锁定预算/门槛，再判断最终成功；不得用结构重构代替收益验证。
- 现有索引缓存：不新增持久存储格式。实现变更依既有 analyzer identity 机制刷新索引，不删除旧数据或手工篡改数据库；如需 metadata 扩展，验证旧索引兼容。
- 文档偏差：实施后同步资源绑定主文档、runtime 真源和受影响 skills/contracts，明确“同一阶段”和“物理读取次数”、大小资源分支。
- 交付顺序：真实基线及 impact → 资源解析会话 → 发现融合/有界消费/暂存 → 查询与完整度接线 → 全套验证和 A/B。每次修改前按仓库规则 impact，提交前 detect_changes。
- 当前只完成规划；外部治理回写遵守 binding，不影响本地 apply readiness。
