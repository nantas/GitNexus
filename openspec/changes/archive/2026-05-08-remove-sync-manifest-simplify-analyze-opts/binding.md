# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: 无外部标准页引用（本 change 为内部架构简化）
- `project_page_ref`:
  - `gitnexus/src/cli/analyze-options.ts` — analyze 参数解析模块
  - `gitnexus/src/cli/analyze.ts` — analyze 命令入口
  - `gitnexus/src/cli/index.ts` — CLI 参数注册
  - `gitnexus/src/storage/repo-manager.ts` — RepoMeta 类型定义
  - `gitnexus/src/cli/clean.ts` — clean 命令
  - `gitnexus/skills/gitnexus-cli.md` — CLI skill 源文件
  - `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` — 已安装 skill
- `additional_context_refs`:
  - `openspec/changes/archive/2026-05-08-gitnexus-cli-clean-preserve-config/` — 上次相关 change（clean 保留 sync-manifest）
  - `INSTALL-GUIDE.md`
  - `AGENTS.md`
  - `gitnexus/CHANGELOG.md`

## Source of Truth

- 行为规范真源：`specs/<capability-id>/spec.md`
- 项目页面角色：上下文输入 / 治理展示 / 结果回写
- 非真源说明：项目页面不得替代 spec delta 作为实现与验证依据

## 回写目标

- `writeback_targets`:
  - `gitnexus/skills/gitnexus-cli.md` — 更新 analyze 工作流描述
  - `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` — 同步更新已安装 skill
  - `INSTALL-GUIDE.md` — 移除 sync-manifest 相关步骤
  - `AGENTS.md` — 更新 analyze 命令说明
  - `gitnexus/CHANGELOG.md` — 记录 breaking change
- `writeback_owner`: 实施者
- `writeback_timing`: 实施完成后、commit 前

## 同步约束

- 页面与 spec 不一致时，以 `specs/` 为准
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks
- 已安装 skill (`SKILL.md`) 必须与源文件 (`gitnexus/skills/gitnexus-cli.md`) 保持一致

## 待确认项

- [x] 已确认标准页引用（无外部标准页）
- [x] 已确认项目页引用
- [x] 已确认回写目标与权限
- [x] 已确认异常处理与冲突策略
