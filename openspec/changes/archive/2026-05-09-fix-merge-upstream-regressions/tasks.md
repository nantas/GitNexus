# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 确认 5 个 Modified Capability spec 均对应明确的测试回归和修复路径
- [x] 1.2 运行 `npm run build && npx tsc --noEmit` 确认基线零编译错误（benchmark test 1 个预存 TS 错误不在本 change 范围）

---

## 2. 核心实现任务

### 2.A skip-git-cli（4 回归）— `specs/analyze-cli/spec.md`

- [x] 2.A.1 检查 `src/cli/index.ts` 中 analyze 命令的 Commander option 注册，确认 `--skip-git` / `--skip-agents-md` 缺失
- [x] 2.A.2 已添加 `--skip-git` 和 `--skip-agents-md` Commander options
- [x] 2.A.3 运行 `npm run build` 然后 `npx vitest run test/unit/skip-git-cli.test.ts`
- [x] 2.A.4 验证全部 15 用例通过

### 2.B tool-direct-cli（5 回归）— `specs/cli-tool-direct-dispatch/spec.md`

- [x] 2.B.1 检查 `src/cli/tool.ts` 现状，`detectChangesCommand` 完全移除
- [x] 2.B.2 恢复 `detectChangesCommand` 函数作为 `LocalBackend.callTool` 的薄 adapter
- [x] 2.B.3 运行 `npx vitest run test/unit/tool-direct-cli.test.ts`
- [x] 2.B.4 验证全部 15 用例通过

### 2.C cli-index-help（2 回归）— `specs/cli-help-surface/spec.md`

- [x] 2.C.1 检查 `detect-changes` 和 `wiki` help 预期 — 需要添加 detect-changes 命令和 wiki flags
- [x] 2.C.2 添加 detect-changes 命令 + wiki `--provider`/`--review`/`-v,--verbose` flags
- [x] 2.C.3 运行 `npx vitest run test/unit/cli-index-help.test.ts`
- [x] 2.C.4 验证全部 15 用例通过

### 2.D eval-formatters（1 回归）— `specs/eval-server-formatters/spec.md`

- [x] 2.D.1 在 `src/cli/eval-server.ts` 的 `formatContextResult` 中添加 evidence_mode 输出
- [x] 2.D.2 运行 `npx vitest run test/unit/eval-formatters.test.ts`
- [x] 2.D.3 验证全部 90 用例通过

### 2.E scoped-cli-commands（2 回归）— `specs/mcp-setup-config/spec.md`

- [x] 2.E.1 检查代码 — `.mcp.json` 已有 `"args": ["mcp"]`，`ai-context.ts` 已有 `npx -y <resolved-spec> analyze`
- [x] 2.E.2 `.mcp.json` 已在 repo root — manifest 已包含 `"args": ["mcp"]`
- [x] 2.E.3 在 `resources.ts` 中添加 `resolveAnalyzeNpxCommand` 引用
- [x] 2.E.4 运行 `npx vitest run test/unit/scoped-cli-commands.test.ts`
- [x] 2.E.5 验证全部 6 用例通过

---

## 3. 收敛与验证

- [x] 3.1 运行全部 5 个测试文件确认零回归 — 141/141 通过
- [x] 3.2 运行 `npx tsc --noEmit` 确认零新增编译错误（预存 benchmark test 错误不受影响）
- [x] 3.3 确认 spec-to-implementation 覆盖：5/5 capability 均有对应的修复验证

## 4. Writeback — merge-upstream-2026-05 task 4.3

- [x] 4.1 更新 `merge-upstream-2026-05/tasks.md` — 勾选 task 4.3，更新 §5.2 和 §6 状态
- [x] 4.2 更新 `merge-upstream-2026-05/verification.md` — 追加 141/141 修复结论
- [x] 4.3 更新 `merge-upstream-2026-05/writeback.md` — README 状态改为 ✅
- [x] 4.4 `gitnexus/README.md` — Language Feature Matrix 已存在且正确，无需变更
- [x] 4.5 `gitnexus/AGENTS.md` — v1.8.0 已最新，无需变更
