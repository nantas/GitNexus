# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `repo://GitNexus/docs/plans/2026-05-09-analyze-perf-regression-root-cause-report.md` (§3 `--extensions` 参数断裂)
- `project_page_ref`:
  - `repo://GitNexus/ARCHITECTURE.md` — pipeline 架构与阶段依赖关系
  - `repo://GitNexus/CONTRIBUTING.md` — 开发与测试规范
- `additional_context_refs`:
  - `repo://GitNexus/AGENTS.md` — 项目 AGENTS 指令（含测试验证强制流程）
  - `repo://GitNexus/docs/tree-sitter-parsing-pitfalls.md` — 文件过滤相关已知陷阱

## Source of Truth

- 行为规范真源：`specs/fix-extensions-param-pipeline/spec.md`
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `repo://GitNexus/docs/changelog/extensions-param-fix.md` — 修复摘要（实施后创建）
  - 根因报告中 §3 `--extensions` 参数断裂结论的更新
- `writeback_owner`: 实现者（实施后更新）
- `writeback_timing`: 实施完成、测试通过后

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- 本 change 不涉及外部标准页面绑定，所有规范和验证依据均在 repo 内部

## 待确认项

- [x] 已确认标准页引用 — 根因报告已涵盖问题定义
- [x] 已确认项目页引用 — ARCHITECTURE.md / CONTRIBUTING.md 已提供足够上下文
- [x] 已确认回写目标与权限 — changelog 文档在实施后创建，无权限限制
- [x] 已确认异常处理与冲突策略 — 纯内部修复，无外部标准冲突
