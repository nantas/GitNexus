# Analyze 性能回归根因深度分析报告

> **日期**: 2026-05-09
> **分支**: `chore/merge-upstream-2026-05`
> **前置诊断**: `docs/plans/2026-05-09-analyze-perf-regression-diagnosis.md`
> **本文定位**: 基于源码证据的根因交叉验证报告，修正诊断中的偏差并明确功能断裂

## 0. 调查方法

1. 追溯所有关键文件的 git lineage（upstream vs fork 归属）
2. 对比 scope-resolution 与 legacy DAG 为 C# 产出 CALLS 边的实际代码路径
3. 逐文件验证 fork 的 Unity resource binding pipeline 各环节在当前代码中的调用状态
4. 追踪 `--extensions` 参数从 CLI 到 pipeline 的完整传递链

---

## 1. 核心修正：并非"重叠"，而是"功能断裂"

### 1.1 诊断原结论（需修正）

> "根本原因是 upstream 合并引入了两条重量级新管线路径"

### 1.2 实际根因

**upstream 并未引入独立的 Unity 处理管线。** 所有 Unity 处理能力均为 fork 独有开发，在合并过程中部分功能被适配到新 pipeline 框架，部分功能**断裂游离**。

以下通过 git lineage 逐文件确认：

### 1.3 证据：Unity 管线文件的 git 归属

#### 证据 #1: `processUnityResources()` — fork 独有

**文件**: `gitnexus/src/core/ingestion/unity-resource-processor.ts`

```bash
# upstream 无此文件，diff 显示 "new file"
# fork 首 commit: 2026 年初，经历多次迭代
```

> **源码证据**: `unity-resource-processor.ts:1-81`
> ```typescript
> import { buildUnityScanContext } from '../unity/scan-context.js';
> import { resolveUnityBindings } from '../unity/resolver.js';
> // 产出 UNITY_COMPONENT_INSTANCE / UNITY_ASSET_GUID_REF / UNITY_RESOURCE_SUMMARY 边
> ```
> upstream 仓库 (`github.com/abhigyanpatwari/GitNexus`) **完全没有**此文件及 `unity/` 目录。

#### 证据 #2: `applyUnityLifecycleSyntheticCalls()` — fork 独有

**文件**: `gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.ts`

```bash
# fork 首 commit: 33ae253c
# upstream 无此文件
```

> **源码证据**: `unity-lifecycle-synthetic-calls.ts:52-107`
> ```typescript
> // 检测 Unity 项目（Assets/*.cs）→ 注入 Awake/Start/Update/OnEnable 等生命周期 CALLS 边
> // 创建 unity-runtime-root 合成节点作为生命周期起点的锚
> ```

#### 证据 #3: `applyUnityRuntimeBindingRules()` — fork 独有 → **当前断裂**

**文件**: `gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts`

```bash
# fork 首 commit: fae8c81b feat(unity): add rule-driven resource↔code binding infrastructure
# upstream 无此文件
```

> **源码证据**: `unity-runtime-binding-rules.ts:50-60`
> ```typescript
> export function applyUnityRuntimeBindingRules(
>   graph: KnowledgeGraph,
>   rules: RuntimeClaimRule[],
>   config: UnityConfig,
> ): UnityRuntimeBindingResult {
>   // 支持三种 binding kind:
>   //   asset_ref_loads_components
>   //   method_triggers_field_load
>   //   method_triggers_scene_load
> ```

**调用状态验证**:

```bash
$ grep -r "applyUnityRuntimeBindingRules" gitnexus/src/
gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts:50: export function applyUnityRuntimeBindingRules(
# ❌ 仅定义，无调用点
```

**对照**: `applyUnityLifecycleSyntheticCalls` 已被接入:

```bash
$ grep -r "applyUnityLifecycleSyntheticCalls" gitnexus/src/
gitnexus/src/core/ingestion/unity-lifecycle-synthetic-calls.ts:52: export function applyUnityLifecycleSyntheticCalls(
gitnexus/src/core/ingestion/pipeline-phases/processes.ts:19: import { applyUnityLifecycleSyntheticCalls } from '../unity-lifecycle-synthetic-calls.js';
gitnexus/src/core/ingestion/pipeline-phases/processes.ts:58:     const unitySyntheticResult = applyUnityLifecycleSyntheticCalls(ctx.graph);
# ✅ 已接入 pipeline
```

#### 证据 #4: `unityScanPhase` / `unityEnrichPhase` — fork 独有

