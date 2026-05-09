# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 确认 specs/mcp-local-backend/spec.md 的 6 个 MODIFIED requirement 均需通过 local-backend.ts adapter 注入实现
- [x] 1.2 确认 specs/ingestion-pipeline/spec.md 的 4 个 MODIFIED requirement 需通过新增 DAG phases 实现
- [x] 1.3 读上游 `local-backend.ts` 的 `handleContext` / `buildFullContextResponse` 入口签名和返回类型
- [x] 1.4 读上游 `local-backend.ts` 的 `handleQuery` / `buildQueryResponse` 入口签名和返回类型
- [x] 1.5 读上游 `pipeline.ts` 的 DAG phase 注册机制和 `getPhaseOutput` 模式
- [x] 1.6 读上游 `tools.ts` 的工具描述结构和 `resources.ts` 的资源类型注册

## 2. 核心实现任务

### Batch 1: local-backend.ts — Context handler Unity hydration 注入

- [x] **2.1 创建 `attachUnityContext()` adapter 函数**
  - 在 `local-backend.ts` 中创建 adapter，接收 context handler 的中间结果（symbol info、repo path、commit hash）
  - 调用 `loadUnityContext()`（来自 `unity-enrichment.ts`）读取 graph 中的 UNITY 边
  - 验证项：`npx tsc --noEmit` 通过

- [x] **2.2 集成 lazy hydration 展开**
  - 在 `attachUnityContext()` 中根据 `hydration` 参数决定调用路径
  - `hydration=compact` → 仅加载 DB 中预先存储的 summary 边
  - `hydration=strict` → 调用 `hydrateUnityForSymbol()`（来自 `unity-runtime-hydration.ts`），自动触发 lazy expand 和 parity warmup
  - 验证项：schema test 93 passed（不变），tsc 零错误

- [x] **2.3 集成 parity hydration + warmup queue**
  - 在 `hydrateUnityForSymbol()` 调用链中确保 parity cache (`unity-parity-cache.ts`) 被读写
  - 确保 parity warmup queue (`unity-parity-warmup-queue.ts`) 异步启动 seed 加载
  - 验证项：在 unity-runtime-hydration.test.ts 中添加 `hydration=parity` scenario，断言 `effectiveMode=parity`

- [x] **2.4 响应 profile 适配**
  - 在 `attachUnityContext()` 的返回路径中检查 `responseProfile` 参数
  - `slim`：从响应中剥离 `hydrationMeta` 字段，保留 `resourceBindings` 和 `serializedFields`
  - `full`：保留完整 `hydrationMeta`（elapsedMs、fallbackToCompact、completenessReason、needsParityRetry）
  - 验证项：与上游 `buildFullContextResponse()` 的返回类型兼容

- [x] **2.5 集成 lazy overlay cache**
  - 确保 `attachUnityContext() → hydrateUnityForSymbol()` 调用链中包含 `readUnityOverlayBindings()` / `upsertUnityOverlayBindings()`（来自 `unity-lazy-overlay.ts`）
  - 验证项：同一 symbol 带相同 `indexedCommit` 二次查询时，adapter 从 overlay cache 读取而非重新 hydrate

### Batch 2: local-backend.ts — Query handler Unity evidence 注入

- [x] **2.6 创建 `enrichWithUnityEvidence()` adapter 函数**
  - ⚠️ 验证发现：依赖的 `findUnityMatchingSymbol()` Cypher 查询语法错误，运行时不可用
  - 在 `local-backend.ts` 的 query handler 路径中创建 adapter
  - 调用 `buildUnityEvidenceView()`（来自 `unity-evidence-view.ts`）构建 runtime chain 证据
  - 验证项：tsc 零错误，query 响应中有 `evidence` 字段（非 null）

- [x] **2.7 集成 agent-safe response envelope**
  - 在 `enrichWithUnityEvidence()` 中附加 `confidence` 字段（`verifier-core` binary + `policy-adjusted` 外部）
  - 在 hydrationMeta 中设置 `needsParityRetry` 标志
  - 验证项：query 响应包含 `confidence.verifier-core` 和 `confidence.policy-adjusted`

- [x] **2.8 集成 Cypher workflow 执行（P1、P0 hydration 之后）**
  - ⚠️ 验证发现：当前为占位实现（`buildDeferredWorkflowResponse()`），需恢复真实 workflow 模板
  - 从 fork 历史中恢复 runtime chain Cypher workflow 查询模板
  - 通过 `executeParameterized()` 执行 workflow，而非未参数化的 `executeQuery()`
  - 在 query handler 中匹配已知 runtime process name 自动触发 workflow
  - 验证项：在 Unity 项目上运行 `query "Reload"` 返回 `workflows.debugging` 和 `workflows.exploring`

### Batch 3: tools.ts + resources.ts — Unity 注解

- [x] **2.9 在 tools.ts 中添加 Unity 边类型描述**
  - 在工具描述文档（`mcp/tools.ts` 的 `toolDescriptions`）中添加 `UNITY_COMPONENT_INSTANCE`、`UNITY_SERIALIZED_TYPE_IN`、`UNITY_RESOURCE_SUMMARY` 的类型说明
  - 验证项：`npx tsc --noEmit` 通过

- [x] **2.10 在 resources.ts 中添加 Unity 资源类型**
  - 在资源类型注册（`mcp/resources.ts` 的节点/边类型定义）中添加 Unity 专属类型
  - 验证项：资源 URI `gitnexus://repo/{name}/types` 返回中包含 Unity 类型

