# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `openspec/changes/merge-upstream-2026-05/specs/mcp-local-backend/spec.md`（上游合并后的 Unity 功能保留 spec）、`openspec/changes/merge-upstream-2026-05/specs/unity-runtime-process/spec.md`（Unity runtime process 保留 spec）
- `project_page_ref`:
  - `docs/unity-runtime-process-source-of-truth.md`（Unity runtime process 真理源）
  - `docs/unity-runtime-process-rule-driven-implementation.md`（V2 技术实现手册）
  - `openspec/changes/merge-upstream-2026-05/tasks.md`（上游合并任务追踪 §5.4）
  - `openspec/changes/merge-upstream-2026-05/writeback.md`（上游合并回写摘要，标记 Unity 功能缺失）
- `additional_context_refs`:
  - `gitnexus/src/mcp/local/unity-*.ts`（fork Unity hydration/parity/lazy/warmup 模块）
  - `gitnexus/src/core/unity/`（Unity 核心引擎模块）
  - `gitnexus/src/mcp/local/local-backend.ts`（当前上游版 local backend，需注入 Unity 功能）
  - `docs/plans/2026-04-08-unity-query-context-cypher-workflows-implementation-plan.md`（Cypher workflow 原始实现计划）
  - `docs/plans/2026-03-14-unity-lazy-expand-performance-hardening.md`（Lazy hydration 性能计划）
  - `docs/reports/`（验收证据与 benchmark 报告）

## Source of Truth

- 行为规范真源：`specs/mcp-local-backend/recover.md`（本 change 编写的恢复 spec）
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面（含真理源文档、原始实现计划）提供上下文分析和参考约束，但不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `docs/unity-runtime-process-source-of-truth.md`：更新 local-backend.ts 恢复后的接口与行为说明
  - `docs/2026-03-18-upstream-merge-feasibility-and-checklist.md`：追加本地后端 Unity 功能恢复状态
  - `AGENTS.md`：若 CLI / setup / skill 行为有变，更新维护规则
- `writeback_owner`: nantas-dev 维护者
- `writeback_timing`: 恢复完成并通过验证门后执行

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- 上游合并 change（`merge-upstream-2026-05`）是本次恢复的基础，其策略偏差记录（尤其是 local-backend.ts 从 C 降级为 B）是本次 change 的直接触发因素

## 待确认项

- [x] 已确认标准页引用：merge-upstream-2026-05 的 mcp-local-backend/unity-runtime-process spec
- [x] 已确认项目页引用：真理源文档、merge 任务追踪 §5.4 均为仓库内已有文件
- [x] 已确认回写目标与权限：所有回写目标均为本仓库内文件
- [ ] 已确认异常处理与冲突策略：如恢复过程中发现上游接口变更导致 fork 模块无法直接适配，应记录在 deviation 中并暂停以获取用户决策
