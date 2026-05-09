# Design

## Context

上游合并（`merge-upstream-2026-05`）取上游完整 `local-backend.ts`（策略 B），丢失所有 fork Unity 功能绑定。fork 的 Unity 源代码模块仍然独立存在：

- **MCP 层**：`gitnexus/src/mcp/local/unity-enrichment.ts`、`unity-runtime-hydration.ts`、`unity-lazy-hydrator.ts`、`unity-lazy-overlay.ts`、`unity-parity-cache.ts`、`unity-parity-warmup-queue.ts`、`unity-parity-seed-loader.ts`、`unity-evidence-view.ts`
- **核心层**：`gitnexus/src/core/unity/`（34 个文件：resolver、scan-context、prefab-source-scan、serialized-type-index、csharp-selector-binding、ui-trace 等）
- **管道层**：无独立 Unity 阶段文件（原 fork 在 pipeline.ts 中直接内联 Unity 阶段逻辑）

当前上游 `local-backend.ts`（~3800 行）有全新的接口签名：
- 全部 Cypher 查询通过 `executeParameterized()` 参数化执行
- 集成了 `GroupService` 跨仓库路由
- Embedding 查询通过 `collectBestChunks()` / `rankExactEmbeddingRows()`
- Response 构建通过 `buildFullContextResponse()` / `buildQueryResponse()` 等函数
- 日志通过 pino `logger`

恢复策略不能是「回滚到旧版」，而是**将 fork Unity 模块的调用点注入到上游版的对应 handler 中**。

## Goals / Non-Goals

**Goals:**

- 将 fork Unity hydration/parity/lazy/warmup/Cypher workflow 接入当前上游 `local-backend.ts`
- 在上游 `pipeline.ts` DAG 中添加 Unity 资源扫描/丰富阶段
- 在 `tools.ts` 和 `resources.ts` 中添加 Unity 相关注解
- 通过编译（`npx tsc --noEmit`）和 schema 测试套件
- 保持上游安全修复和参数化查询不变

**Non-Goals:**

- 不修改 `gitnexus/src/core/unity/` 和 `gitnexus/src/mcp/local/unity-*.ts` 现有代码的业务逻辑
- 不新增 fork 中未有的功能（如新的 runtime chain 类型或 hydration 模式）
- 不修复 calltool-dispatch 测试或 globalSetup 恢复
- 不改动上游的社区检测、MRO、RouteExtractor 等正交功能

## Decisions

### D1: Adapter Pattern — 在 local-backend.ts 中创建 thin adapter 函数

**决策**：不在 `local-backend.ts` 中内联 Unity 逻辑，而是创建少量 adapter 函数，将 unity-*.ts 模块作为依赖调用。

**理由**：
- 保持 Unity 模块的独立性（符合 unity-runtime-process spec 的 Isolation requirement）
- 上游 future merge 时只需适配 adapter 函数，无需重复处理 6482 行融合
- 可独立测试 Unity 模块（现有测试套件不变）

**结构示例**：
```
local-backend.ts
├── context handler
│   └── attachUnityContext()          ← adapter, 调用 unity-enrichment/unity-runtime-hydration
│       ├── loadUnityContext()        ← 读取 graph 中的 UNITY 边
│       ├── hydrateUnityForSymbol()   ← lazy/parity hydration
│       └── buildUnityResponse()      ← 构造 agent-safe envelope
├── query handler
│   └── enrichWithUnityEvidence()     ← adapter, 调用 unity-evidence-view
```

### D2: 两阶段注入 — context handler + query handler

**决策**：在 `local-backend.ts` 的两个 handler 中分别注入 Unity 功能。

| Handler | 注入点 | 职责 |
|---------|--------|------|
| `handleContext` / `buildFullContextResponse` | 在基本 context 响应构建后 | 调用 loadUnityContext() 加载 DB 中的 Unity 边；调用 hydrateUnityForSymbol() 展开 lazy/parity；附加 hydrationMeta |
| `handleQuery` / `buildQueryResponse` | 在基本 query 响应构建后 | 调用 enrichWithUnityEvidence() 构建 runtime chain 证据；附加 confidence/evidence 字段 |

