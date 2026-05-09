# Tasks

## 1. Spec 覆盖与实现准备

- [ ] 1.1 确认 `specs/test-framework-migration/spec.md` 的 6 个 ADDED requirement 均在本 task 中覆盖
- [ ] 1.2 运行 `npm run build && npx tsc --noEmit` 确认基线零编译错误
- [ ] 1.3 统计当前 `npm test` 的测试数量作为基线值

---

## 2. 核心实现任务

### Batch 1: src/mcp/local（最高优先级 — 已在 vitest include 但 API 错误）

- [ ] 2.1.1 列出 `src/mcp/local/*.test.ts` 中使用 `node:test` + `node:assert/strict` 的文件
- [ ] 2.1.2 逐文件迁移 import 语句、test()→it()、assert→expect()
- [ ] 2.1.3 处理 subtest 结构（`t.test()` → `describe()` + `it()`）
- [ ] 2.1.4 运行迁移后测试，确认无 import 错误，记录通过/失败分项
- [ ] 2.1.5 验证 `npx tsc --noEmit` 零错误

### Batch 2: src/core/unity

- [ ] 2.2.1 列出 `src/core/unity/*.test.ts` 中使用 `node:test` + `node:assert/strict` 的文件
- [ ] 2.2.2 逐文件迁移到 vitest API
- [ ] 2.2.3 运行迁移后测试，记录通过/失败
- [ ] 2.2.4 验证 `npx tsc --noEmit` 零错误

### Batch 3: src/core/ingestion + src/core/lbug

- [ ] 2.3.1 列出 `src/core/ingestion/*.test.ts` + `src/core/lbug/*.test.ts` 中使用 `node:test` 的文件
- [ ] 2.3.2 逐文件迁移到 vitest API
- [ ] 2.3.3 运行迁移后测试，记录通过/失败
- [ ] 2.3.4 验证 `npx tsc --noEmit` 零错误

### Batch 4: src/cli

- [ ] 2.4.1 列出 `src/cli/*.test.ts` 中使用 `node:test` + `node:assert/strict` 的文件
- [ ] 2.4.2 逐文件迁移到 vitest API
- [ ] 2.4.3 运行迁移后测试，记录通过/失败
- [ ] 2.4.4 验证 `npx tsc --noEmit` 零错误

### Batch 5: src/benchmark（文件最多，批量处理）

- [ ] 2.5.1 列出 `src/benchmark/**/*.test.ts` 中使用 `node:test` + `node:assert/strict` 的文件
- [ ] 2.5.2 逐文件迁移到 vitest API（允许批量 sed 处理简单替换，手动复查）
- [ ] 2.5.3 运行迁移后测试，记录通过/失败
- [ ] 2.5.4 验证 `npx tsc --noEmit` 零错误

### Vitest Config 更新

- [ ] 2.6.1 在 `vitest.config.ts` 顶层 `include` 中添加：`src/benchmark/**/*.test.ts`、`src/cli/**/*.test.ts`、`src/core/**/*.test.ts`
- [ ] 2.6.2 合并 `src/mcp/local` 的现有细粒度模式为 `src/mcp/local/**/*.test.ts`
- [ ] 2.6.3 确保 `lbug-db` workspace 包含 `src/core/lbug/**/*.test.ts`（`fileParallelism: false`）
- [ ] 2.6.4 运行 `npm test` 确认测试发现数量相比基线显著增加

### 最终清理

- [ ] 2.7.1 验证 `grep -r "node:test" --include="*.test.ts" src/` 零匹配
- [ ] 2.7.2 验证 `grep -r "node:assert" --include="*.test.ts" src/` 零匹配
- [ ] 2.7.3 验证 `npx tsc --noEmit` 零编译错误
- [ ] 2.7.4 运行 `npm test`，确认整体测试数量增加（新增 ~75 个此前未被 include 的测试）

---

## 3. 收敛与验证准备

- [ ] 3.1 汇总全部批次的迁移前/后测试对比数据
- [ ] 3.2 标记迁移后测试通过/失败分类（失败不在此 change 修复）
- [ ] 3.3 确认 spec-to-implementation 覆盖表：6 个 requirement 全部满足

## 4. 验证与回写收敛

- [ ] 4.1 基于真实实现结果生成 verification.md（覆盖 spec-to-implementation 与 task-to-evidence）
- [ ] 4.2 基于 verification.md 结论生成 writeback.md
- [ ] 4.3 执行 writeback：更新 `vitest.config.ts` 和 `AGENTS.md`
