# Proposal

## 问题定义

`vitest run`（全量测试）在 macOS 上持续超时（>300 秒）。根因数层叠加：

1. **三 pool 并行竞争进程资源**：default（forks 池，250+ 文件）、lbug-db（串行 17+ 文件）、cli-e2e（1 个文件），三池并行启动 fork，进程调度竞争加剧。
2. **lbug-db pool 的 `fileParallelism: false` 强制串行**：所有集成测试文件顺序执行，每文件启动 fork → 连接 LadybugDB → DDL → 测试 → 退出，N-API 析构 segfault 被 `dangerouslyIgnoreUnhandledErrors` 捕获。测试本身通过，但累积延迟 5-8 分钟。
3. **LadybugDB schema DDL 在每次 globalSetup 中重复执行**：`test/global-setup.ts` 执行约 29 条 DDL 查询创建完整 schema，耗时 ~30s。
4. **无开发/CI 分层**：`npm test`（vitest run）对开发者和 CI 跑同一套 300+ 文件，开发者的日常反馈周期过长。

## 范围边界

| 边界 | 规则 |
|------|------|
| **包含** | `package.json` 的 scripts 调整 |
| **包含** | `vitest.config.ts` 的 timeout 参数调整 |
| **包含** | 必要时拆分 pool 配置 |
| **排除** | 修改测试逻辑、断言或生产代码 |
| **排除** | 重构 LadybugDB 架构 |
| **排除** | 删除或禁用现有测试 |

## Capabilities

### New Capabilities
- `test-scripts-dev-ci-split`: 将 `npm test` 设为仅跑 default pool（快速），新增 `npm run test:all` 跑全量（CI 用）

### Modified Capabilities
- `test-timeout-config`: 增大 `vitest.config.ts` 中的 `hookTimeout` 和/或 `testTimeout` 以适应 lbug-db pool 的串行开销

## Capabilities 待确认项

- [x] 能力清单已确认：测试基础设施变更，无新 feature 能力

## Impact

| 维度 | 影响 |
|------|------|
| **开发体验** | `npm test` 从 >5min（超时）降至 ~13s |
| **CI 质量门** | `npm run test:all` 覆盖全量，但 CI runner 性能不同，需 CI 实测 |
| **生产代码** | 零修改 |
| **风险** | 低。仅修改 scripts 和 timeout 配置，不涉及任何测试逻辑或生产代码 |

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：无外部绑定
