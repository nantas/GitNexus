# Proposal

## 问题定义

`chore/merge-upstream-2026-05` 合并过程中，`local-backend.ts` 因双方合计 6482 行改动无法手工融合，实际策略从 **C（手工融合）降级为 B（取上游完整版本）**。上游版 `local-backend.ts` 完全没有 fork 的 Unity 功能绑定：Unity context query、lazy/parity hydration、Cypher workflow、agent-safe response envelope 全部丢失。

fork 的 Unity 源代码模块仍然独立存在于 `gitnexus/src/mcp/local/unity-*.ts` 和 `gitnexus/src/core/unity/`，但 **未导入或连接到当前的 `local-backend.ts`**。当前 `local-backend.ts` 中 `UNITY_` 和 `unity-` 引用数为零，grep 无匹配。

同时，`pipeline.ts` 缺少 fork 的 Unity 资源扫描/丰富阶段，`tools.ts` 和 `resources.ts` 缺少 Unity 相关工具注册和资源类型。

上游合并 tasks.md §5.4 和 writeback.md §策略偏差已将此标记为 P0 级待办项。

## 范围边界

### 在范围内

- 将 fork 的 Unity hydration/parity/lazy/warmup/Cypher workflow 功能重新接入上游版 `local-backend.ts`
- 适配 fork Unity 模块到 upstream 的新 API 签名（parameterized queries、GroupService、response profile 框架）
- 在 `pipeline.ts` DAG 中添加 Unity 资源扫描/丰富阶段
- 在 `tools.ts` 中添加 Unity 工具描述与安全注解
- 在 `resources.ts` 中添加 Unity 资源类型
- 通过编译、核心测试和 Unity context query E2E 验证

### 不在范围内

- 不修改 fork Unity 核心引擎模块（`gitnexus/src/core/unity/`、`gitnexus/src/mcp/local/unity-*.ts`）的业务逻辑
- 不新增 fork 中未有的 Unity 功能
- 不处理 calltool-dispatch 测试的 18 个失败（与 local-backend API 兼容性无关）
- 不处理全量测试 globalSetup 恢复（LadybugDB native addon 兼容性）
- 不发布新版本包

## Capabilities

### Modified Capabilities

- `mcp-local-backend`: 将 fork 的 Unity context query、lazy/parity hydration、Cypher workflow、agent-safe response envelope 重新接入上游版 local-backend.ts，适配上游的 parameterized query、GroupService 和 response profile 接口
- `unity-runtime-process`: 恢复上游合并后丢失的 Unity runtime process 查询链路：hydration 一致性、parity 验证、lazy expand、overlay 缓存、runtime chain Cypher workflow
- `ingestion-pipeline`: 在 DAG 中添加 Unity 资源扫描与分析阶段（resource scan/enrich），确保 analyze 时产生 UNITY_COMPONENT_INSTANCE 等合成边

### New Capabilities

（无新增能力）

## Capabilities 待确认项

- [x] 能力清单已确认：三项均为合并 spec 中定义的 Modified Capability，不新增

## Impact

### 正面影响

- 恢复 Unity runtime process 全功能查询能力
- 复用 fork 已验证的 Unity 模块代码（34 个 core unity 文件 + 10 个 mcp local unity 文件）
- 保持与上游 local-backend API 兼容（不破坏上游安全修复和参数化查询）

### 风险

- 上游 `local-backend.ts` 的接口签名与 fork 版本差异大，模块适配可能暴露隐含的依赖关系
- `runtime-chain-verify` 和 `response_profile=full` 等上游新接口与 fork 的 hydration 逻辑语义映射可能存在歧义
- pipeline Unity 阶段可能被上游 DAG 重构的 `PhaseTimer`/`RouteExtractor` 接口约束

### 受影响方

- **所有使用 Unity hydration 的 MCP 客户端**：恢复后 context query 将返回完整的 resourceBindings + hydrationMeta
- **Unity analyze 运行者**：pipeline 恢复后 analyze 将重新产生 UNITY 合成边

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 标准页：`openspec/changes/merge-upstream-2026-05/specs/mcp-local-backend/spec.md`
  - 标准页：`openspec/changes/merge-upstream-2026-05/specs/unity-runtime-process/spec.md`
  - 项目页：`docs/unity-runtime-process-source-of-truth.md`
  - 项目页：`docs/unity-runtime-process-rule-driven-implementation.md`
  - 回写目标：真理源文档、merge checklist、AGENTS.md
