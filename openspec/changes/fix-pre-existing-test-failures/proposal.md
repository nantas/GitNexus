# Proposal

## 问题定义

在 `chore/merge-upstream-2026-05` 分支上存在 57 个 pre-existing 测试失败（去重后，乘以 3 个 vitest pool 实际为 ~171 个），分布在 20 个测试文件中。根因是 fork 与 upstream 的代码分歧——upstream 重构了 setup.ts（JSONC 写入、PATH 检测）、csv-generator（新增导出）、ai-context（模板更新）等模块，而 fork 的合并批次只保留了旧版本。

## 修复进展

### 已修复（37 个唯一失败 → 111 个 pool 级别）

| # | 测试文件 | 失败数 | 修复方式 |
|---|---------|--------|---------|
| 1 | test/unit/setup.test.ts | 11 | upstream setup.ts 合并 + mkdir 修复 |
| 2 | test/unit/setup-jsonc.test.ts | 17 | upstream mergeJsoncFile 移植 |
| 3 | test/unit/setup-codex.test.ts | 2 | setupCodex 代码路径对齐 |
| 4 | test/integration/setup-skills.test.ts | 3 | installSkillsTo _shared 复制 |
| 5 | src/cli/setup.test.ts | 1 | 包名 regex 放宽 |
| 6 | src/core/lbug/csv-generator.test.ts | 2 | export FileContentCache + toCodeElementCsvRow |
| 7 | test/unit/ai-context.test.ts | 1 | 模板内容断言更新（via upstream ai-context.ts）|

**关键实现决策：** 直接将 upstream 的 `setup.ts` 替换 fork 版本，然后添加 fork 特有的 `--agent`/`--scope`/`--cli-version`/`--cli-spec` 兼容层。这是最高效的方式，因为 upstream 已包含完整的 JSONC 写入功能（`mergeJsoncFile`、`setupClaudeCode` 写 `.claude.json` 等），而 fork 版本缺失这些。

### 剩余失败（20 个唯一 → ~60 个 pool 级别）

| # | 测试文件 | 失败数 | 错误摘要 | 预估根因 |
|---|---------|--------|---------|---------|
| 1 | test/integration/local-backend-calltool.test.ts | 5 | assertion 参数类型错误、process participation 返回 0、test function 嵌套、impact 返回空 | fork 的 local-backend.ts 与测试 API 不匹配，需深入分析 response shape |
| 2 | test/integration/cli-e2e.test.ts | 3 | `unknown command 'remove'`、expected 1 to be +0 | `remove` 子命令在 fork 中未注册到 CLI index.ts |
| 3 | src/cli/ai-context.test.ts | 2 | ENOENT 技能文件不存在、模板 regex 不匹配 | `installSkillsTo` 在临时目录无法找到技能源 |
| 4 | test/integration/resolvers/csharp.test.ts | 1 | `expected undefined to be defined` | C# 泛型方法类型参数推断未实现 |
| 5 | test/integration/parsing.test.ts | 1 | `expected false to be true` | GDScript `isNodeExported` 逻辑变更 |
| 6 | test/unit/repo-manager-alias.test.ts | 1 | `expected 'repo-a' to be 'neonspark-v1-subset'` | 别名注册返回值逻辑分歧 |
| 7 | test/integration/csharp-preproc-pipeline.test.ts | 1 | `[EditorOnly, RuntimeOnly]` should not include RuntimeOnly | csproj define 预处理分支过滤逻辑 |
| 8 | src/benchmark/io.test.ts | 1 | `.toMatch()` got object not string | `expect(fn).toThrow(/regex/)` 但抛出 Error 对象 |
| 9 | src/cli/benchmark-agent-safe-query-context.test.ts | 1 | `expected false to be truthy` | 契约文案断言与 tools.ts 不一致 |
| 10 | src/benchmark/agent-safe-query-context/subagent-live.test.ts | 1 | `.toMatch()` got object not string | 同 #8 |
| 11 | test/unit/scoped-cli-commands.test.ts | 1 | 模板缺少 `npx -y <resolved-spec>` | guidance 模板使用硬编码路径而非 npx fallback |
| 12 | src/benchmark/u2-e2e/config.test.ts | 1 | `.toMatch()` got object not string | 同 #8 |
| 13 | src/benchmark/agent-context/io.test.ts | 1 | `.toMatch()` got object not string | 同 #8 |

## 范围边界

| 边界 | 规则 |
|------|------|
| **包含** | 上述 20 个文件的所有失败修复 |
| **包含** | 生产代码适配（setup.ts 已做，其余需评估）|
| **排除** | 新增测试用例覆盖 |
| **排除** | 测试基础设施变更（timeout、pool 调整）— 见独立 change |
| **排除** | local-backend 大规模重构（风险高，建议独立 change）|

## Capabilities

### Modified Capabilities

- `cli-setup`: 从 upstream 合并完整 JSONC 写入功能，保留 fork 的 `--agent`/`--scope` 接口
- `cli-setup-test`: 修复 setup 相关 37 个测试断言
- `csv-generator-test`: 导出 FileContentCache 和 toCodeElementCsvRow

### Remaining Capabilities (需后续 change)

- `local-backend-test`: 需对齐 local-backend.ts API response shape
- `cli-remove`: 需注册 remove 子命令到 index.ts 或移除相关测试
- `benchmark-test`: 需统一 Error 对象 vs string 的 toMatch 模式
- `parser-test`: C# 泛型推断和 GDScript export 逻辑

## Impact

| 维度 | 影响 |
|------|------|
| **测试通过数** | 57 → 20 个唯一失败（65% 改善）|
| **生产代码** | setup.ts 大幅重写（upstream 合并）、csv-generator 小改 |
| **CI 流水线** | `npm test` 失败从 ~171 降至 ~60 |
| **风险** | 中。setup.ts 为完整替换，需验证所有 agent 路径 |

## 关联绑定

- 关联 binding: `binding.md`
- 关联 change: `fix-test-suite-timeout`（套件超时问题）
- 关联 change: `fix-extensions-param-pipeline`（extension filter 断裂）
