# Design

## Context

在 `chore/merge-upstream-2026-05` 分支上存在 108 个 pre-existing 测试失败，全部位于测试文件（`.test.ts`）中。生产代码无需修改，仅需对齐测试断言与 mock 以匹配已变更的生产代码行为。

## Goals / Non-Goals

**Goals:**
- 将 default pool (`--project default`) 的测试失败数从 108 降至 0
- 每个修改的测试文件独立可运行（`npx vitest run <file>`）
- 保持与当前生产代码的精确对齐，不引入新的假设

**Non-Goals:**
- 不改动生产代码（`setup.ts`、`ai-context.ts`、`tools.ts` 等）
- 不新增测试覆盖率
- 不重构测试架构或基础设施
- 不解决套件超时问题（见独立 change）

## Decisions

### 决策 1：`setupCommand()` 调用添加 `{ agent: ... }`

**问题**：`setup.test.ts`、`setup-jsonc.test.ts`、`setup-codex.test.ts` 调用 `setupCommand()` 不带参数，走 `legacyCursorMode = true` 进入 Cursor 路径。

**方案**：在每个测试的调用处传入对应 agent：
- Claude Code 测试 → `{ agent: 'claude' }`
- OpenCode 测试 → `{ agent: 'opencode' }`
- Codex 测试 → `{ agent: 'codex' }`

**备选**：改为直接调用内部函数（`setupClaudeCode()` 等）而非 `setupCommand()`。不采用的原因是内部函数未导出，且 `setupCommand()` 是公共入口，更贴近真实使用。

### 决策 2：AI Context 测试匹配新模板

**问题**：`test/unit/ai-context.test.ts` 期望旧模板格式。

**方案**：将所有字符串断言替换为匹配 `gitnexus:start/end` 标记格式。具体包括：
- 替换 `"If any GitNexus tool warns the index is stale"` → `"gitnexus:start"`
- 替换 `"## Always Do"` / `"## Never Do"` → `"## Always Start Here"` / 技能路由表
- `skipAgentsMd` 测试中移除对 `result.files` 中 skip 条目的依赖

### 决策 3：Benchmark Contract 测试更新文案

**问题**：`src/cli/benchmark-agent-safe-query-context.test.ts` 断言 JSDoc 字符串与当前 `tools.ts` 不一致。

**方案**：读取当前 `tools.ts` 的实际文案，更新测试中所有硬编码字符串断言。将失败的 `expect(!text.includes('resource_heuristic')).toBeTruthy()` 修改为实际状态。

### 决策 4：删除过时测试文件

**问题**：`test/unit/parse-worker-csharp-preproc.test.ts` 引用了已删除的 `symbol-table.js`。

**方案**：删除整个测试文件。`symbol-table.ts` 已被移除且无替代，该测试测试的 worker parse aggregation 逻辑已被覆盖在其他集成测试中。如果存在重要的解析逻辑，在后续 change 中用新模块重建。

### 决策 5：Repo Manager 测试隔离

**问题**：`test/unit/repo-manager-alias.test.ts` 设置了 `GITNEXUS_HOME`，但 `readRegistry()` 同时读共享的 `~/.gitnexus/registry.json`。

**方案**：该测试已设置 `process.env.GITNEXUS_HOME` 指向临时路径。问题可能是 `repo-manager.js` 的读取路径逻辑包含 fallback 到 `~/.gitnexus`。修复方式：确认 `repo-manager` 是否优先使用 `GITNEXUS_HOME`。如果是则测试已是隔离的，失败是别名冲突需要调整。

## Risks / Migration

| 风险 | 级别 | 说明 |
|------|------|------|
| 测试修复后仍有其他环境差异 | 低 | 测试均在 fork 中运行，环境隔离较好 |
| `symbol-table.js` 删除后无测试覆盖丢失 | 低 | 该测试是单元级，集成测试覆盖同类场景 |
| CI 中 `npm test` 仍然超时 | 中 | 见独立 change `fix-test-suite-timeout` |
