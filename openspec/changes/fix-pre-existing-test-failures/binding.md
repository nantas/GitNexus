# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: 本 change 不涉及外部规范标准变更。测试行为规范遵循 GitNexus 项目现有的测试开发与验证强制流程（见 AGENTS.md § 测试开发与验证强制流程）。
- `project_page_ref`: 不涉及外部项目页面回写。
- `additional_context_refs`:
  - `openspec/changes/fix-pre-existing-test-failures/` — 本 change 目录
  - upstream `gitnexus/src/cli/setup.ts` — Phase 1 替换的真源
  - Commit `dc9f4dd4` — Phase 1 实施记录

## Source of Truth

- 行为规范真源：upstream `setup.ts`（JSONC 写入、PATH 检测等行为以 upstream 为准）
- fork 兼容层（`--agent`/`--scope`/`--cli-version`）以本 change 的 `design.md` 决策记录为准
- 项目页面角色：不适用（纯代码仓库变更，无外部项目页面）

## 回写目标

- `writeback_targets`: 无外部回写目标
- `writeback_owner`: GitNexus 仓库维护者
- `writeback_timing`: 变更提交时同步更新 AGENTS.md（如需调整测试相关章节）

## 同步约束

- upstream setup.ts 行为为本 change 的 source of truth，fork 兼容层不得破坏 upstream 已有测试
- local-backend.ts 的修改（Phase 2）需以 fork 版本为基础，不直接替换

## 待确认项

- [x] 已确认标准页引用：无需外部标准
- [x] 已确认项目页引用：纯仓库内变更
- [x] 已确认回写目标与权限：无外部回写
- [x] 已确认 upstream setup.ts 替换策略：完整替换 + 兼容层
- [ ] Phase 2 local-backend 修复策略待确认（方案 B: 修改测试 vs 方案 A: 替换实现）