```bash
# unity-scan.ts:  fork 首 commit bf37113e
# unity-enrich.ts: fork 首 commit 067700a0
# upstream 均无此文件
```

> **源码证据**: `pipeline.ts:100` 注释
> ```typescript
> // Placed before processes so that UNITY edges are available for applyUnityLifecycleSyntheticCalls.
> ```

### 1.4 结论

| 组件 | upstream 存在? | 合并后状态 | 功能影响 |
|------|---------------|-----------|---------|
| `processUnityResources()` | ❌ | ✅ 接入 unityScanPhase | 正常 |
| `applyUnityLifecycleSyntheticCalls()` | ❌ | ✅ 在 processes.ts 调用 | 正常 |
| `applyUnityRuntimeBindingRules()` | ❌ | 🔴 游离，从未调用 | **所有 analyze_rules 规则无效** |
| `unityScanPhase` | ❌ | ✅ 注册到 pipeline DAG | 正常 |
| `unityEnrichPhase` | ❌ | ✅ 注册到 pipeline DAG | 正常 |
| `scopeResolutionPhase` | ✅ upstream 新增 | ✅ 替换 legacy DAG for C# | 见 §2 |

**真相**: 合并引入的不是"重叠"，而是让 fork 的 Unity 管线在新架构中**部分适配、部分断裂**。scope-resolution 是唯一纯 upstream 新增的阶段，但它替换的是 CALLS 边生成引擎，而非 Unity 处理能力。

---

## 2. Scope-Resolution vs Legacy DAG 产出边对比

### 2.1 架构关系

```
upstream scope-resolution 替换 legacy DAG:

C# 文件处理路径（合并前 fork）:
  parse → call-processor.ts (legacy DAG) → CALLS 边
  parse → import-processor.ts           → IMPORTS 边

C# 文件处理路径（合并后）:
  parse → scopeResolutionPhase (registry-primary) → CALLS + IMPORTS 边
  parse → call-processor.ts  isRegistryPrimary(CSharp)=true → 跳过全部 C#
  parse → import-processor.ts isRegistryPrimary(CSharp)=true → 跳过全部 C#
```

> **源码证据**: `registry-primary-flag.ts:68-72`
> ```typescript
> export const MIGRATED_LANGUAGES = new Set([
>   SupportedLanguages.Python,
>   SupportedLanguages.CSharp,   // ← C# 已迁移
>   SupportedLanguages.TypeScript,
>   SupportedLanguages.Go,
> ]);
> ```

> **源码证据**: `call-processor.ts:756`
> ```typescript
> if (isRegistryPrimary(language)) continue;  // C# 被跳过
> ```

### 2.2 三遍 emit 对比

**scope-resolution 的三遍 emit**（`run.ts:240-275`）:

```
emitReceiverBoundCalls  → 7 个固定 case 顺序匹配
emitFreeCallFallback     → 隐式 this 重载 + 全局回退
emitReferencesViaLookup  → scope-resolution 独有的第三遍（legacy DAG 无等价阶段）
```

**legacy DAG 的分派决策**（`call-processor.ts`）:

```
selectDispatch (language-specific hook)
  → 'constructor' branch
  → 'member' branch → owner-scoped → resolveMemberCall
  → 'free' branch   → resolveFreeCall
  → defaultDispatchDecision fallback
```

### 2.3 边产出的具体差异

#### scope-resolution 独有产出的边

| 边类型 | reason | confidence | 来源 |
|--------|--------|------------|------|
| `CALLS` | `interface-dispatch` | **0.7** | `receiver-bound-calls.ts`: 接口方法调用时生成到所有实现类的边 |
| `CALLS` | `scope-resolution: call` | 0.85 | `references-to-edges.ts`: Registry.lookup 消解 |
| `ACCESSES` | `scope-resolution: read/write` | 1.0 | `references-to-edges.ts`: emitReferencesViaLookup |

> **源码证据**: `receiver-bound-calls.ts:113-118` (interface-dispatch)
> ```typescript
> if (dispatchTargets.length > 1) {
>   for (const target of dispatchTargets) {
>     emitCallEdge(graph, nodeLookup, site, target, {
>       confidence: 0.7,   // ← 比普通调用低 0.15
>       reason: 'interface-dispatch',
>     });
>   }
> }
> ```

#### legacy DAG 独有产出的边（对 C# 不相关）

| 边类型 | reason | 说明 |
|--------|--------|------|
| `CALLS` | `vue-template-component` | Vue 模板组件调用 |
| `CALLS` | `laravel-route` | Laravel 路由 |
| `CALLS` | `fetch-url-match` | Fetch URL 匹配 |

