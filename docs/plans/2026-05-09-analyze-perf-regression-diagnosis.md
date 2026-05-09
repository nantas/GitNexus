# Analyze 性能回归诊断：neonspark 922s vs 历史 120s

> **日期**: 2026-05-09
> **分支**: `chore/merge-upstream-2025-05`
> **目标仓库**: neonspark (`/Volumes/Shuttle/unity-projects/neonspark`)
> **当前耗时**: 922.3s（15.4 分钟），历史基准 ≈120s（增量）/ ≈420s（首次）

## 1. 症状

| 指标 | 当前值 | 历史值 | 变化 |
|------|--------|--------|------|
| 全量 analyze 耗时 | 922.3s | ~420s（初次）/ ~120s（增量） | 2.2×–7.7× 退化 |
| Nodes | 333,250 | — | — |
| Edges | 831,659 | — | — |
| Clusters | 6,017 | — | — |
| Skipped large files | 3,096 | — | — |

## 2. 变更清单：upstream 合并后管线新增阶段/路径

### 2.1 新增 scope-resolution 阶段（最大嫌疑）

C# 现已被加入 `MIGRATED_LANGUAGES`（`registry-primary-flag.ts`），导致所有 C# 文件走全新的 scope-resolution 管线而非 legacy DAG。

**新增处理链**（`scope-resolution/pipeline/phase.ts` → `run.ts`）：

```
extractParsedFile (per-file tree-sitter parse)
  → populateOwners (populateClassOwnedMembers)
  → reconcileOwnership → validateOwnershipParity
  → finalizeScopeModel (finalize-algorithm 1026 行)
    → tarjanSccs (SCC condensation)
  → buildMro (MRO 线性化，遍历全部 EXTENDS 边)
  → buildPopulatedMethodDispatch
  → populateNamespaceSiblings (C# 专属：逐文件 AST walk)
  → mirrorNamespaceTypeBindings
  → propagateImportedReturnTypes (SCC 反拓扑遍历 + chain-follow)
  → validateBindingsImmutability
  → resolveReferenceSites
  → emitReceiverBoundCalls + emitFreeCallFallback + emitReferencesViaLookup
  → emitImportEdges
```

**对 neonspark（8128 个 .cs 文件）的影响**：

| 子步骤 | 算法复杂度 | 估计耗时占比 |
|--------|-----------|-------------|
| `extractParsedFile` × 8128 | O(N × avg_tree_size) | 中 |
| `finalizeScopeModel`（含 tarjanSccs） | O(N + E_imports) | 中-高 |
| `buildMro`（遍历 EXTENDS 边） | O(V_class × avg_depth) | 低-中 |
| `populateNamespaceSiblings`（C# 专属） | O(N × avg_namespace_size) | 中 |
| `propagateImportedReturnTypes` | O(N_imports × chain_depth × SCC_count) | **高** |
| `resolveReferenceSites` + emit | O(N_refs × registry_lookup) | 中-高 |

**关键点**：legacy DAG 的 `call-processor.ts` 已对 C# 设置 `if (isRegistryPrimary(language)) continue;` 跳过，但 scope-resolution 阶段仍然完整执行了上述全部子步骤。这意味着 C# 的调用解析从一条轻量 DAG 路径切换到了一个重量级全量 scope 分析路径。

### 2.2 新增 unity-scan + unity-enrich 阶段

#### unity-scan（`pipeline-phases/unity-scan.ts`）

委托给 `processUnityResources`，内部执行：

1. **`buildUnityScanContext`**（`scan-context.ts`，612 行）：
   - `resolveScriptFiles`：glob 查找所有 .cs 文件
   - `buildSymbolScriptPathIndex`：**逐文件读取 + 正则扫描 class 声明**（8128 个 .cs 文件）
   - `buildSerializableTypeIndexFromFiles`：逐文件读取 .cs 做类型推断
   - `buildMetaIndex`：读取所有 .cs.meta 文件
   - `resolveResourceFiles`：glob 查找 .prefab/.unity/.asset → **18,409 个文件**（694MB .prefab + 111MB .asset + 6MB .unity）
   - `buildGuidHitIndex`：**逐行扫描全部 18,409 个资源文件**（并发度 4），在每行中正则匹配 script guid
   - `streamPrefabSourceRefs`：再次流式扫描全部 .prefab/.unity 文件

2. **`resolveUnityBindings`**（`resolver.ts`）：对每个有 guid 命中的 Class 节点执行：
   - 查找资源文件中的 MonoBehaviour 块
   - 解析 YAML override chain
   - 提取 serialized fields + reference resolution
   - 为每个 binding 写入多条 UNITY 边

3. **`emitPrefabSourceGuidRefsFromScanContext`**：流式扫描全部 .prefab 文件提取 m_SourcePrefab 引用

**关键数据**：neonspark 有 **7,951 个 .prefab**（694MB）、**75 个 .unity**、**10,383 个 .asset**（111MB）。全量扫描这些文件是巨大 I/O 开销。

#### unity-enrich（`pipeline-phases/unity-enrich.ts`）

- 遍历图中 **全部** 关系寻找 UNITY 边（`forEachRelationship`）
- 遍历 **全部** 节点寻找 MonoBehaviour 子类（`forEachNode`）
- 对每个 Behaviour 类 × min(unityEdges, 10) 添加 xref 边
- 在 33 万节点 + 83 万边的图上两次全量遍历

