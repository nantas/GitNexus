# Changelog: `--extensions` 参数修复

**Date**: 2026-05-10
**Change**: fix-extensions-param-pipeline
**Author**: automation

## 修复

修复 `gitnexus analyze --extensions .cs` 参数在 `chore/merge-upstream-2026-05` 合并过程中断裂的传递链。

### 问题

`--extensions` 从 CLI 解析后未能传递到 pipeline 文件扫描阶段，导致扩展名过滤完全失效。用户指定 `--extensions .cs` 时仍会扫描并解析所有文件类型。

### 根因

`EffectiveAnalyzeOptions.includeExtensions` 在 CLI 层正确解析，但 `AnalyzeOptions` 接口缺少对应字段，导致参数在 `runFullAnalysis()` → `runPipelineFromRepo()` 传递链中丢失。

### 修复链路

```
CLI --extensions .cs
  → EffectiveAnalyzeOptions.includeExtensions (analyze-options.ts) ✅ (已工作)
  → AnalyzeOptions.includeExtensions (run-analyze.ts)             🆕 新增
  → PipelineOptions.includeExtensions (pipeline.ts)              🆕 填充
  → scanPhase ctx.options?.includeExtensions (scan.ts)           🆕 传递
  → walkRepositoryPaths(..., includeExtensions) (filesystem-walker.ts) 🆕 过滤
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/cli/analyze.ts` | +1 行: 传入 `effective.includeExtensions` |
| `src/core/run-analyze.ts` | +4 行: 接口 + 传递 + 持久化 |
| `src/core/ingestion/pipeline-phases/scan.ts` | 传递 `ctx.options?.includeExtensions` |
| `src/core/ingestion/filesystem-walker.ts` | 新增可选参数 + endsWith 过滤 |
| `src/core/ingestion/filesystem-walker.test.ts` | 4 个新测试用例 |

### 验证

- 类型检查通过
- 4 个新单元测试通过（单扩展名、多扩展名、undefined、空数组）
- 零回归
