# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 已确认 capability spec `cli-analyze-extension-filter` 的 5 个 requirement（extensions-cli-to-pipeline-chain ×3 scenarios，extensions-filter-at-scan-stage ×2 scenarios，interface-contract-unchanged ×2 scenarios）
- [x] 1.2 无外部依赖；所有修改均在 GitNexus 仓库内部完成

## 2. 核心实现任务

### 2.1 `filesystem-walker.ts` — 核心过滤逻辑

- [x] 2.1.1 在 `walkRepositoryPaths()` 函数签名中新增 `includeExtensions?: string[]` 可选参数
      - Spec: `interface-contract-unchanged` / `Scenario: existing-callers-unaffected`
      - Design: D1（过滤位置）/ D2（endsWith 匹配）/ D3（空列表语义）
- [x] 2.1.2 在 glob 结果与 batch stat 循环之间插入扩展名过滤：
      - 当 `includeExtensions` 为 `undefined` 或空数组 `[]` 时跳过过滤
      - 当 `includeExtensions` 有值时，用 `Array.filter(p => includeExtensions.some(ext => p.endsWith(ext)))` 过滤
      - Spec: `extensions-filter-at-scan-stage` / `Scenario: filter-before-batch-stat` + `Scenario: empty-extensions-list-no-filter`
      - Design: D1, D2, D3
- [x] 2.1.3 添加基于 `mktemp` 的纯内存测试覆盖（`filesystem-walker.test.ts`）：
      - 创建混合扩展名文件（`.cs`, `.ts`, `.js`, `.md`）
      - 断言 `includeExtensions: ['.cs']` 只返回 `.cs` 文件
      - 断言 `includeExtensions: ['.cs', '.ts']` 返回 `.cs` 和 `.ts` 文件
      - 断言 `includeExtensions: undefined` 返回全部文件
      - 断言 `includeExtensions: []` 返回全部文件
      - Spec: `interface-contract-unchanged` / `Scenario: test-for-extension-filtering`

### 2.2 `scan.ts` — Pipeline 消费端

- [x] 2.2.1 在 `scanPhase.execute()` 中，从 `ctx.options?.includeExtensions` 读取值，传递给 `walkRepositoryPaths()` 的第三个参数
      - Spec: `extensions-cli-to-pipeline-chain` / `Scenario: extensions-cli-flag-filters-scan` + `Scenario: no-extensions-flag-defaults-all`
      - Design: D1

### 2.3 `run-analyze.ts` — 桥接层

- [x] 2.3.1 在 `AnalyzeOptions` 接口中新增 `includeExtensions?: string[]` 字段，在 `csharpDefineCsproj` 之后
      - Spec: `extensions-cli-to-pipeline-chain`
      - Design: D4（接口兼容）
- [x] 2.3.2 在 `runPipelineFromRepo()` 调用中（~line 283）增加 `includeExtensions: options.includeExtensions`
      - Spec: `extensions-cli-to-pipeline-chain` / `Scenario: extensions-cli-flag-filters-scan`
      - Design: D4
- [x] 2.3.3 在 meta.json `analyzeOptions` 持久化对象中（~line 508）增加 `includeExtensions: options.includeExtensions`
      - Spec: `extensions-cli-to-pipeline-chain` / `Scenario: reuse-options-persists-extensions`

### 2.4 `analyze.ts` — CLI 入口

- [x] 2.4.1 在 `runFullAnalysis()` 调用处（~line 421-440）增加 `includeExtensions: effective.includeExtensions`
      - Spec: `extensions-cli-to-pipeline-chain` / `Scenario: extensions-cli-flag-filters-scan`
      - Design: D4

## 3. 收敛与验证准备

- [x] 3.1 验证检查点清单：
      - `npm test` 全部通过，测试总数增加（新加的过滤测试用例）
      - `npx tsc --noEmit` 无类型错误
      - `walkRepositoryPaths` 过滤测试覆盖 4 种场景（`.cs`, `.cs+.ts`, `undefined`, `[]`）
- [x] 3.2 回写摘要：实施完成后在 `verification.md` 中记录修复链路状态

## 4. 验证与回写收敛

- [x] 4.1 基于实现结果生成 `verification.md`，逐条确认 spec requirement 实现情况
- [x] 4.2 基于 verification.md 生成 `writeback.md`
- [x] 4.3 执行回写：创建 changelog 文档 `docs/changelog/extensions-param-fix.md`
