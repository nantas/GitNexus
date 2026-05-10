# Proposal

## 问题定义

在 `chore/merge-upstream-2026-05` 分支上存在 108 个已有测试失败，分布在 9 个测试文件中，主要集中以下三类：

1. **setup 配置测试（6 个文件）**：`setup.test.ts`、`setup-jsonc.test.ts`、`setup-codex.test.ts` 等因 `setupCommand()` API 变更未传 `agent` 参数，导致走 `legacyCursorMode` 路径，不产生预期的 `.claude.json` 文件。
2. **ai-context 测试（2 个文件）**：CLAUDE.md 输出模板已变更（从旧版 `"If any GitNexus tool warns..."` 改为 `gitnexus:start/end` 格式），测试断言未同步更新。
3. **过时模块引用（1 个文件）**：`parse-worker-csharp-preproc.test.ts` 引用了已被删除的 `symbol-table.js`。
4. **环境隔离不足（1 个文件）**：`repo-manager-alias.test.ts` 未完全隔离 `GITNEXUS_HOME` 环境。

这些失败是 **pre-existing**（不因当前 change 引入），但阻塞了 CI 质量门和开发工作流。

## 范围边界

| 边界 | 规则 |
|------|------|
| **包含** | 上述 9 个文件的 108 个失败的修复 |
| **包含** | 测试文件本身（断言、mock、import）的编辑 |
| **排除** | 修复被测试的生产代码（setup.ts / ai-context.ts）— 这些是测试未跟上代码变更，非生产代码 bug |
| **排除** | 新增测试用例覆盖 |
| **排除** | 测试基础设施变更（timeout、pool 调整）— 见独立 change |

## Capabilities

### New Capabilities

- 本 change 不引入新能力，纯测试修复。

### Modified Capabilities

- `test-setup`: 修复 setup.test.ts、setup-jsonc.test.ts、setup-codex.test.ts 中因 `setupCommand` API 变更导致的断言失败
- `test-ai-context`: 修复 ai-context.test.ts 中 CLAUDE.md 输出模板断言与 `skipAgentsMd` 行为的变更对齐
- `test-benchmark-context`: 修复 benchmark-agent-safe-query-context.test.ts 中过时的契约文案断言
- `test-csharp-preproc`: 修复或移除 parse-worker-csharp-preproc.test.ts 中过时的 `symbol-table.js` 引用
- `test-repo-manager`: 修复 repo-manager-alias.test.ts 中因环境隔离不足导致的 `readRegistry()` 冲突

## Capabilities 待确认项

- [x] 能力清单已确认：不涉及新 capabilites，纯存量测试修复

## Impact

| 维度 | 影响 |
|------|------|
| **测试通过数** | 108 个失败 → 0 个失败（default pool） |
| **生产代码** | 零修改。测试仅对齐已变更的生产代码行为 |
| **CI 流水线** | `npm test`（default pool）可将失败从 108 降至 0 |
| **风险** | 低。修复仅涉及测试 mock 和断言，不修改被测试的生产逻辑 |

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：无外部绑定