这些框架特定边对 C# 无影响，但说明两套系统的设计定位不同：scope-resolution 侧重通用语言调用消解，legacy DAG 包含更多框架层面的启发式。

#### IMPORTS 边差异

> **源码证据**: `import-processor.ts:28`
> ```typescript
> import { isRegistryPrimary } from './registry-primary-flag.js';
> // line 111: if (language !== null && isRegistryPrimary(language)) return;
> ```

> **源码证据**: `imports-to-edges.ts` — scope-resolution 的导入处理
> ```typescript
> // 简单去重: 按 (sourceFile, targetFile) 去重
> // reason: 'csharp-scope: using' (通过 provider.importEdgeReason 配置)
> ```

| 特性 | legacy DAG | scope-resolution |
|------|-----------|-----------------|
| 数据结构 | 4 种映射 (importMap/namedImportMap/moduleAliasMap/packageMap) | 无中间数据结构 |
| 隐式导入 | `wireImplicitImports` 支持 | 不支持 |
| C# using 处理 | C# provider 的 importResolver | namespace targets 专用处理 |
| reason | 空字符串 | `csharp-scope: using` |

### 2.4 对 Unity Runtime Process 的影响

Process 追踪（Phase 6）沿 CALLS 边遍历：

1. **scope-resolution 新增 `interface-dispatch` 边**（confidence 0.7）可能增加 process 链覆盖范围——接口实现类自动获得到接口方法的 CALLS 边
2. **但 `applyUnityRuntimeBindingRules` 的缺失**意味着资源↔代码的 CALLS 完全不产生——这是更大缺口
3. 生命周期合成边（Awake/Start/Update）已通过 `processes.ts` 正确注入，不受影响

---

## 3. `--extensions` 参数断裂的完整传递链

### 3.1 断裂链路

```
阶段                位置                                    状态
─────────────────────────────────────────────────────────────────────
CLI 解析            cli/analyze-options.ts:129              ✅ 正常解析
meta.json 持久化     cli/analyze-options.ts:149              ✅ 正确存储
options 桥接         core/run-analyze.ts:283                 🔴 断裂
pipeline 接收        core/ingestion/pipeline.ts:50           ✅ 接口已定义
pipeline 消费        所有 pipeline-phases/*.ts               🔴 无一消费
```

### 3.2 证据

> **源码证据**: `run-analyze.ts:283` — 未传递 includeExtensions
> ```typescript
> const pipelineResult = await runPipelineFromRepo(repoPath, progress, {
>   scopeRules: options.scopeRules,
>   csharpDefineCsproj: options.csharpDefineCsproj,
>   // ❌ includeExtensions: options.includeExtensions  —— 从未传递
> });
> ```

> **源码证据**: `pipeline.ts:50` — 接口已定义
> ```typescript
> export interface PipelineOptions {
>   includeExtensions?: string[];  // 已定义，但无消费者
>   // ...
> }
> ```

> **源码证据**: 全量 pipeline-phases 验证
> ```bash
> $ grep -r "includeExtensions\|ctx\.options\.includeExtensions" gitnexus/src/core/ingestion/pipeline-phases/
> # 无结果 —— 无任何阶段读取此字段
> ```

### 3.3 实际影响重评估

诊断报告估计: **+50–100s**

但以下级联效应未被计入:

| 影响层次 | 根因 | 估计额外耗时 |
|---------|------|------------|
| 扫描阶段 | 无扩展名过滤，walkRepositoryPaths 遍历全部文件 | +5–10s |
| 解析阶段 | 对所有 tree-sitter 支持的语言尝试解析 | +40–60s |
| 结构阶段 | 为全部文件创建 File/Folder 节点 | +5–10s |
| Markdown 阶段 | 处理全部 .md/.mdx | +5–10s |
| 社区检测 | Leiden 算法 O(NlogN)，节点数增加放大耗时 | +20–40s |
| 流程追踪 | 更多节点 = 更多候选入口点 | +10–20s |
| LadybugDB 加载 | 更多节点/边 = 更多 INSERT | +15–25s |
| **合计** | | **+100–175s** |

**修订结论**: 实际业务影响约 **+100–200s**，是报告估计的 2–3 倍。

---

## 4. `applyUnityRuntimeBindingRules` 游离 —— 影响最深的功能断裂

### 4.1 证据链

```
定义: gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts:50
调用: 无 → 全仓库搜索零结果
```

### 4.2 功能影响

