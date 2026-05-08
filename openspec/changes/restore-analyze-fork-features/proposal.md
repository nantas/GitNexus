# Proposal

## 问题定义

`merge-upstream-2026-05` 第 4 批因 `-Xours` auto-merge 导致 `analyze.ts` 结构性损坏（try/catch 不平衡、孤儿 else 块），最终降级为策略 B 取 upstream 完整版本。此举吸收了 upstream 的 `runFullAnalysis` 统一分析入口、`--embeddings`/`--drop-embeddings`/`--force` 等新选项，但**丢失了 fork 侧精心构建的 5 个核心功能**：

1. **Scoped analyze**: `--scope <path>` 限定分析范围、`--name <alias>` 注册别名、`--reuse-options` 跨 run 持久化
2. **C# preproc CLI**: `--csharp-define-csproj <path>` 将 csproj define constants 注入 C# 条件编译归一化管线
3. **Diagnostics 输出**: Unity rule binding 诊断、C# preproc 审计、fallback 边恢复统计
4. **Close policy**: `process.exit(0)` 强制退出以规避 LadybugDB native module 的 open handles
5. **Pipeline options 桥接**: fork 的低层级 `runPipelineFromRepo` options（scopeRules, csharpDefineCsproj）需映射到 upstream 的 `runFullAnalysis` 接口

当前 upstream `analyze.ts` + `runFullAnalysis` 提供了干净的标准化分析入口，但**完全不具备上述 fork 能力**。本 change 目标是在不破坏 upstream 架构的前提下，将这 5 个能力系统性地恢复到新的 base 上。

## 范围边界

### 在范围内

- 在 upstream `analyze.ts` 中恢复 `--scope`、`--name`（增强 upstream 已有的基础 name 支持）、`--reuse-options` CLI 选项
- 在 upstream `analyze.ts` 中新增 `--csharp-define-csproj` CLI 选项
- 在 `runFullAnalysis` 中扩展 `AnalyzeOptions` 接口以承载 scope/csproj 参数
- 创建统一的 `formatDiagnosticsSummary()` 输出函数，整合 Unity/C# preproc/fallback 诊断
- 恢复 `process.exit(0)` 到 analyze 成功路径
- 保留 upstream 所有现有功能（`--embeddings`、`--drop-embeddings`、`--force`、`--skills`、`--skip-agents-md` 等）

### 不在范围内

- 修改 upstream `runFullAnalysis` 的核心逻辑
- 恢复 fork 的低层级 `runPipelineFromRepo` 直接调用方式（继续使用 `runFullAnalysis`）
- 修改 C# preproc 归一化管线本身（`csharp-preproc-normalizer.ts`）
- 修改 Unity runtime process 管线本身
- 新增任何非 analyze CLI 的功能
- 回写 upstream 仓库

## Capabilities

### New Capabilities

- `scoped-analyze`: 恢复 `--scope <path>` 限制分析范围、`--name <alias>` 注册别名（增强 upstream 已有 name）、`--reuse-options` 跨 run 持久化 analyze options 到 `meta.json`
- `csharp-define-csproj`: 新增 `--csharp-define-csproj <path>` CLI 选项，将 csproj define constants 传递到 pipeline 的 C# 条件编译归一化
- `analyze-diagnostics`: 创建统一的 `formatDiagnosticsSummary()` 输出接口，整合 Unity rule binding 诊断、C# preproc 审计摘要、fallback 边恢复统计
- `analyze-close-policy`: 恢复 `process.exit(0)` 到 analyze 成功路径，规避 LadybugDB/ONNX native module open handles

### Modified Capabilities

- `analyze-cli`: upstream 的 `analyze.ts` + `runFullAnalysis` 需要扩展 `AnalyzeOptions` 接口（新增 scopeRules, csharpDefineCsproj 字段）并桥接到 pipeline options

## Capabilities 待确认项

- [x] 能力清单已在 merge-upstream-2026-05 上下文中与用户对齐

## Impact

### 正面影响

- **功能完整性恢复**: fork 用户重新获得 scope analyze、C# preproc、诊断输出能力
- **架构清洁**: 在 upstream `runFullAnalysis` 标准化入口上扩展，而非回退到低层级 pipeline API
- **统一诊断**: 4 个分散的格式化函数整合为单一 `formatDiagnosticsSummary()`，减少 analyze.ts 中的输出代码量
- **可维护性提升**: 每个恢复的功能作为独立 capability，未来可单独演进

### 风险

- `AnalyzeOptions` 接口扩展可能与 upstream 后续变更产生语义冲突（缓解：使用可选字段，降级为 no-op）
- `runFullAnalysis` 可能不暴露足够的 pipeline 内部状态来支持诊断输出（缓解：在 `AnalyzeResult` 中新增 diagnostics 字段）
- C# preproc 的 `csharpDefineCsproj` 参数需要穿过 `runFullAnalysis` → `runPipelineFromRepo` → pipeline，链条较长（缓解：仅新增一个可选字段）

### 受影响方

- **所有 nantas-dev 下游消费者**: analyze CLI 行为恢复 fork 功能，但接口向后兼容
- **Unity runtime process 用户**: 诊断输出恢复后可重新验证
- **C# 项目用户**: `--csharp-define-csproj` 恢复后可重新使用条件编译归一化

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 标准页：`repo://gitnexus-upstream`
  - 项目页：`openspec/changes/merge-upstream-2026-05/design.md`、`AGENTS.md`
  - 回写目标：`AGENTS.md`、`gitnexus/README.md`、`openspec/changes/merge-upstream-2026-05/verification.md`
