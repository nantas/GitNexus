# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `repo://gitnexus`
- `project_page_ref`: `openspec/changes/restore-local-backend-unity-features/tasks.md` (parent change, archived)
- `additional_context_refs`:
  - `openspec/changes/restore-local-backend-unity-features/verification.md`
  - `gitnexus/src/mcp/local/local-backend.ts`
  - `gitnexus/src/mcp/tools.ts`
  - `docs/unity-runtime-process-source-of-truth.md`

## Source of Truth

- 行为规范真源：`specs/**/spec.md`
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `gitnexus/src/mcp/local/local-backend.ts` — 已通过 adapter 注入，本 change 补充缺失的辅助函数和 tool wiring
  - `gitnexus/src/mcp/tools.ts` — 补充 tool descriptions 中的 Unity hydration 术语
  - `docs/unity-runtime-process-source-of-truth.md` — 记录新增的辅助函数接口
- `writeback_owner`: repository maintainers
- `writeback_timing`: 全部 spec requirement 验证通过后执行

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接

## 待确认项

- [x] 已确认标准页引用
- [x] 已确认项目页引用
- [x] 已确认回写目标与权限
