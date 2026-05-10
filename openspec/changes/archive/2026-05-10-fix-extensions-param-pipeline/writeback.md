# Writeback: fix-extensions-param-pipeline

## Writeback Targets

### 1. Main Spec Sync

- **Target**: `openspec/specs/cli-analyze-extension-filter/spec.md`
- **Action**: Create new main spec from delta spec
- **Status**: Pending (see spec sync step)

### 2. Changelog

- **Target**: `docs/changelog/extensions-param-fix.md`
- **Action**: Create changelog documenting the fix
- **Status**: Pending (see changelog creation)

## Fix Summary

修复 `gitnexus analyze --extensions .cs` 参数在 `chore/merge-upstream-2026-05` 合并中断裂的问题。

### Root Cause

`--extensions` 参数从 CLI 解析层 (`analyze-options.ts`) 正确解析为 `EffectiveAnalyzeOptions.includeExtensions`，但未通过 `runFullAnalysis()` → `runPipelineFromRepo()` → `scanPhase` → `walkRepositoryPaths()` 传递到底层文件扫描器。

### Fix Chain

1. **`cli/analyze.ts:480`**: 传入 `includeExtensions: effective.includeExtensions` 到 `runFullAnalysis()`
2. **`core/run-analyze.ts:104`**: `AnalyzeOptions` 接口新增 `includeExtensions?: string[]`
3. **`core/run-analyze.ts:292`**: 传递到 `runPipelineFromRepo()` 的 `PipelineOptions`
4. **`core/run-analyze.ts:509`**: 持久化到 `meta.json.analyzeOptions` 用于 `--reuse-options`
5. **`core/ingestion/pipeline-phases/scan.ts:49`**: 传递 `ctx.options?.includeExtensions` 到 `walkRepositoryPaths()`
6. **`core/ingestion/filesystem-walker.ts:38,51-52`**: 新增可选参数，glob 后 batch stat 前做 `endsWith` 过滤

### Files Modified

| File | Change |
|------|--------|
| `src/core/ingestion/filesystem-walker.ts` | +8 lines: 新增可选参数 + 过滤逻辑 |
| `src/core/ingestion/filesystem-walker.test.ts` | +72 lines: 4 个新测试用例 |
| `src/core/ingestion/pipeline-phases/scan.ts` | +5/-4 lines: 传递 `includeExtensions` |
| `src/core/run-analyze.ts` | +4 lines: 接口 + 传递 + 持久化 |
| `src/cli/analyze.ts` | +1 line: CLI 入口传递 |
