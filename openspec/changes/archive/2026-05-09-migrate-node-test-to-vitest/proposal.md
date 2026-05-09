# Proposal

## 问题定义

当前 GitNexus 仓库内存在**两种测试框架并存**的架构混乱：

1. **vitest** — 用于 `test/` 目录下的所有测试文件（已统一）
2. **node:test + node:assert/strict** — 用于 `src/` 子目录下的 **99 个测试文件**

关键矛盾在于：`vitest.config.ts` 的 `include` 模式已包含部分 `src/` 测试文件（如 `src/mcp/local/unity-*.test.ts`、`src/mcp/local/runtime-claim*.test.ts`），但这些文件实际使用 `node:test` + `node:assert/strict` API。vitest 对 node:test 的兼容层不完全代表一致行为，尤其在 `assert` 调用、异步处理、test timeout 等场景下产生不确定性。

此外，`src/benchmark/`、`src/cli/`、`src/core/` 下的大量 node:test 文件**完全不在 vitest 配置的 include 中**，意味着：
- 这些测试永远不会在 `npm test` 中执行
- 开发者可能在不知情的情况下破坏它们
- 合并上游或重构时没有自动化保护

根据 `AGENTS.md` 的强制要求，新测试必须使用 vitest API（`describe`、`it`、`expect`），**禁止使用** `node:test` + `node:assert/strict`。当前违反了这一规范。

## 范围边界

### 在范围内

- 将 `src/` 下所有使用 `import test from 'node:test'` 的测试文件迁移到 vitest API
- 将 `import assert from 'node:assert/strict'` 替换为 vitest 的 `expect()`
- 在 `vitest.config.ts` 的 `include` 中补充模式以覆盖所有迁移后的测试文件
- 验证迁移后测试通过或标记已知失败（不在此 change 中修复业务逻辑回归）
- 移除 `node:test` 和 `node:assert/strict` 的 import 残留

### 不在范围内

- 不修复迁移后暴露的业务逻辑测试失败（由后续 `fix-merge-upstream-regressions` 和 `complete-restore-local-backend-coverage` change 处理）
- 不修改 vitest workspace 结构（`lbug-db`、`default`、`cli-e2e` 三项目并行架构保持不变）
- 不新增测试用例、不修改测试断言语义
- 不调整 coverage 阈值或测试配置参数

## Capabilities

### New Capabilities

- `test-framework-migration`: 将 `src/` 下全部 node:test 测试文件迁移到 vitest API，在 `vitest.config.ts` 中补充 include 模式以覆盖所有迁移后的测试文件，消除双框架并存的架构混乱

### Modified Capabilities

（无。本次不修改既有能力，仅统一测试基础设施。）

## Capabilities 待确认项

- [x] 能力清单已确定：仅新增 `test-framework-migration` 一个 capability

## Impact

### 正面影响

- **测试框架统一**：全部测试使用 vitest，`npm test` 覆盖所有测试文件
- **自动化保护增强**：之前不被 include 的 benchmark/CLI/core 测试现在纳入 CI
- **开发体验改善**：不再需要记住哪些目录用哪个框架
- **符合 AGENTS.md 规范**：所有测试统一使用 `import { describe, it, expect } from 'vitest'`

### 风险

- 迁移量较大（~99 个文件），需保证 API 转换的正确性
- 部分 node:test 特性（如 `test.skip()`、`test.only()`、subtests）的语义在 vitest 中可能略有差异，需逐文件验证
- LadybugDB 相关测试文件在 `lbug-db` workspace 中以 `fileParallelism: false` 运行，迁移后需保持此配置

### 受影响方

- 所有在 `src/` 下编写测试的开发者
- CI pipeline：`npm test` 的测试数量将显著增加（新增 ~75 个未纳入统计的测试文件）
- 后续 change（`fix-merge-upstream-regressions`、`complete-restore-local-backend-coverage`）依赖统一的 vitest 基础设施

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 标准页：`repo://gitnexus`
  - 项目页：`gitnexus/vitest.config.ts`
  - 回写目标：`gitnexus/vitest.config.ts`、`gitnexus/AGENTS.md`
