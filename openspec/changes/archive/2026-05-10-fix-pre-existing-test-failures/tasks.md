# Tasks

## Phase 1: Setup + CSV Generator（已完成 ✅）

- [x] 1.1 用 upstream `setup.ts` 替换 fork 版本，添加 `--agent`/`--scope`/`--cli-version`/`--cli-spec` 兼容层
- [x] 1.2 添加 `_shared` 目录复制到 `installSkillsTo`
- [x] 1.3 修改 `setupOpenCode` 支持 legacy `config.json` 检测
- [x] 1.4 修改 `upsertCodexConfigToml` 支持已有 section 替换
- [x] 1.5 修复 `src/cli/setup.test.ts` 集成测试：添加 `expectGitnexusCommand`/`expectGitnexusArgs` helper，放宽 regex
- [x] 1.6 修复 codex 测试：创建 `~/.codex` 目录使 `setupCodex` 检测到 Codex
- [x] 1.7 修复 `--cli-version` 测试：保存 `cliVersion` 字段，放宽 package spec regex
- [x] 1.8 `csv-generator.ts`: export `FileContentCache`，添加 `setForTest`/`hasForTest` 方法，新增 `toCodeElementCsvRow` 函数
- [x] 1.9 替换 `ai-context.ts` 为 upstream 版本
- [x] 1.10 运行验证：`npx vitest run test/unit/setup.test.ts test/unit/setup-jsonc.test.ts test/unit/setup-codex.test.ts test/integration/setup-skills.test.ts src/cli/setup.test.ts` → 171 passed
- [x] 1.11 Commit: `dc9f4dd4 fix: merge upstream setup.ts JSONC writes + fix 37 of 57 pre-existing test failures`

## Phase 2: 剩余 20 个失败

### 2.1 benchmark .toMatch() 模式修复（4 个文件，5 个失败）

- [ ] 2.1.1 `src/benchmark/io.test.ts`: 将 `expect(fn).toThrow(/regex/)` 改为 try/catch + `expect(error.message).toMatch(/regex/)`
- [ ] 2.1.2 `src/benchmark/agent-safe-query-context/subagent-live.test.ts`: 同上
- [ ] 2.1.3 `src/benchmark/u2-e2e/config.test.ts`: 同上
- [ ] 2.1.4 `src/benchmark/agent-context/io.test.ts`: 同上

### 2.2 cli-e2e remove 命令（1 个文件，3 个失败）

- [ ] 2.2.1 确认 `remove` 命令是否应存在于 fork：检查 upstream index.ts 注册方式
- [ ] 2.2.2 如果保留：在 fork 的 index.ts 中注册 remove 命令
- [ ] 2.2.3 如果移除：删除或 skip 这 3 个测试用例

### 2.3 local-backend-calltool（1 个文件，5 个失败）

- [ ] 2.3.1 逐个分析 5 个失败的 response shape 差异
- [ ] 2.3.2 确认是测试断言问题还是 API 行为变更
- [ ] 2.3.3 修改测试断言适配当前 API 行为（避免替换 local-backend.ts）

### 2.4 ai-context 深层修复（1 个文件，2 个失败）

- [ ] 2.4.1 修复 `installSkillsTo` 在临时目录中找不到技能源的问题
- [ ] 2.4.2 修复模板 regex：`/slim guidance is narrowing-first/` 与当前模板不匹配

### 2.5 解析器相关（3 个文件，3 个失败）

- [ ] 2.5.1 `test/integration/resolvers/csharp.test.ts`: C# 泛型方法类型参数推断 — 评估是否 skip
- [ ] 2.5.2 `test/integration/parsing.test.ts`: GDScript `isNodeExported` — 评估是否 skip
- [ ] 2.5.3 `test/integration/csharp-preproc-pipeline.test.ts`: csproj define 预处理分支过滤

### 2.6 其他（3 个文件，3 个失败）

- [ ] 2.6.1 `test/unit/repo-manager-alias.test.ts`: 别名注册返回值修复
- [ ] 2.6.2 `test/unit/scoped-cli-commands.test.ts`: guidance 模板 npx 格式修复
- [ ] 2.6.3 `src/cli/benchmark-agent-safe-query-context.test.ts`: 契约文案断言更新

### 2.7 最终验证

- [ ] 2.7.1 运行 `npx vitest run` 确认全套件通过（或记录剩余 known failures）
- [ ] 2.7.2 运行 `npx tsc --noEmit` 确认无编译错误
- [ ] 2.7.3 提交 commit
