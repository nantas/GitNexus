# Tasks

规范依据：[unity-resource-access](specs/unity-resource-access/spec.md)；实现决策：[design](design.md)。完成状态以任务勾选和 implementation-evidence.md 为准。缩写 requirement 名称指向该 spec 的同名要求。

## 1. Spec 覆盖与实现准备

- [x] 1.1 固定实现起点、工作区改动、目标仓内容和当前 runner identity，建立 8 个 requirements 到测试/代码位置的覆盖表；将旧重复 hit 复现标为防御性输入证据，不作为 analyze 根因基线。
- [x] 1.2 对 scan-context、resolver、processUnityResources、查询解析入口及拟改 metadata/status 符号执行 impact，记录调用方/流程/风险；先核对图新鲜度，UNKNOWN 补证，HIGH/CRITICAL 按规则处理，未获准不重建图。
- [x] 1.3 为 ResourceLevelResolutionReuse / TwoStageResourceDiscovery 建立真实临时资源的 discovery→canonical→resolver 基线：同资源多脚本、同脚本多实例；记录 opens/bytes/parses 和有效绑定，验证能够检测当前跨脚本重读。
- [x] 1.4 为 PreserveResourceSemantics 固定小/大资源、局部引用、列表、已有覆盖、AssetRefPath、serialized type、negative/stripped ID、各组件行号及 canonical 竞争的语义用例；区分正确兼容输出和需修正的错误 evidence。

## 2. 核心实现任务

- [x] 2.1 实现资源级解析 Module 的 Interface 与明确结果/完整度、消费、关闭契约；在 `core/unity/` 使用真实文件验证单资源多脚本共用语义读取，调用者不管理内部可变缓存。
- [x] 2.2 重排 `resolver.ts` 的大小资源处理：小资源一次解析对象索引后处理全部脚本，大资源一次流式提取全部所需脚本；通过 1.3/1.4，验证绑定身份和各自 evidence 正确。
- [x] 2.3 调整 `scan-context.ts` 与 prefab-source 识别，使兼容的两类信号共享 discovery 读取；保持独立 dedupe/counters、无脚本 prefab-source、scope、大小限制与 canonical 命中计数，验证 TwoStageResourceDiscovery 全部场景。
- [x] 2.4 将 `unity-resource-processor.ts` 改为按资源消费并统一写图；移除不必要的全阶段完整 resolvedBySymbol/parse object 驻留，改用必要最小聚合；验证图关系、summary、serialized-type 输入不因处理次序改变。
- [x] 2.5 实现字节感知工作集预算、背压及批次交付；用慢消费者、长行/大字段、单资源高基数验证 BoundedIntermediateWorkingSet，不以固定并发代替内存限制。
- [x] 2.6 实现会话内存记录与临时文件 Adapter；验证 in-memory/spill 语义等价、无新跨次缓存、临时 I/O 独立计量，覆盖 RunScopedTemporaryStorage。
- [x] 2.7 实现正常完成、提前退出、文件错误、暂存失败、清理失败与崩溃残留所有权处理；故障注入确认不泄漏生产者、不误删其他运行或索引、不退回无界内存。
- [x] 2.8 实现发现/解析间内容一致性检查和资源级失败诊断；接通 processor→run-analyze→metadata/status 的完整度传播，验证坏文件与阶段间变化不会成为“完整空结果”，存储一致性失败会终止。
- [x] 2.9 接入 query/parity/lazy 的共享解析调用；验证所选路径不触发新全仓扫描，现有预算、deep 请求、partial/fallback 和 runtime closure 含义保持，覆盖 QueryAndPublicationCompatibility。
- [x] 2.10 验证成功发布 seed 的完整映射、现有 overlay/cache 失效、skipGraph/skipDerived、runtime root 清理和派生层保留/重算；比较资源单跳/双跳与实际成员证据，不只比较总数。
- [x] 2.11 补充 discovery/canonical/resolution/consumer/spill 耗时与 opens/bytes/parses、pending bytes、失败计数；通过 ObservableAccessCostAndAcceptance 的读取复杂度场景，避免逐行日志。

## 3. 收敛与验证准备

- [x] 3.1 运行阶段原型，审计中间记录、缓存、长行、必要全局索引及最终图的内存归属；根据测量锁定默认预算/批次/并发与最终 A/B 数值门槛，记录依据后再执行验收。
- [x] 3.2 运行本次触达的 Unity、hydration、publication/status、incremental、错误/取消测试；新 Interface 已覆盖后删除只镜像旧内部结构的重复测试，保留业务契约用例。
- [x] 3.3 在 `gitnexus/` 执行 `npm test` 与 `npx tsc --noEmit`，并执行实际需要的 build；构建/测试使用项目规定的 10–30 分钟执行上限，失败保留原始输出、不自动重试，明确处理原因。
- [x] 3.4 在固定 Node/目标内容/配置/parser cache/write plan 下执行完整 baseline 与优化版 A/B（按已授权范围，单次不超过 30 分钟）；记录阶段耗时、RSS/footprint/heap、系统压力及语义证据，确认时间和内存均改善，否则继续定位。
- [x] 3.5 同步 `UNITY_RESOURCE_BINDING.md`、runtime 真源和受实际行为影响的 shipped skills/shared contracts；澄清物理读取、大小资源分支、失败完整度，若涉及镜像则运行同步检查。
- [x] 3.6 整理每个 spec 场景与任务的实际命令、结果、证据路径和差异解释；提交前执行 detect_changes，partial/truncated 不作为干净结果，不动已有用户无关改动。

## 4. 验证与回写收敛

- [x] 4.1 实现后依据真实证据生成 verification.md，覆盖 spec-to-implementation 与 task-to-evidence，明确未达门槛、剩余风险及验证目标，不能把本次规划校验当实现验证。
- [x] 4.2 依据 verification.md 和 binding.md 生成 writeback.md；实际外部回写前读取标准/目标并确认本 change 授权，缺权限或引用失效则记录未完成，不阻塞本地证据整理。
- [x] 4.3 按届时获准的 writeback 范围执行并记录时间、执行人、目标和结果；在需要的验证/回写完成前不把整个 change 标为完成或归档。
