# Design

## Context

`restore-local-backend-unity-features` 通过 adapter 模式恢复了 Unity context/query handler 和 pipeline DAG phases。但以下内容未恢复，形成 17 个测试回归：

1. **辅助函数**：`buildNextHops`、`pickVerifierSymbolAnchor`、`computeVerifierMinimumEvidenceSatisfied`、`filterBm25ResultsByScopePreset`、`rankExpandedSymbolsForQuery`
2. **Tool descriptions**：query/context 的 MCP tool description 缺少 Unity hydration 术语
3. **callTool wiring**：`LocalBackend.callTool` 的 switch/case 未处理 rule_lab 工具

## Goals / Non-Goals

**Goals:**
- 从 fork 历史 restore 或重写 5 个辅助函数，恢复 16 个测试用例
- 补充 query/context tool descriptions 中的 Unity hydration 术语，恢复 2 个测试用例
- 添加 rule_lab callTool wiring，恢复 1 个测试用例
- 全部 17 个测试用例通过

**Non-Goals:**
- 不修改 fork Unity 核心引擎模块
- 不新增 fork 中未有的功能
- 不修改已归档的 `restore-local-backend-unity-features` change artifacts

## Decisions

### D1: 辅助函数恢复策略 — 从 fork 历史 restore 后适配

每个函数：
1. 从 `nantas-dev` 分叉前的最后一个 commit 提取函数签名和实现
2. 检查上游 `local-backend.ts` 中是否已有等价或部分等价的实现
3. 如有等价实现，更新测试以引用新位置
4. 如无等价实现，将函数恢复为独立模块或 local-backend.ts 内函数
5. 确保适配上游的新 API 签名（parameterized queries 等）

### D2: Tool Descriptions — 在 tools.ts 中补充术语

**问题**: `mcp-tools.contract.test.ts` 期望 query/context description 包含 `strict`、`fallbackToCompact`、`policy-adjusted`。

**策略**: 在 `tools.ts` 的 `GITNEXUS_TOOLS` 数组中，为 `query` 和 `context` 工具的 description 字段补充 Unity hydration 相关段落。这些术语已存在于 fork 版本的 tool descriptions 中。

### D3: callTool Wiring — 补充 rule_lab case

**问题**: `rule-lab-tools.test.ts` 调用 `callTool('rule_lab_analyze', ...)` 时抛 `Unknown tool`。

**策略**: 在 `local-backend.ts` 的 `callTool` switch/case 中添加 rule_lab 工具的 case 分支。`rule_lab_analyze` 应映射到对应的 handler 方法。检查 `tools.ts` 中已注册的 rule_lab 工具名称，确保全部被处理。

## Risks / Migration

| 风险 | 缓解措施 |
|------|----------|
| `buildNextHops` 依赖的 retrieval rule infrastructure 可能已在上游合并中变更 | 先 grep 检查相关模块是否存在，如缺失则从 fork 历史恢复 |
| 辅助函数的内部 API 调用可能需要适配上游新签名 | 逐函数检查类型签名，确保 `npx tsc --noEmit` 通过 |
| Tool descriptions 太长可能导致 MCP client 展示截断 | 保持新增术语简洁，嵌入现有 description 结构而非追加长段落 |