### 2.3 `--extensions` 参数未实际生效

`includeExtensions` 在 CLI 层解析并存入 `meta.json`，但 **从未传入** `runPipelineFromRepo`：

```
// src/core/run-analyze.ts:283
const pipelineResult = await runPipelineFromRepo(repoPath, progress, {
  scopeRules: options.scopeRules,
  csharpDefineCsproj: options.csharpDefineCsproj,
  // ❌ 缺少: includeExtensions: options.includeExtensions
});
```

管线 scan 阶段（`filesystem-walker.ts`）始终扫描仓库内所有文件，parse 阶段仅通过 `isLanguageAvailable` 过滤不支持的语法。因此 `--extensions .cs .meta` 实际无效——管线仍然扫描和解析所有语言的所有文件。

## 3. 退化因素排序

按影响从大到小：

| 排名 | 因素 | 估计增量耗时 | 置信度 |
|------|------|-------------|--------|
| **1** | **scope-resolution 全量 C# 分析**（替代 legacy DAG 跳过路径） | +300–400s | 高 |
| **2** | **unity-scan 全量资源文件 I/O**（18,409 个 .prefab/.asset/.unity 逐行扫描） | +200–300s | 高 |
| **3** | **unity-scan buildSymbolScriptPathIndex**（8128 个 .cs 逐文件 I/O + 正则） | +50–100s | 中 |
| **4** | **unity-enrich 双重全图遍历** + 大量 xref 边写入 | +30–60s | 中 |
| **5** | **`--extensions` 未生效** → 额外解析非 .cs/.meta 文件 | +50–100s | 中 |

## 4. 历史对比：合并前管线

合并前的 fork 版本管线阶段：

```
scan → structure → markdown → cobol → parse → routes → tools → orm → crossFile → mro → communities → processes
```

合并后新增的阶段：

```
... → scopeResolution (新增，C# 走此路径)
... → unityScan (新增，替代简单占位符)
... → unityEnrich (新增)
```

## 5. 修复建议

### 5.1 短期（立即可做）

1. **传递 `includeExtensions` 到管线**：在 `run-analyze.ts` 中将 `includeExtensions` 传入 `runPipelineFromRepo` → `PipelineOptions` → scan/parse 阶段，减少不必要的文件扫描和解析。

2. **Unity 资源扫描走 `scopedPaths`**：`processUnityResources` 的 `options.scopedPaths` 应与 `scopeRules` 联动，避免扫描 scope 外的资源文件。

3. **`PROF_SCOPE_RESOLUTION=1` 诊断**：加长超时运行一次带 profile 的 analyze，确认 scope-resolution 各子步骤的实际耗时分布。

### 5.2 中期（架构优化）

4. **scope-resolution C# 快速路径**：为 Unity 仓库的大规模 C# 代码库优化 `propagateImportedReturnTypes`——考虑按命名空间分组并行处理，或对无跨文件引用的文件跳过 SCC 遍历。

5. **unity-scan 增量化**：缓存 `UnityScanContext`（symbol-to-guid 映射、guid-to-resource-hits 映射），仅在 .meta 或资源文件变更时重建。

6. **unity-enrich 避免全图遍历**：在图上维护按 edge type 的索引（或直接用 `iterRelationshipsByType`），替代 `forEachRelationship` + type check。

### 5.3 长期

7. **管线阶段并行化**：`scopeResolution` 和 `unityScan` 之间无数据依赖（unityScan 需要 parse 输出但不需要 scopeResolution 输出），可并行执行。

8. **Worker pool for unity-scan**：`buildGuidHitIndex` 的并发度从 4 提升到与 parse 相同的 worker pool 模式。

## 6. 验证方案

```bash
# 基准：当前耗时
time node dist/cli/index.js analyze /Volumes/Shuttle/unity-projects/neonspark \
  --scope Assets/ --scope Packages/ \
  --extensions .cs --extensions .meta \
  --csharp-define-csproj .../Assembly-CSharp.csproj \
  --force

# 对比 1：禁用 unity-scan（环境变量跳过 prefab source pass）
GITNEXUS_DISABLE_PREFAB_SOURCE_PASS=1 time node dist/cli/index.js analyze ...

# 对比 2：回退到 legacy DAG
REGISTRY_PRIMARY_CSHARP=0 time node dist/cli/index.js analyze ...

# 对比 3：带 scope-resolution profile
PROF_SCOPE_RESOLUTION=1 NODE_ENV=development node dist/cli/index.js analyze ... 2>&1 | grep "scope-resolution prof"
```

## 7. 结论

**根本原因是 upstream 合并引入了两条重量级新管线路径，在 neonspark 这种规模的 Unity 仓库（8K+ C# 文件、18K+ 资源文件、694MB prefab）上产生了显著的性能退化**：

1. C# scope-resolution 迁移（`MIGRATED_LANGUAGES` 包含 CSharp）导致全部 C# 文件走全量 scope 分析，替代了原先 legacy DAG 的跳过逻辑
2. unity-scan 阶段执行了 18K+ 资源文件的逐行扫描 + 8K+ C# 文件的二次 I/O
3. `--extensions` 参数在管线层面实际未生效，导致额外开销

最高 ROI 的修复是将 `REGISTRY_PRIMARY_CSHARP=0` 临时回退到 legacy DAG，同时传递 `includeExtensions` 到管线层。长期需要在 scope-resolution 中为 C# 添加与 legacy DAG 等价性能的快速路径。
