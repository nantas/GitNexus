# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: 本 change 不涉及外部规范标准变更。测试行为规范遵循 GitNexus 项目现有的测试开发与验证强制流程（见 AGENTS.md § 测试开发与验证强制流程）。
- `project_page_ref`: 不涉及外部项目页面回写。
- `additional_context_refs`:
  - `docs/plans/2026-05-09-pre-existing-test-failures.md` — 已有测试失败基线分析

## Source of Truth

- 行为规范真源：`specs/<capability-id>/spec.md`（本 change 不新增 capability）
- 项目页面角色：不适用（纯代码仓库变更，无外部项目页面）
- 非真源说明：本 change 不涉及 spec delta，变更依据直接来自测试运行结果与代码分析

## 回写目标

- `writeback_targets`: 无外部回写目标
- `writeback_owner`: GitNexus 仓库维护者
- `writeback_timing`: 变更提交时同步更新 AGENTS.md（如需调整测试相关章节）

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准：不适用
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks：不适用
- 若存在未确认引用、未定目标页或权限限制，必须在下方列明：无

## 待确认项

- [x] 已确认标准页引用：无需外部标准
- [x] 已确认项目页引用：纯仓库内变更
- [x] 已确认回写目标与权限：无外部回写
- [x] 已确认异常处理与冲突策略：无 spec 冲突风险
