# Proposal

## 问题定义

`gitnexus analyze --extensions .cs` 参数从 CLI 解析后未能传递到 pipeline 扫描阶段，导致扩展名过滤完全失效。analyze 默认扫描并解析所有文件（即使 `--extensions` 已指定），造成：

- 不必要的文件扫描+解析耗时：+100–200s
- 用户预期的过滤语义不生效：用户指定 `.cs` 时仍会处理 `.ts`、`.md` 等文件
- 根因详见 §3 of `docs/plans/2026-05-09-analyze-perf-regression-root-cause-report.md`

## 范围边界

| 边界 | 规则 |
|------|------|
| **Reads** | `cli/analyze.ts`, `core/run-analyze.ts`, `core/ingestion/pipeline.ts`, `core/ingestion/pipeline-phases/scan.ts`, `core/ingestion/filesystem-walker.ts`, `cli/analyze-options.ts` |
| **Writes** | 同 reads 路径中需要修复的文件；同时更新对应的测试文件 |
| **不包括** | `applyUnityRuntimeBindingRules` 的接入（P0 但独立问题）；scope-resolution 产出边覆盖度验证（P1 独立问题）；pipeline 整体性能优化（P2） |
| **Off-limits** | 非 pipeline 阶段的代码；`unity-resource-processor.ts` 等 Unity 专用文件 |

## Capabilities

### New Capabilities

（无 — 本 change 为修复既有断裂，不新增能力）

### Modified Capabilities

- `cli-analyze-extension-filter`: 修复 `--extensions` 参数从 CLI 经 orchestrator 到 pipeline scan 阶段的完整传递链，使扩展名过滤在文件扫描阶段生效

## Capabilities 待确认项

- [x] 能力清单已确认：单一修改能力 `cli-analyze-extension-filter`，修复而非新增

## Impact

| 维度 | 影响 |
|------|------|
| **CLI 行为** | `--extensions .cs` 现在实际过滤扫描文件，而非仅解析但扫描全部 |
| **已有 meta.json** | 新增 `includeExtensions` 持久化字段，下次 `--reuse-options` 可回读 |
| **已有测试** | 无需修改，所有现有 `walkRepositoryPaths` 调用不传 `includeExtensions`，行为不变 |
| **性能** | 文件扫描 + 解析阶段可减少 100–200s（大型混合代码仓库） |
| **风险** | 低 — 新增参数均为可选，默认 `undefined` 时行为完全退化为当前逻辑 |

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 根因报告: `repo://GitNexus/docs/plans/2026-05-09-analyze-perf-regression-root-cause-report.md`
  - 架构文档: `repo://GitNexus/ARCHITECTURE.md`
  - 贡献指南: `repo://GitNexus/CONTRIBUTING.md`
