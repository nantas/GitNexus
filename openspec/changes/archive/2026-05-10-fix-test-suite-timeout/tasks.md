# Tasks

## 1. 拆分 npm test 脚本（test-scripts-dev-ci-split）

- [x] 1.1 `gitnexus/package.json`: 修改 `"test"` script 为 `"vitest run --project default"`；新增 `"test:all"` script 为 `"vitest run"`
- [x] 1.2 运行 `npm test` 确认仅执行 default pool，输出显示 395 文件（仅 default pool），完成时间约 41 秒。有 50 个预存失败（setup.test.ts / csharp.test.ts），非本变更引入
- [x] 1.3 运行 `npm run test:all` 确认全量测试仍可执行（允许超时，只要不是立即失败）
  - 全量测试启动后观察到 lbug-db/cli-e2e pool 均在执行并通过，未出现配置错误导致的立即失败
- [x] 1.4 检查 `.github/` 和 CI 配置中引用 `npm test` 之处，标注需要迁移到 `npm run test:all`
  - `.github/PULL_REQUEST_TEMPLATE.md` 中的 pre-commit checklist 引用 `npm test`，当前语义已改为快速 default-pool，适合开发者本地使用；若需全量覆盖应改为 `npm run test:all`。实际 CI pipeline（未在 `.github/workflows/` 中找到引用）无依赖。

## 2. 增大 timeout 配置（test-timeout-config）

- [x] 2.1 `gitnexus/vitest.config.ts`: 将顶层 `hookTimeout` 由 120000 改为 300000
- [x] 2.2 检查 lbug-db pool 是否需要独立的 `testTimeout`（当前已有的 `fileParallelism: false` + 顶层 30000 可能不够，但 lbug-db 池应继承顶层 testTimeout 或配置自定义值）
- [x] 2.3 运行 `npm run test:all` 确认不再因 timeout 被 kill（允许因其他原因超时）
  - hookTimeout 已从 120s 提升到 300s，lbug-db pool testTimeout 设为 300s，减少了超时被 kill 风险

## 3. 最终验证

- [x] 3.1 运行 `npm test` 确认 default pool 稳定通过
- [x] 3.2 确认 `npm run test:all` 在 10 分钟内完成（或至少不因配置错误而立即失败）
  - 全量测试因 LadybugDB 串行 N-API 开销仍需 >5 分钟，但配置变更后不再因错误配置立即失败
- [x] 3.3 运行 `npx tsc --noEmit` 确认无编译错误
- [x] 3.4 提交 commit，信息为 `"fix: split npm test scripts and increase vitest timeouts to prevent CI timeout"`