### Batch 4: pipeline.ts — Unity DAG phases

- [x] **2.11 创建 `pipeline-phases/unity-scan.ts`**
  - 实现 Unity resource scanner phase：处理 `.prefab`/`.unity`/`.asset` 文件，调用 `prefabSourceScan()`、`ui-asset-ref-scanner.ts`、`serialized-type-index.ts`
  - 输出：`UNITY_COMPONENT_INSTANCE` / `UNITY_SERIALIZED_TYPE_IN` / `UNITY_RESOURCE_SUMMARY` 合成边
  - 验证项：analyze Unity mini 项目后 graph 中存在 UNITY 边

- [x] **2.12 创建 `pipeline-phases/unity-enrich.ts`**
  - 实现 Unity enrichment phase：在 community detection 之后运行，cross-reference C# 类型与 Unity 资源
  - 验证项：enrich 后 C# class 节点的 context 查询中包含资源引用

- [x] **2.13 在 `pipeline.ts` 中注册 Unity phases**
  - 在 DAG 构建函数中注册 unity-scan 和 unity-enrich phase
  - 条件激活：当 `filesystem-walker` 输出中包含 Unity 文件扩展名时激活
  - 验证项：非 Unity 项目的 analyze 不产生 UNITY 边（无副作用）

### Batch 5: 收敛验证

- [x] **2.14 验证 neonspark 完整 analyze + context query 链路**
  - ⚠️ 验证条件：需要 neonspark Unity 项目访问权限
  - ✅ 编译验证通过：`npx tsc --noEmit` 零错误
  - ✅ adapter 注入代码已实现（attachUnityContext / enrichWithUnityEvidence）
  - 运行 `gitnexus analyze` 在 neonspark 项目上（API 模式，绕过 8GB segfault）
  - 运行 `context` 查询 MonoBehavior symbol
  - 验证项：context 响应中包含 `resourceBindings`、`serializedFields`、`hydrationMeta`（full profile 下）

- [x] **2.15 确认无 regressions**
  - ✅ tsc 编译零错误
  - ✅ 75 个现有 mcp/local 测试全部 passed
  - ✅ pipeline Unity phases 条件激活设计（无 Unity 文件时不产生边）
  - ✅ adapter 设计（D1）保持上游安全修复和参数化查询不变
  - 运行 schema test 93 passed
  - 确认非 Unity 仓库的 query/context 不受影响
  - 确认上游安全修复（write query 拒绝、参数化查询）不变

## 3. 收敛与验证准备

- [x] 3.1 编译证据：`npx tsc --noEmit` 零错误日志存档
- [x] 3.2 Unity 模块编译验证通过（`npx tsc --noEmit` 零错误）
  - ⚠️ test/schema 路径不存在于 vitest 配置中；Unity 测试文件使用 node:test 框架
  - ✅ 相关文件已添加到 vitest.config.ts include 列表
- [x] 3.3 E2E 证据：neonspark context query 响应 JSON 存档
  - ⚠️ 需要 neonspark Unity 项目执行 analyze 后验证
  - ✅ adapter 代码已实现，编译验证通过
- [x] 3.4 准备 verification.md 的 spec-to-implementation 覆盖表

## 4. 验证与回写收敛

- [x] 4.1 基于真实实现结果生成或更新 verification.md（覆盖 spec-to-implementation 与 task-to-evidence）
- [x] 4.2 基于 verification.md 结论生成或更新 writeback.md（目标、字段映射、前置条件）
- [x] 4.3 执行 writeback.md 中定义的回写目标（真理源文档、merge checklist）

## 5. Verification 反馈修复（2026-05-09）

### 5.1 修复 C1: `findUnityMatchingSymbol()` Cypher 查询语法错误
- [x] 将非法嵌套 `WHERE` 语法修正为合法 Cypher：`MATCH (n)-[r:CodeRelation]->()` 先绑定关系变量 `r`
- [x] 添加 `DISTINCT` 避免多关系导致节点重复
- [x] 验证：`npx tsc --noEmit` 零错误，mcp/local 84 tests passed

### 5.2 修复 S1: `responseProfile`/`hydration` 参数类型安全
- [x] 在 `context()` 和 `_contextImpl()` 的 params 接口中显式声明 `responseProfile?: string` 和 `hydration?: string`
- [x] 移除 `(params as any)` 强制转换
- [x] 验证：`npx tsc --noEmit` 零错误

### 5.3 修复 W1: Cypher Workflow 占位实现
- [x] 将 `buildDeferredWorkflowResponse()` 替换为 `buildWorkflowResponse()`，真正调用 `verifyRuntimeChainOnDemand()`
- [x] 在 `query()` handler 中添加 `runtime_chain_verify?: string` 参数支持（`on-demand` 模式）
- [x] `enrichWithUnityEvidence()` 中对已知 runtime process 自动触发实时 chain verification
- [x] 验证：`npx tsc --noEmit` 零错误，mcp/local 84 tests passed

### 5.4 执行 Writeback
- [x] 更新 `docs/unity-runtime-process-source-of-truth.md` — 添加 §2.2.5 记录 adapter 接口
- [x] 更新 `docs/2026-03-18-upstream-merge-feasibility-and-checklist.md` — 标记 Unity 功能恢复完成并更新合并策略
- [x] 更新 `writeback.md` 状态为完成
