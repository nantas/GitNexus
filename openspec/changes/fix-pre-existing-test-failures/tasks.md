# Tasks

## 1. 修复 setup 测试（test-setup）

- [ ] 1.1 `test/unit/setup.test.ts`: 修改所有 `setupCommand()` 调用为 `setupCommand({ agent: 'claude' })`；更新期望的 MCP 条目格式为 `{ command: 'gitnexus', args: ['mcp'] }`（非 Windows）或 `{ command: 'cmd', args: ['/c', 'gitnexus', 'mcp'] }`（Windows）
- [ ] 1.2 `test/unit/setup-jsonc.test.ts`: 修改所有 OpenCode 测试调用为 `setupCommand({ agent: 'opencode' })`，所有 Claude Code 测试为 `setupCommand({ agent: 'claude' })`；更新期望的 MCP 条目格式；更新 hooks 测试
- [ ] 1.3 `test/unit/setup-codex.test.ts`: 修改调用为 `setupCommand({ agent: 'codex' })`
- [ ] 1.4 运行 `npx vitest run test/unit/setup.test.ts test/unit/setup-jsonc.test.ts test/unit/setup-codex.test.ts` 验证全部通过

## 2. 修复 AI Context 测试（test-ai-context）

- [ ] 2.1 `test/unit/ai-context.test.ts`: 将 `"If any GitNexus tool warns the index is stale"` 断言替换为 `"gitnexus:start"`；将 `"## Always Do"` 和 `"## Never Do"` 断言替换为 `"## Always Start Here"` 和技能路由表断言；移除 `skipAgentsMd` 测试中对 skip 条目的依赖
- [ ] 2.2 `src/cli/ai-context.test.ts`: 将 `expect(agentsContent).toMatch(/~\/\.agents\/skills\/gitnexus\//)` 改为相对路径 `.agents/skills/gitnexus/`
- [ ] 2.3 运行 `npx vitest run test/unit/ai-context.test.ts src/cli/ai-context.test.ts` 验证全部通过

## 3. 修复 Benchmark Contract 测试（test-benchmark-context）

- [ ] 3.1 `src/cli/benchmark-agent-safe-query-context.test.ts`: 读取 `gitnexus/src/mcp/tools.ts` 当前内容，更新所有硬编码 JSDoc 字符串断言以匹配当前文案
- [ ] 3.2 运行 `npx vitest run src/cli/benchmark-agent-safe-query-context.test.ts` 验证通过

## 4. 修复 CSharp Preproc 测试（test-csharp-preproc）

- [ ] 4.1 `test/unit/parse-worker-csharp-preproc.test.ts`: 删除整个文件（`symbol-table.ts` 已被移除，无直接替代模块）
- [ ] 4.2 运行 `npx vitest run test/unit` 确认无该文件导致的 `ERR_MODULE_NOT_FOUND`

## 5. 修复 Repo Manager 测试（test-repo-manager）

- [ ] 5.1 `test/unit/repo-manager-alias.test.ts`: 确认 `GITNEXUS_HOME` 设置为临时路径后 `readRegistry()` 是否正确使用该路径；如有 registry fallback 逻辑干扰，修改测试在 `beforeAll` 中创建空 registry 或设置 `GITNEXUS_HOME` 路径
- [ ] 5.2 运行 `npx vitest run test/unit/repo-manager-alias.test.ts` 验证通过

## 6. 最终验证

- [ ] 6.1 运行 `npx vitest run --project default` 确认 default pool 零失败
- [ ] 6.2 运行 `npx tsc --noEmit` 确认无编译错误
- [ ] 6.3 提交 commit，信息为 `"fix: resolve 108 pre-existing test failures after upstream merge"`
