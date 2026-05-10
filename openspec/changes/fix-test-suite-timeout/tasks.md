# Tasks

## 1. 拆分 npm test 脚本（test-scripts-dev-ci-split）

- [ ] 1.1 `gitnexus/package.json`: 修改 `"test"` script 为 `"vitest run --project default"`；新增 `"test:all"` script 为 `"vitest run"`
- [ ] 1.2 运行 `npm test` 确认仅执行 default pool，输出显示 0 失败且 ~13 秒完成
- [ ] 1.3 运行 `npm run test:all` 确认全量测试仍可执行（允许超时，只要不是立即失败）
- [ ] 1.4 检查 `.github/` 和 CI 配置中引用 `npm test` 之处，标注需要迁移到 `npm run test:all`

## 2. 增大 timeout 配置（test-timeout-config）

- [ ] 2.1 `gitnexus/vitest.config.ts`: 将顶层 `hookTimeout` 由 120000 改为 300000
- [ ] 2.2 检查 lbug-db pool 是否需要独立的 `testTimeout`（当前已有的 `fileParallelism: false` + 顶层 30000 可能不够，但 lbug-db 池应继承顶层 testTimeout 或配置自定义值）
- [ ] 2.3 运行 `npm run test:all` 确认不再因 timeout 被 kill（允许因其他原因超时）

## 3. 最终验证

- [ ] 3.1 运行 `npm test` 确认 default pool 稳定通过
- [ ] 3.2 确认 `npm run test:all` 在 10 分钟内完成（或至少不因配置错误而立即失败）
- [ ] 3.3 运行 `npx tsc --noEmit` 确认无编译错误
- [ ] 3.4 提交 commit，信息为 `"fix: split npm test scripts and increase vitest timeouts to prevent CI timeout"`