**理由**：context handler 调用 `loadUnityContext()`（graph 查询，图已有 UNITY 边时快速返回），query handler 需要运行时链证据的生成。分开注入避免将 query 的 Cypher workflow 污染到 context 路径。

### D3: Pipeline Unity 阶段作为独立 DAG Phase

**决策**：创建 `src/core/ingestion/pipeline-phases/unity-scan.ts` 和 `unity-enrich.ts`，在上游 DAG 框架中注册为可选阶段。

**理由**：
- 上游 pipeline-phases/ 已有完整的 phase 架构（parse、communities、processes、routes、mro 等）
- Unity 阶段适合作为独立 phase 加入 DAG，而非内联到已有 phase
- 条件激活：仅当检测到 `.unity` / `.prefab` / `.asset` 文件时启用

**依赖顺序**：
```
parse → communities → processes → unity-scan → unity-enrich → ... → finalize
                                          ↑
                               filesystem-walker 输出 Unity 文件列表
```

### D4: 响应 Profile 适配 — 包装/展开 hydrationMeta

**决策**：在 context 响应构建时，根据 `response_profile` 参数包装/展开 `hydrationMeta`。

- `response_profile=slim`：响应中不包含 `hydrationMeta`，但 `resourceBindings` 和 `serializedFields` 正常返回
- `response_profile=full`：在响应中包含完整的 `hydrationMeta`（elapsedMs、fallbackToCompact、completenessReason、needsParityRetry）

**理由**：上游已有 `responseProfile` 参数传递到 handler，只需在响应构建层做条件判断，不改变底层 hydration 逻辑。

### D5: 初始实现先 wire hydration，暂不 wire Cypher workflow

**决策**：按依赖优先级分批执行。第一优先级是 context/query handler 的 Unity hydration 注入（specs/mcp-local-backend 中 1-4 项要求），第二优先级是 Cypher workflow 执行（第 5 项要求）。

**理由**：
- Cypher workflow 依赖 hydration 结果作为输入，必须先让 hydration 跑起来
- Cypher workflow 逻辑在 fork 中有独立的实现计划（`docs/plans/2026-04-08-unity-query-context-cypher-workflows-implementation-plan.md`），恢复时需要在 fork 源码基础上适配上游
- 分批降低每批验证复杂度

### D6: 不修改当前 local-backend.ts 的 Cypher 查询接口

**决策**：Unity hydration 的 graph 查询复用 `executeParameterized()`（上游已有的参数化接口），不引入新的 DB 查询路径。

**理由**：
- 上游的 `executeParameterized()` 已经有 write-query 拒绝和参数化安全
- Unity 查询只需要读取现有的 `UNITY_COMPONENT_INSTANCE` / `UNITY_RESOURCE_SUMMARY` / `UNITY_SERIALIZED_TYPE_IN` 边
- 复用上游接口减少代码注入量

## Risks / Migration

### 高风险项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 上游 handler 接口签名与 fork 数据格式不兼容 | context 响应字段名或结构不一致 | 先读上游 `buildFullContextResponse()` / `buildQueryResponse()` 的返回类型，再写 adapter 的返回对象 |
| Unity parity 模块依赖 `LazyHydrator` 的 `dedupeKey` 缓存机制 | 多 session 并发查询缓存冲突 | 验证 `inFlightHydration` Map 在 fork 中的生命周期设计，确认跨 session 隔离 |
| `runtime-chain-verify` 的 Cypher 查询与上游参数化接口集成 | Cypher workflow 查询可能绕过 `executeParameterized()` | 所有 workflow 查询必须通过 `executeParameterized()` 执行，不能用原始 `executeQuery()` |
| pipeline Unity 阶段依赖的 `filesystem-walker` 接口变更 | Unity 文件列表提取可能失败 | 读 upstream `filesystem-walker.ts` 的输出类型，确认 `walkUnityResourcePaths` 的兼容性 |

### 回退策略

- 每批独立提交，失败时 `git reset --hard HEAD~1`
- Adapter 函数设计允许局部回退（只回退一个 handler 的注入点）
- 若 upstream `local-backend.ts` 在恢复期间有新的 merge，优先处理 new merge，再将 adapter 应用到新版本