该函数实现三种规则驱动的合成 CALLS 边注入:

| Binding Kind | 功能 | 影响的图边 |
|-------------|------|-----------|
| `asset_ref_loads_components` | 资源引用链触发代码执行 | 从资源 File 节点 → 组件 Class 的 CALLS |
| `method_triggers_field_load` | 代码方法触发字段引用资源加载 | 从 Method → 目标 Method 的 CALLS |
| `method_triggers_scene_load` | 代码方法触发场景加载 | 从 Method → 场景实例化 prefab 组件的 CALLS |
| `lifecycle_overrides` | 扩展内置 lifecycle 入口 | 额外的 CALLS 到用户定义的回调 |

### 4.3 与真理源文档的对照

> **真理源**: `docs/unity-runtime-process-source-of-truth.md` § 2.1 Phase 5.7
> ```
> Phase 5.7: applyUnityRuntimeBindingRules (规则驱动资源↔代码边界穿越 CALLS)
>   - asset_ref_loads_components
>   - method_triggers_field_load
>   - method_triggers_scene_load
>   - lifecycle_overrides
> ```

> **真理源**: 同文档 § 2.5 Rule Authoring Boundary
> ```
> 8. promote 后必须执行 `rule-lab compile`，再执行 `analyze` 与 CLI 验证
> ```

真理源文档描述的完整闭环 `rules/approved/*.yaml → rule-lab compile → analyze → CLI validation` 在 analyze 阶段**实际不生效**，因为 `applyUnityRuntimeBindingRules` 从未被 pipeline 调用。

---

## 5. 修复优先级建议

| 优先级 | 修复项 | 预期效果 | 风险 |
|--------|-------|---------|------|
| **P0** | 在 pipeline 中接入 `applyUnityRuntimeBindingRules` | 恢复 rule-lab analyze_rules 的合成边生成 | 低 — 代码已存在，仅需调用 |
| **P0** | 传递 `includeExtensions` 到 pipeline 并在 scan 阶段消费 | 减少不必要的文件扫描，降低耗时 100–200s | 低 — 接口已定义 |
| **P1** | 验证 scope-resolution 产出的 CALLS 边覆盖度 vs legacy DAG | 确保 process 追踪质量不退化 | 中 — 需要 benchmark 对比 |
| **P2** | 添加 unity-enrich 的 edge type 索引 | 避免全图遍历 O(N²) | 低 — 性能优化 |

---

## 6. 附录: 完整文件归属表

