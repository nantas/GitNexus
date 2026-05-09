# Design

## Context

当前 `src/` 下有 99 个测试文件使用 `node:test` + `node:assert/strict`。其中部分文件已被 `vitest.config.ts` include 覆盖（`src/mcp/local/unity-*.test.ts`、`src/mcp/local/runtime-claim*.test.ts` 等），但大多数完全不被 vitest 发现。目标是将全部文件迁移到统一 vitest API，消除双框架并存。

## Goals / Non-Goals

**Goals:**
- 所有 `src/**/*.test.ts` 文件使用 `import { describe, it, expect } from 'vitest'`
- 零残留 `import test from 'node:test'` 和 `import assert from 'node:assert/strict'`
- vitest.config.ts 的 include 模式覆盖所有 `src/` 测试文件
- 迁移前后断言语义一致（失败的测试仍以相同原因失败）

**Non-Goals:**
- 不修复任何业务逻辑测试失败
- 不新增或删除测试用例
- 不修改 vitest workspace 结构
- 不调整 LadybugDB 测试的并行策略

## Decisions

### D1: 按目录分批迁移

迁移按以下目录批次执行，每批独立编译验证：

| 批次 | 目录 | 预估文件数 | 优先级 |
|------|------|-----------|--------|
| B1 | `src/mcp/local/*.test.ts` | ~12 | 最高 — 已在 vitest include 中但用错 API |
| B2 | `src/core/unity/*.test.ts` | ~18 | 高 — Unity 核心模块 |
| B3 | `src/core/ingestion/*.test.ts` + `src/core/lbug/*.test.ts` | ~9 | 中 — 管线/DB 模块 |
| B4 | `src/cli/*.test.ts` | ~16 | 中 — CLI 模块 |
| B5 | `src/benchmark/**/*.test.ts` | ~44 | 低 — benchmark 文件最多但风险最低 |

### D2: API 映射表

| node:test / node:assert | vitest 等价 |
|---|---|
| `import test from 'node:test'` | `import { describe, it } from 'vitest'` |
| `import assert from 'node:assert/strict'` | `expect()` (已包含在 vitest import) |
| `test('name', () => {})` | `it('name', () => {})` |
| `test.skip(...)` | `it.skip(...)` |
| `test.only(...)` | `it.only(...)` |
| `assert.strictEqual(a, b)` | `expect(a).toBe(b)` |
| `assert.equal(a, b)` | `expect(a).toBe(b)` |
| `assert.deepStrictEqual(a, b)` | `expect(a).toEqual(b)` |
| `assert.deepEqual(a, b)` | `expect(a).toEqual(b)` |
| `assert.ok(v)` / `assert(v)` | `expect(v).toBeTruthy()` |
| `assert.throws(() => fn())` | `expect(() => fn()).toThrow()` |
| `assert.rejects(p)` | `expect(p).rejects` |
| `assert.match(s, /re/)` | `expect(s).toMatch(/re/)` |
| `assert.ifError(err)` | `expect(err).toBeFalsy()` 或 `expect(err).toBeNull()` |
| `assert.fail(msg)` | `throw new Error(msg)` |
| `t.test('child', ...)` (subtest) | `it('child', ...)` 包裹在 `describe()` 内 |

### D3: vitest.config.ts include 策略

现有 include 模式保持不变，追加以下 glob 模式到顶层和 `default` workspace：
- `src/benchmark/**/*.test.ts`
- `src/cli/**/*.test.ts`
- `src/core/**/*.test.ts`
- `src/mcp/local/**/*.test.ts` (替代现有细粒度模式)

LadybugDB 相关的 src/ 测试文件（如 `src/core/lbug/`）保持在 `lbug-db` workspace。

### D4: Subtest 结构处理

node:test 的 subtest 模式：
```js
test('parent', async (t) => {
  await t.test('child', () => { assert.ok(true) })
})
```

转换为 vitest：
```js
describe('parent', () => {
  it('child', () => { expect(true).toBeTruthy() })
})
```

AI 辅助批量转换时，手动复查非平凡 subtest 结构（嵌套 > 2 层或含动态 test 生成）。

## Risks / Migration

| 风险 | 缓解措施 |
|------|----------|
| LadybugDB N-API 相关测试在 vitest forks 中 segfault | 已有 `dangerouslyIgnoreUnhandledErrors` 配置，保持 `fileParallelism: false` |
| 部分 node:test 的 `before`/`after` hook 语义与 vitest 不完全一致 | 逐文件检查 hook 行为；vitest 的 `beforeEach`/`afterEach` 默认行为与 node:test 一致 |
| 大量文件修改引入人为错误 | 每批做完立即运行 `npx vitest run <batch-pattern>` 验证，不积累到批次末尾 |
| Benchmark 测试依赖外部 fixture 文件 | 仅迁移 API，不修改 fixture 路径；验证时显式指定 fixture 路径 |
