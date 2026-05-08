# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `repo://gitnexus-upstream`
- `project_page_ref`: `openspec/changes/merge-upstream-2026-05/design.md`（上游合并策略与决策偏差记录）；`AGENTS.md`（fork 维护规则）
- `additional_context_refs`:
  - `gitnexus/src/cli/analyze-options.ts`（fork 独有：scope/alias/reuse-options 解析）
  - `gitnexus/src/cli/analyze-summary.ts`（fork 独有：Unity/C# preproc/fallback 诊断输出）
  - `gitnexus/src/cli/analyze-runtime-summary.ts`（fork 独有：pipeline runtime 摘要）
  - `gitnexus/src/cli/exit-code.ts`（fork 独有：close-policy）
  - `gitnexus/src/core/tree-sitter/csharp-define-profile.ts`（fork 独有：csproj define 解析）
  - `gitnexus/src/core/tree-sitter/csharp-preproc-normalizer.ts`（fork 独有：C# 条件编译归一化）
  - `gitnexus/src/core/ingestion/scope-filter.ts`（fork 独有：scope 规则解析）
  - `gitnexus/src/core/run-analyze.ts`（upstream：新 unified 分析入口 `runFullAnalysis`）

## Source of Truth

- 行为规范真源：`specs/analyze-fork-features/spec.md`
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面（含 merge 文档、AGENTS.md、fork 源文件）提供上下文分析和现有实现参考，但不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `AGENTS.md`：若 CLI 命令（analyze 参数、setup scope 等）有变，更新维护规则
  - `gitnexus/README.md`：若 CLI 能力表格有变（新增/修改 analyze 选项），更新描述
  - `openspec/changes/merge-upstream-2026-05/verification.md`：记录偏差项（本次 change 是对 merge 中丢失功能的恢复）
- `writeback_owner`: nantas-dev 维护者
- `writeback_timing`: 实现完成并通过全部验证门后执行

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- 若存在未确认引用、未定目标页或权限限制，必须在下方列明

## 待确认项

- [x] 已确认标准页引用：`repo://gitnexus-upstream`（https://github.com/abhigyanpatwari/GitNexus.git）
- [x] 已确认项目页引用：merge 文档和 AGENTS.md 均为本仓库内已有文件
- [x] 已确认回写目标与权限：所有回写目标均为本仓库内文件
- [x] 已确认异常处理与冲突策略：若 restore 过程中发现 upstream 新架构与 fork 功能不可调和（如 `runFullAnalysis` 接口无法承载 C# preproc pipeline options），以最小侵入方式扩展 upstream 接口，并在 writeback 中记录架构决策
