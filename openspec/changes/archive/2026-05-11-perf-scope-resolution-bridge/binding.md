# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `repo://gitnexus`
- `project_page_ref`: `openspec/changes/perf-scope-resolution-bridge/`
- `additional_context_refs`:
  - `docs/plans/2026-05-09-analyze-perf-regression-root-cause-report.md` — 性能回归根因报告
  - `docs/unity-runtime-process-source-of-truth.md` — Unity runtime process 真理源

## Source of Truth

- 行为规范真源：`specs/ingestion-pipeline/spec.md`、`specs/unity-runtime-process/spec.md`
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `docs/plans/2026-05-09-analyze-perf-regression-root-cause-report.md` — 更新修复状态，标注 scope-resolution 二次解析已解决
- `writeback_owner`: `repository maintainers`
- `writeback_timing`: 实现完成并通过 E2E 验证后

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- 若存在未确认引用、未定目标页或权限限制，必须在下方列明

## 待确认项

- [x] 已确认标准页引用
- [x] 已确认项目页引用
- [x] 已确认回写目标与权限
- [x] 已确认异常处理与冲突策略
