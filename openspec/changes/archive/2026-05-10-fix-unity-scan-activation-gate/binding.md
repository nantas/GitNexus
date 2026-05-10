# Binding

## 标准与项目页面绑定

- `spec_standard_ref`:
  - `repo://GitNexus/UNITY_RESOURCE_BINDING.md` — Unity 资源绑定架构（阶段 A 独立 glob 契约）
  - `repo://GitNexus/UNITY_RUNTIME_PROCESS.md` — Unity 运行时调用链架构（§3 Phase 5.5/5.6 顺序）
  - `repo://GitNexus/docs/unity-runtime-process-source-of-truth.md` — Pipeline Phase 5.5 真理源
- `project_page_ref`:
  - `repo://GitNexus/ARCHITECTURE.md` — pipeline 阶段架构
  - `repo://GitNexus/gitnexus/skills/gitnexus-cli.md` — CLI skill 文档（本次需修改 Unity 项目说明）
- `additional_context_refs`:
  - `repo://GitNexus/openspec/changes/fix-extensions-param-pipeline/proposal.md` — 前置修复（--extensions 传递链）
  - `repo://GitNexus/AGENTS.md` — CLI Setup 安装内容索引

## Source of Truth

- 行为规范真源：`specs/fix-unity-scan-activation-gate/spec.md`
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `repo://GitNexus/gitnexus/skills/gitnexus-cli.md` — 修改 analyze 章节，添加 Unity 项目 `--extensions` 最佳实践说明
  - `repo://GitNexus/openspec/changes/fix-extensions-param-pipeline/proposal.md` — 可选更新（若影响范围说明需调整）
- `writeback_owner`: 实现者（实施后更新）
- `writeback_timing`: 统一在验证通过后执行

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- gitnexus-cli skill 的回写限于 analyze 章节的 Unity 项目说明段落

## 待确认项

- [x] 已确认标准页引用 — UNITY_RESOURCE_BINDING.md / UNITY_RUNTIME_PROCESS.md / source-of-truth.md
- [x] 已确认项目页引用 — ARCHITECTURE.md / gitnexus-cli.md
- [x] 已确认回写目标与权限 — CLI skill 修改权限无限制
- [x] 已确认异常处理与冲突策略 — 纯内部修复，无外部标准冲突
