# Design

## Context

`merge-upstream-2026-05` 合并后，5 个测试文件的 14 个回归用例失败。需要修复这些测试，同时完成 parent change 的 writeback task 4.3。

## Goals / Non-Goals

**Goals:**
- 修复 14 个测试回归，全部通过
- 执行 merge-upstream-2026-05 writeback task 4.3
- `npx tsc --noEmit` 零编译错误

**Non-Goals:**
- 不处理 restore-local-backend 范围的问题
- 不新增 upstream 中未有的 CLI 功能
- 不修改测试断言语义（仅修复实现或适配测试）

## Decisions

### D1: skip-git-cli — 调查 CLI Commander 注册

**问题**: `--skip-git` 在 `analyze.ts` 中已定义（line 269），但 CLI 实际执行失败。
**策略**: 检查 `index.ts` 中 Commander 的 analyze 命令注册，确认 `--skip-git` 和 `--skip-agents-md` 选项是否被 Commander 声明。如果缺失，添加 Commander option 声明。

### D2: tool-direct-cli — 恢复或适配

**问题**: `detectChangesCommand` 从 `src/cli/tool.ts` 完全移除。
**策略 A (恢复)**: 从 fork 历史恢复 `detectChangesCommand` 函数，作为 `LocalBackend.callTool` 的薄 adapter。
**策略 B (适配测试)**: 如果上游有意移除此函数（改用 MCP 工具路由），将测试改为验证新的 dispatch 机制。
**优先策略 A**，因为 `src/cli/tool.ts` 仍存在且在 `index.ts` 中被引用。

### D3: cli-index-help — 更新测试预期

**问题**: `detect-changes` 和 `wiki` help 输出不匹配测试预期。
**策略**: 先运行实际的 `node dist/cli/index.js detect-changes --help` 和 `node dist/cli/index.js wiki --help`，对比测试预期。如果上游删除了这些 flag，更新测试以匹配上游实际输出；如果上游重命名了 flag，更新测试预期名称。

### D4: eval-formatters — 添加 evidence_mode 输出

**问题**: `formatContextResult` 不输出 `evidence_mode`。
**策略**: 在 `eval-server.ts` 的 `formatContextResult` 中添加 evidence_mode 的格式化输出。检查输入类型，在 evidence_mode 存在时将其包含在输出中。

### D5: scoped-cli-commands — 更新 Guidance 和 Manifest

**问题**: MCP manifest 缺少 `"args": ["mcp"]`，guidance 文本缺少 `resolveAnalyzeNpxCommand`。
**策略**: 检查 `setup.ts` 中 MCP manifest 和 guidance 文本的生成逻辑。上游重构了 setup 管线，可能需要在新位置添加这些字段。

## Risks / Migration

| 风险 | 缓解措施 |
|------|----------|
| `detectChangesCommand` 恢复后内部依赖的 API 可能已被上游变更 | 先检查 `cli/tool.ts` 现状和 `LocalBackend.callTool` 签名，如 API 不兼容则采用策略 B |
| `--skip-git` 可能需要 build 才能验证（依赖 dist/） | 每次修改后运行 `npm run build` + test |
| writeback 可能触及 merge-upstream-2026-05 的多种文档格式 | 逐文档检查现有格式，保持一致的风格 |
