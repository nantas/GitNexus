# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `orbitos-change-v1`
- `project_page_ref`:
  - `docs/unity-runtime-process-source-of-truth.md` — Unity runtime process 真理源，需移除 rule-lab/gap-lab 章节
  - `docs/gap-lab-rule-lab-architecture.md` — 架构决策记录，可删除或归档
  - `docs/gitnexus-config-files.md` — 配置文件文档，移除 gap-lab 产物引用
  - `docs/event-delegate-gap-analysis.md` — Event/delegate 分析文档，移除 gap-lab 引用
  - `openspec/specs/mcp-local-backend/spec.md` — mcp-local-backend spec，移除 rule-lab dispatch 要求
  - `AGENTS.md` — setup 安装内容索引，移除 rule-gen 和 e2e-verify skill 引用
  - `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md` — 需删除
  - `.agents/skills/gitnexus/gitnexus-unity-e2e-verify/SKILL.md` — 需更新
  - `.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md` — 需删除
  - `gitnexus/skills/gitnexus-unity-rule-gen.md` — skill 源文件，需删除
  - `gitnexus/skills/gitnexus-unity-e2e-verify.md` — skill 源文件，需更新
  - `gitnexus/skills/_shared/unity-rule-authoring-contract.md` — skill 源文件，需删除
- `additional_context_refs`:
  - `docs/plans/2026-05-09-analyze-perf-regression-root-cause-report.md` — 根因报告，已确认 `applyUnityRuntimeBindingRules` 断裂

## Source of Truth

- 行为规范真源：`specs/<capability-id>/spec.md`
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `openspec/specs/mcp-local-backend/spec.md` — 移除 rule-lab dispatch 要求
- `writeback_owner`: gitnexus maintainers
- `writeback_timing`: 本 change 执行完成后

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- 若存在未确认引用、未定目标页或权限限制，必须在下方列明

## 待确认项

- [x] 已确认标准页引用
- [x] 已确认项目页引用
- [x] 已确认回写目标与权限
- [x] 已确认异常处理与冲突策略
