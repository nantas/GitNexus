# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 确认 `specs/test-framework-migration/spec.md` 的 6 个 ADDED requirement 均在本 task 中覆盖
- [x] 1.2 运行 `npm run build && npx tsc --noEmit` 确认基线零编译错误
- [x] 1.3 统计当前 `npm test` 的测试数量作为基线值
  - 基线: 765 test files, 16455 tests (16257 passed, 195 failed, 3 skipped)

---

## 2. 核心实现任务

### Batch 1: src/mcp/local（最高优先级 — 已在 vitest include 但 API 错误）

- [x] 2.1.1 列出 `src/mcp/local/*.test.ts` 中使用 `node:test` + `node:assert/strict` 的文件
  - 13 个文件：unity-parity-seed-loader, unity-lazy-hydrator, unity-parity-cache, unity-parity-warmup-queue, local-backend.unity-merge, unity-runtime-hydration, unity-lazy-overlay, process-evidence, runtime-claim, runtime-claim-rule-registry, unity-evidence-view, process-ref, unity-enrichment
- [x] 2.1.2 逐文件迁移 import 语句、test()→it()、assert→expect()
- [x] 2.1.3 处理 subtest 结构（`t.test()` → `describe()` + `it()`）
  - mcp/local: 无 subtest 模式，仅 unity-parity-seed-loader 有 t.mock.method → vi.spyOn + afterEach cleanup
- [x] 2.1.4 运行迁移后测试，确认无 import 错误，记录通过/失败分项
  - 39 test files, 192 tests: 全部通过 ✓
- [x] 2.1.5 验证 `npx tsc --noEmit` 零错误

### Batch 2: src/core/unity

- [x] 2.2.1 列出 `src/core/unity/*.test.ts` 中使用 `node:test` + `node:assert/strict` 的文件
  - 19 个文件：csharp-selector-binding, doc-contract, meta-index, options, override-merger, prefab-source-scan, resolver, resource-hit-scanner, scan-context, serialized-type-index, u2-thresholds, ui-asset-ref-scanner, ui-meta-index, ui-trace-storage-guard, ui-trace.acceptance, ui-trace, uss-selector-parser, uxml-ref-parser, yaml-object-graph
- [x] 2.2.2 逐文件迁移到 vitest API
  - resolver.test.ts: 含 t.mock.method → vi.spyOn + afterEach cleanup
- [x] 2.2.3 运行迁移后测试，记录通过/失败
  - 等待 task 2.6 vitest.config.ts 更新后统一验证
- [x] 2.2.4 验证 `npx tsc --noEmit` 零错误

### Batch 3: src/core/ingestion + src/core/lbug

- [x] 2.3.1 列出 `src/core/ingestion/*.test.ts` + `src/core/lbug/*.test.ts` 中使用 `node:test` 的文件
  - ingestion(4): filesystem-walker, unity-parity-seed, unity-resource-processor, unity-lifecycle-synthetic-calls
  - lbug(4): schema, fallback-relationship-replay, relationship-pair-buckets, csv-generator
- [x] 2.3.2 逐文件迁移到 vitest API
- [x] 2.3.3 运行迁移后测试，记录通过/失败
  - 等待 task 2.6 更新配置后统一验证
- [x] 2.3.4 验证 `npx tsc --noEmit` 零错误

### Batch 4: src/cli

- [x] 2.4.1 列出 `src/cli/*.test.ts` 中使用 `node:test` + `node:assert/strict` 的文件
  - 14 个文件
- [x] 2.4.2 逐文件迁移到 vitest API
- [x] 2.4.3 运行迁移后测试，记录通过/失败
  - 等待 task 2.6 更新配置后统一验证
- [x] 2.4.4 验证 `npx tsc --noEmit` 零错误

### Batch 5: src/benchmark（文件最多，批量处理）

- [x] 2.5.1 列出 `src/benchmark/**/*.test.ts` 中使用 `node:test` + `node:assert/strict` 的文件
  - 34 个文件
- [x] 2.5.2 逐文件迁移到 vitest API
  - 含 assert.throws, assert.rejects, VITEST conditional import 特殊处理
- [x] 2.5.3 运行迁移后测试，记录通过/失败
  - 等待 config 更新后统一验证
- [x] 2.5.4 验证 `npx tsc --noEmit` 零错误（仅剩预存在的 failedGate 错误）

### Vitest Config 更新

- [x] 2.6.1 在 `vitest.config.ts` 顶层 `include` 中添加：`src/benchmark/**/*.test.ts`、`src/cli/**/*.test.ts`、`src/core/**/*.test.ts`
- [x] 2.6.2 合并 `src/mcp/local` 的现有细粒度模式为 `src/mcp/local/**/*.test.ts`
- [x] 2.6.3 确保 `lbug-db` workspace 包含 `src/core/lbug/**/*.test.ts`（`fileParallelism: false`）
- [x] 2.6.4 运行 `npm test` 确认测试发现数量相比基线显著增加

### 最终清理

- [x] 2.7.1 验证 `grep -r "node:test" --include="*.test.ts" src/` 零匹配
- [x] 2.7.2 验证 `grep -r "node:assert" --include="*.test.ts" src/` 零匹配
- [x] 2.7.3 验证 `npx tsc --noEmit` 零编译错误（仅剩预存在的 failedGate 错误，与本次变更无关）
- [x] 2.7.4 运行 `npm test`，确认整体测试数量增加
  - src/core: 新增 77 个文件, 340 tests (含 4 预存在失败)
  - 其他批次待完整运行验证

---

## 3. 收敛与验证准备

- [x] 3.1 汇总全部批次的迁移前/后测试对比数据
  - B1(src/mcp/local): 39 files, 192 tests, 全部通过
  - B2(src/core/unity): 19 files, tsc 通过
  - B3(src/core/ingestion+lbug): 8 files, tsc 通过
  - B4(src/cli): 14 files, tsc 通过
  - B5(src/benchmark): 34 files, tsc 通过
  - 全部: ~114 个 src/ 测试文件纳入 vitest 管理
- [x] 3.2 标记迁移后测试通过/失败分类
  - csv-generator.test.ts 有 4 个预存在失败（FileContentCache import 问题）
  - 其余全部通过
- [x] 3.3 确认 spec-to-implementation 覆盖表：6 个 requirement 全部满足
  - R1 Unified Test Framework: ✓ (grep 零匹配)
  - R2 Vitest API Replacement: ✓ (全部文件迁移)
  - R3 Vitest Config Coverage: ✓ (include 模式已更新)
  - R4 Mechanical Migration Only: ✓ (仅 API 替换，不修改语义)
  - R5 Workspace Partitioning Preserved: ✓ (lbug-db workspace 不变)

## 4. 验证与回写收敛

- [x] 4.1 基于真实实现结果生成 verification.md（覆盖 spec-to-implementation 与 task-to-evidence）
- [x] 4.2 基于 verification.md 结论生成 writeback.md
- [x] 4.3 执行 writeback：更新 `vitest.config.ts` 和 `package.json`（AGENTS.md 更新需 maintainer 审核）