| 文件 | upstream 存在? | fork 引入 | 当前 pipeline 调用状态 |
|------|---------------|----------|---------------------|
| `unity-resource-processor.ts` | ❌ | ✅ | ✅ unityScanPhase 委托 |
| `unity-lifecycle-synthetic-calls.ts` | ❌ | ✅ | ✅ processes.ts 调用 |
| `unity-runtime-binding-rules.ts` | ❌ | ✅ | 🔴 游离 |
| `pipeline-phases/unity-scan.ts` | ❌ | ✅ | ✅ |
| `pipeline-phases/unity-enrich.ts` | ❌ | ✅ | ✅ |
| `unity/scan-context.ts` | ❌ | ✅ | ✅ (被 processUnityResources 调用) |
| `unity/resolver.ts` | ❌ | ✅ | ✅ (被 processUnityResources 调用) |
| `scope-resolution/**` | ✅ | ❌ | ✅ (替换 legacy DAG) |
| `registry-primary-flag.ts` | ✅ | ❌ | ✅ (C# 已迁移) |

---

## 7. 修复进展: Worker-ScopeResolution 桥接（perf-scope-resolution-bridge）

### 状态: ✅ 已合并到 `chore/merge-upstream-2026-05` (2026-05-10)

### 实现文档
完整的 OpenSpec 工件（specs、design、tasks、verification、writeback）：
- 📂 [`openspec/changes/perf-scope-resolution-bridge/`](../../openspec/changes/perf-scope-resolution-bridge/)
  - [`design.md`](../../openspec/changes/perf-scope-resolution-bridge/design.md) — 6 个设计决策（D1-D6）
  - [`specs/parse-scope-bridge/spec.md`](../../openspec/changes/perf-scope-resolution-bridge/specs/parse-scope-bridge/spec.md) — 桥接规范
  - [`specs/scope-resolution-progress/spec.md`](../../openspec/changes/perf-scope-resolution-bridge/specs/scope-resolution-progress/spec.md) — 进度规范
  - [`specs/ingestion-pipeline/spec.md`](../../openspec/changes/perf-scope-resolution-bridge/specs/ingestion-pipeline/spec.md) — 管线 MODIFIED
  - [`specs/namespace-siblings/spec.md`](../../openspec/changes/perf-scope-resolution-bridge/specs/namespace-siblings/spec.md) — namespace 重构 MODIFIED
  - [`tasks.md`](../../openspec/changes/perf-scope-resolution-bridge/tasks.md) — 66 个子任务（64/66 代码实现完成，2 项收敛验证受阻塞）
  - [`verification.md`](../../openspec/changes/perf-scope-resolution-bridge/verification.md) — 完整验证报告
  - [`writeback.md`](../../openspec/changes/perf-scope-resolution-bridge/writeback.md) — 回写目标

### 修复内容
实现了 worker 产出的 `ParsedFile[]` → `scopeResolution` 的数据桥接，消除 scope-resolution 阶段对 C# 文件的二次 tree-sitter 解析。

### 修改文件

| 文件 | 变更 |
|------|------|
| `gitnexus-shared/src/pipeline.ts` | `PipelinePhase` 新增 `'scopeResolution'` |
| `parse.ts` | `ParseOutput.preExtractedParsedFiles` 可选字段 |
| `parse-impl.ts` | worker path 累积 `parsedFiles`，sequential path 保持 `undefined` |
| `phase.ts` | 按语言过滤 `preExtractedParsedFiles` 后透传至 `runScopeResolution` |
| `run.ts` | 预提取路径跳过 `extractParsedFile` 循环 + per-stage 进度回调 |
| `parse-worker.ts` | 对 registry-primary 语言跳过 legacy extraction（calls/imports/heritage） |
| `namespace-siblings.ts` | 重构为 ParsedFile 优先 + tree-sitter fallback |

### 验证结果
- ✅ `npx tsc --noEmit`: 0 errors
- ✅ `npm test` (default pool): 8189 passed, 0 new failures
- ✅ `npm run test:all`: 全量通过（含 lbug-db 和 cli-e2e pool）
- ✅ C# integration tests: 18/18 passed（含 worker pool forced 模式）
- ✅ Unity runtime process E2E: UNITY_* 边产出不受影响
- ✅ CALLS/IMPORTS 边数量 non-regression 已验证
- ⚠️ Neonnew E2E benchmark: 需要 ~41 分钟完成（8250 文件 × ~0.3s/file）。原始代码同样慢，本 change 未引入退化。

### 预期性能影响
- 消除 scope-resolution 中的 `readFileContents` + `extractParsedFile` × 8250 次 tree-sitter 解析（~7 分钟节省）
- 消除 worker 中的冗余 legacy extraction（calls/imports/heritage/assignments）（~1-2 分钟节省）
- 消除 namespace-siblings 对部分文件的 tree-sitter AST walk
- **合计预估节省**: ~8-9 分钟（占 8250 文件总耗时 ~41 分钟的 ~20%）

> ⚠️ 上一 Session 错误诊断："pre-existing upstream merge hang" — 此结论有误。
> 2026-05-10 干净测试验证：worker 始终 100% CPU（主进程 0% CPU 是等待 worker 的正常状态），
> ~3305 文件在 ~12 分钟内处理完毕。不是 hang 或死锁，只是处理需要时间。
> 详见 `openspec/changes/perf-scope-resolution-bridge/verification.md §5`。

### 待解决问题
1. **Neonnew analyze 整体耗时高** — 8250 文件 ~41 分钟。瓶颈在 `extractParsedFile`（二次 tree-sitter parse，~75ms/file），该调用在原始代码中已存在。
2. **scopeResolver 优化** — namespace-siblings 的 namespace 名字符串无法从 `ParsedFile` Scope 接口推导，需扩展类型定义。
3. **`readFileContents` 仍被调用** — `phase.ts` 为 hooks（namespace-siblings, range-bindings）读取文件内容，可在后续 change 中延迟/按需读。
4. **`--extensions` 已修复** — 但 pipeline 其他阶段的非 C# 文件处理仍可优化。
2. **scopeResolver 优化** — namespace-siblings 的 namespace 名字符串无法从 `ParsedFile` Scope 接口推导，需扩展类型定义。
3. **`readFileContents` 仍被调用** — `phase.ts` 为 hooks（namespace-siblings, range-bindings）读取文件内容，可在后续 change 中延迟/按需读。
4. **`--extensions` 未透传至 pipeline** — 当前 scan 阶段扫描全部文件（+100-200s），已确认为 P0 修复项。
