# Tasks

## 1. Spec 覆盖与实现准备

- [ ] 1.1 确认 5 个 Modified Capability spec 均对应明确的测试回归和修复路径
- [ ] 1.2 运行 `npm run build && npx tsc --noEmit` 确认基线零编译错误

---

## 2. 核心实现任务

### 2.A skip-git-cli（4 回归）— `specs/analyze-cli/spec.md`

- [ ] 2.A.1 检查 `src/cli/index.ts` 中 analyze 命令的 Commander option 注册，确认 `--skip-git` / `--skip-agents-md` 是否声明
- [ ] 2.A.2 如有缺失，添加 `--skip-git` 和 `--skip-agents-md` Commander options
- [ ] 2.A.3 运行 `npm run build` 然后 `npx vitest run test/unit/skip-git-cli.test.ts`
- [ ] 2.A.4 验证全部 5 用例通过（4 个失败 + 1 个此前通过）

### 2.B tool-direct-cli（5 回归）— `specs/cli-tool-direct-dispatch/spec.md`

- [ ] 2.B.1 检查 `src/cli/tool.ts` 现状，确认是否有上游替代的 tool dispatch 机制
- [ ] 2.B.2 恢复 `detectChangesCommand` 函数（从 fork 历史 `c7cf90cf` 或更早 commit），或适配为上游替代机制
- [ ] 2.B.3 运行 `npx vitest run test/unit/tool-direct-cli.test.ts`
- [ ] 2.B.4 验证全部 5 用例通过

### 2.C cli-index-help（2 回归）— `specs/cli-help-surface/spec.md`

- [ ] 2.C.1 运行实际 CLI `detect-changes --help` 和 `wiki --help`，对比测试预期
- [ ] 2.C.2 根据实际情况：当上游保留了 flag 但改名时更新测试预期；当上游删除了命令时采用替代策略
- [ ] 2.C.3 运行 `npx vitest run test/unit/cli-index-help.test.ts`
- [ ] 2.C.4 验证全部 5 用例通过（2 个失败 + 3 个此前通过）

### 2.D eval-formatters（1 回归）— `specs/eval-server-formatters/spec.md`

- [ ] 2.D.1 在 `src/cli/eval-server.ts` 的 `formatContextResult` 中添加 evidence_mode 输出
- [ ] 2.D.2 运行 `npx vitest run test/unit/eval-formatters.test.ts`
- [ ] 2.D.3 验证全部 30 用例通过

### 2.E scoped-cli-commands（2 回归）— `specs/mcp-setup-config/spec.md`

- [ ] 2.E.1 检查 `src/cli/setup.ts` 中 MCP manifest 和 guidance 文本生成逻辑
- [ ] 2.E.2 更新 manifest 生成以包含 `"args": ["mcp"]`
- [ ] 2.E.3 更新 guidance 文本以包含 `resolveAnalyzeNpxCommand`
- [ ] 2.E.4 运行 `npx vitest run test/unit/scoped-cli-commands.test.ts`
- [ ] 2.E.5 验证 2 用例通过

---

## 3. 收敛与验证

- [ ] 3.1 运行全部 5 个测试文件确认零回归
- [ ] 3.2 运行 `npx tsc --noEmit` 确认零编译错误
- [ ] 3.3 确认 spec-to-implementation 覆盖：5/5 capability 均有对应的修复验证

## 4. Writeback — merge-upstream-2026-05 task 4.3

- [ ] 4.1 更新 `openspec/changes/merge-upstream-2026-05/tasks.md` — 勾选 task 4.3 writeback
- [ ] 4.2 更新 `openspec/changes/merge-upstream-2026-05/verification.md` — 追加本 change 的测试修复结论
- [ ] 4.3 更新 `openspec/changes/merge-upstream-2026-05/writeback.md` — 更新回写状态为完成
- [ ] 4.4 更新 `gitnexus/README.md` — 能力表格（语言支持、CLI 命令）
- [ ] 4.5 检查 `gitnexus/AGENTS.md` 是否需要同步变更
