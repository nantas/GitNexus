# Proposal

## 问题定义

neondesign 完整构建实测耗时 1231.2 秒，其中 Unity 资源处理 787.321 秒，占 63.95%；通用与 Unity processes 合计仅 0.733 秒。现有资源访问按 symbol 驱动，同资源关联不同脚本时反复读取，轻量发现与 prefab-source 识别分别读文件，并将多类解析结果保留至阶段结束。

上游发现阶段已经按资源＋GUID 去重；人为重复 hit 的 resolver 复现不能证明生产 analyze 存在同 GUID 的平方级膨胀。优化依据是实测阶段瓶颈、跨脚本重复读取和生命周期问题，收益需通过 A/B 验证。

## 范围边界

本次建立资源级解析 Module：轻量发现与 canonical 归属之后，按资源处理全部所需脚本，统一写图并释放中间结果。兼容的轻量识别共享读取，保持信号独立；内存预算、背压与必要的临时暂存由 Module 内部管理。

保留当前大小资源的能力差异、绑定/引用/覆盖/序列化类型语义；允许纠正重复结果及错误行号。query/parity/lazy 复用解析能力，但不重做调度、预算及完整度策略。文件级失败隔离并明确标记不完整，不能伪装成无引用。

不新增跨次构建缓存，不扩展大资源默认深解析能力，不更改图关系类型、运行时 closure 语义或 UI trace 的实时职责，不承诺整个进程内存恒定。既有 seed/overlay 与增量派生层契约保持。

## Capabilities

### New Capabilities

- `unity-resource-access`: 规定两阶段资源访问、跨脚本读取复用、有界中间工作集、临时记录生命周期、语义兼容与不完整结果传播。

### Modified Capabilities

无。既有资源链、runtime 和 analyze 对外能力作为兼容性约束保持；本次新增资源访问执行契约。

## Capabilities 待确认项

- [x] 能力范围由用户确认的十项设计决策确定；`unity-resource-access` 是该范围的新规范归档名称，不扩展业务范围。

## Impact

- 实现关注 `core/unity/scan-context.ts`、`resolver.ts`、资源识别器、`ingestion/unity-resource-processor.ts` 与 phase wiring；查询解析调用点仅接入共用 Module。
- 需核对资源完整度从处理结果到索引元数据/status 的传播，避免失败只留下日志；具体已有状态复用方式在实施前验证。
- 增加真实 discovery→解析测试、读取/字节及工作集计量、生命周期/暂存故障测试与完整构建 A/B。
- 同步 `UNITY_RESOURCE_BINDING.md`、runtime 真源及受实际契约变化影响的 shipped skills/shared contracts。不修改共享 ingestion 中的语言提供者架构。
- 无新增外部服务或预定依赖变更。实施前做符号 impact；当前本仓图过期，空结果不作为安全证明。

## 关联绑定

- 关联 binding：`binding.md`。
- 标准、项目、回写目标沿用 binding 中列出的 `repo://orbitos` 引用；其来源已核对为本仓归档记录，外部可用性与本 change 写入授权在实际回写前确认。
- 已确认设计：`repo://gitnexus/docs/plans/2026-09-28-unity-resource-access-design.md`。完整决策将收入本 change 的 design，避免实施依赖被忽略的文档。
