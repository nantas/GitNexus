# Proposal

## 问题定义

`unityScanPhase` 的激活门（activation gate）通过检查 `allPaths` 中是否存在 Unity 扩展名文件来决定是否运行 `processUnityResources()`。但 `processUnityResources()` 通过独立的 `glob()` 加载 `.meta`、`.prefab`、`.unity`、`.asset` 文件——完全不依赖主 pipeline 的 `scannedFiles` 列表。

当用户使用 `--extensions .cs` 优化性能时（正确排除冗余 `.meta` 文件），`allPaths` 中没有任何 Unity 扩展名文件，导致 `unityScanPhase` 跳过整个 Unity 处理流程。这意味着：

1. **UNITY_COMPONENT_INSTANCE / UNITY_ASSET_GUID_REF 边不生成** — 资源绑定全部丢失
2. **Unity 生命周期合成 CALLS 边不注入** — Phase 5.6 的 `applyUnityLifecycleSyntheticCalls` 在 processes 阶段仍然运行（因为它不依赖 unity-scan 的 gate），但两者架构耦合不应松散至此
3. **分析耗时从预期 3–5 分钟暴增到 22 分钟** — 因为用户被迫加入 `.meta` 以触发激活门

此外，`UNITY_EXTENSIONS` 集合中包含 `.meta`，但 `.meta` 是 GUID 元数据文件（由 `meta-index.ts` 独立处理），不产出 Unity 图边。`.meta` 也不应在主 pipeline 中作为"Unity 检测信号"。

## 范围边界

| 边界 | 规则 |
|------|------|
| **Reads** | `pipeline-phases/unity-scan.ts`, `gitnexus/skills/gitnexus-cli.md`, `UNITY_RESOURCE_BINDING.md` |
| **Writes** | `pipeline-phases/unity-scan.ts`（activation gate 逻辑 + `UNITY_EXTENSIONS`），`gitnexus/skills/gitnexus-cli.md`（analyze 章节 Unity 最佳实践） |
| **不包括** | `processUnityResources()` 内部实现、`meta-index.ts`、pipeline 其他阶段、tree-sitter 解析器 |
| **Off-limits** | 生产环境 `.env`、实时仓库数据、工作树之外的 git 操作 |

## Capabilities

### New Capabilities

（无 — 本 change 为修复既有断裂，不新增能力）

### Modified Capabilities

- `unity-scan-activation`: 修复 `unityScanPhase` 激活门，使 Unity 扫描在仅 `--extensions .cs`（无 `.meta/.prefab/.unity/.asset` 扩展名）时仍然正确激活；从 `UNITY_EXTENSIONS` 中移除 `.meta`
- `cli-skill-unity-doc`: 在 `gitnexus-cli.md` skill 的 analyze 章节补充 Unity 项目最佳实践说明（`--extensions .cs` + `--csharp-define-csproj` 组合）

## Capabilities 待确认项

- [x] 能力清单已确认：两项修改能力 `unity-scan-activation` 和 `cli-skill-unity-doc`

## Impact

| 维度 | 影响 |
|------|------|
| **Unity 项目 analyze** | `--extensions .cs` 现在生成完整的 Unity 绑定 + lifecycle 合成边 |
| **非 Unity 项目** | 无影响 — 图中无 C# Class 节点时激活门不触发 |
| **`.meta` 处理** | 从主 pipeline 中移除（用户不再需要 `--extensions .meta`）；Unity scan 的 `meta-index.ts` 继续独立处理 |
| **分析性能** | neonspark 规模：~22min → ~3–5min（扫描 126K → 8K 文件） |
| **CLI skill 文档** | analyze 章节新增 Unity 项目推荐参数组合 |

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 资源绑定架构: `repo://GitNexus/UNITY_RESOURCE_BINDING.md`
  - 运行时链架构: `repo://GitNexus/UNITY_RUNTIME_PROCESS.md`
  - 真理源: `repo://GitNexus/docs/unity-runtime-process-source-of-truth.md`
  - CLI skill: `repo://GitNexus/gitnexus/skills/gitnexus-cli.md`
