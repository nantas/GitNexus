# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `repo://orbitos:openspec/schemas/orbitos-change-v1.yaml`
- `project_page_ref`: `repo://GitNexus:docs/plans/2026-05-11-neonnew-e2e-profile.md` （性能测量方法与数据）
- `additional_context_refs`:
  - `repo://GitNexus:openspec/changes/perf-scope-resolution-bridge/`（前置 change，`perf-scope-resolution-bridge`）
  - `repo://GitNexus:src/core/ingestion/languages/csharp/namespace-siblings.ts`（`populateCsharpNamespaceSiblings`）
  - `repo://GitNexus:gitnexus-shared/src/scope-resolution/parsed-file.ts`（`ParsedFile` 接口定义）

## Source of Truth

- 行为规范真源：`specs/cache-namespace-names-in-parsed-file/spec.md`
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `docs/plans/2026-05-11-neonnew-e2e-profile.md`（更新最终测量结论）
- `writeback_owner`: 本 change 实现者
- `writeback_timing`: 实现完成且验证通过后

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- 若存在未确认引用、未定目标页或权限限制，必须在下方列明

## 待确认项

- [x] 已确认标准页引用
- [x] 已确认项目页引用
- [x] 已确认回写目标与权限
- [x] 已确认异常处理与冲突策略
