# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `repo://gitnexus`
- `project_page_ref`: `openspec/changes/merge-upstream-2026-05/tasks.md` (parent change)
- `additional_context_refs`:
  - `openspec/changes/merge-upstream-2026-05/verification.md`
  - `openspec/changes/merge-upstream-2026-05/writeback.md`
  - `gitnexus/src/cli/analyze.ts`
  - `gitnexus/src/cli/tool.ts`
  - `gitnexus/src/cli/eval-server.ts`

## Source of Truth

- 行为规范真源：`specs/**/spec.md`
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `openspec/changes/merge-upstream-2026-05/tasks.md` — 勾选 task 4.3 writeback
  - `openspec/changes/merge-upstream-2026-05/verification.md` — 更新验证结论
  - `openspec/changes/merge-upstream-2026-05/writeback.md` — 更新回写状态
  - `gitnexus/AGENTS.md` — 同步变更影响
  - `gitnexus/README.md` — 能力表格更新
- `writeback_owner`: repository maintainers
- `writeback_timing`: 全部 spec requirement 验证通过后执行

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks

## 待确认项

- [x] 已确认标准页引用
- [x] 已确认项目页引用
- [x] 已确认回写目标与权限
