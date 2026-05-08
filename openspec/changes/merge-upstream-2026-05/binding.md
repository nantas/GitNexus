# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `repo://gitnexus-upstream`
- `project_page_ref`: `docs/2026-03-18-upstream-merge-feasibility-and-checklist.md`（前次可行性分析）；`AGENTS.md`（fork 维护规则）
- `additional_context_refs`:
  - `docs/unity-runtime-process-source-of-truth.md`（Unity runtime process 真理源）
  - `docs/gitnexus-config-files.md`（配置文件规则）
  - `gitnexus/src/core/unity/`（Unity 核心模块实现）
  - `gitnexus/src/rule-lab/`（Rule-lab 模块实现）
  - `gitnexus/src/benchmark/`（Benchmark 模块实现）
  - `openspec/changes/archive/2026-05-08-remove-sync-manifest-simplify-analyze-opts/`（最近一次 analyze 变更）

## Source of Truth

- 行为规范真源：`specs/merge-execution/spec.md`
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面（含前次 merge 文档、docs/ 下的设计文档、plan 文档）提供上下文分析和参考约束，但不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `docs/2026-03-18-upstream-merge-feasibility-and-checklist.md`：摘要本次合并结果、实际冲突数、策略偏差
  - `AGENTS.md`：若合并后 CLI/skill 安装行为有变，更新维护规则
  - `gitnexus/README.md`：若合并后语言支持、CLI 命令有变，更新能力表格
- `writeback_owner`: nantas-dev 维护者
- `writeback_timing`: 合并完成并通过全部验证门后执行，最迟不超过 merge commit 后 3 个工作日

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- 若存在未确认引用、未定目标页或权限限制，必须在下方列明
- upstream/main 的变更不在此 change 的回写范围内；仅回写 fork 侧的状态变化

## 待确认项

- [x] 已确认标准页引用：`repo://gitnexus-upstream`（https://github.com/abhigyanpatwari/GitNexus.git）
- [x] 已确认项目页引用：前次 merge 文档和 Unity 真理源文档均为仓库内已有文件
- [x] 已确认回写目标与权限：所有回写目标均为本仓库内文件
- [x] 已确认异常处理与冲突策略：如 merge 过程中发现上游改动与 fork 核心能力（Unity runtime process、rule-lab、benchmark）不可调和，以 fork 为准，并在 writeback 中记录偏差
