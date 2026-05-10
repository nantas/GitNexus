# Design

## Context

当前 `npm test` 运行 `vitest run`，启动全部三个 pool：default、lbug-db、cli-e2e。每个 pool 在自己的 fork 池中运行，但 lbug-db pool 因 `fileParallelism: false` 串行化执行全部集成测试文件。在 macOS 上因 N-API 调度竞争和 LadybugDB schema DDL 开销，全量测试稳定超时 300 秒以上。

## Goals / Non-Goals

**Goals:**
- 开发者 `npm test` 在 macOS 上 < 60 秒完成
- CI 仍有途径运行全量测试
- 不再因 timeout 被 kill（提高 hook/test timeout 阈值）

**Non-Goals:**
- 不优化 LadybugDB 测试执行速度（这是另一个问题）
- 不改动 pool 的串行/并行策略
- 不修改 CI 配置文件（CI 配置不在本 change 范围）

## Decisions

### 决策 1：拆分 `npm test` 为 default-pool-only

**方案**：
```diff
- "test": "vitest run",
+ "test": "vitest run --project default",
+ "test:all": "vitest run",
```

**理由**：
- 最小侵入，6 个字符改动
- 保持 `vitest run`（`test:all`）可用，CI 无感知
- 开发者获得 ~13s 的快速反馈周期

### 决策 2：增大 timeout 配置

**方案**：
- `testTimeout`：30000 不变（default pool 快速杀 hung 测试）
- `hookTimeout`：120000 → 300000（为 LadybugDB schema DDL 提供足够时间）
- lbug-db pool 的 `testTimeout`：可配置 timeouts per-project（vitest 支持）

**理由**：
- 当前 hookTimeout 120s 在 macOS 上 n-API 竞争下可能不够（globalSetup 的 DDL + FTS 安装可能 > 30s，但 fork 的生命终止和 restart 累积可能导致超时）
- 300s 是一个安全的阈值，即使 CI runner 较慢也不会误杀

## Risks / Migration

| 风险 | 级别 | 说明 |
|------|------|------|
| CI 引用 `npm test` 期望全量 | 中 | 如果 CI 使用 `npm test` 而非 `npm run test:all`，会丢失集成测试覆盖。需通知 CI 维护者或在本 change 中包含 CI 配置更新 |
| `test:all` 在 CI 上仍可能超时 | 中 | CI runner 可能比开发者笔记本更快，但不保证。后续可优化 lbug-db pool 的分组策略 |
