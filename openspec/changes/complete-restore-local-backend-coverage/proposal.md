# Proposal

## 问题定义

`restore-local-backend-unity-features` change 已归档完成（42/42 任务），通过 adapter 模式恢复了 `local-backend.ts` 的 Unity hydration/parity/Cypher workflow 功能，以及 `pipeline.ts` 的 Unity DAG phases。

但该 change 存在 **5 个交付缺口**，共 **17 个测试用例** 仍处于失败状态：

| 测试文件 | 失败数 | 根因 |
|----------|--------|------|
| `test/unit/local-backend-next-hops.test.ts` | 12 | `buildNextHops`、`pickVerifierSymbolAnchor`、`computeVerifierMinimumEvidenceSatisfied` 等辅助函数未恢复 |
| `test/unit/local-backend-query-noise.test.ts` | 3 | `filterBm25ResultsByScopePreset`、`rankExpandedSymbolsForQuery` 函数未恢复 |
| `test/unit/local-backend-runtime-claim-evidence-gate.test.ts` | 1 | `computeVerifierMinimumEvidenceSatisfied` 函数未恢复 |
| `test/unit/mcp-tools.contract.test.ts` | 2 | query/context tool description 缺少 `strict`、`fallbackToCompact`、`policy-adjusted` 等 Unity hydration 术语 |
| `test/unit/rule-lab-tools.test.ts` | 1 | `rule_lab_analyze` 在 `LocalBackend.callTool` dispatch 中未被识别 |

这些缺失的函数和描述属于 `restore-local-backend-unity-features` 的 scope（"将 fork 的 Unity hydration/parity/lazy/warmup/Cypher workflow 功能重新接入上游版 local-backend.ts"），但未在归档前的任务中覆盖。

## 范围边界

### 在范围内

- 从 fork 历史恢复 `buildNextHops`、`pickVerifierSymbolAnchor`、`computeVerifierMinimumEvidenceSatisfied`、`filterBm25ResultsByScopePreset`、`rankExpandedSymbolsForQuery` 等辅助函数
- 在 `tools.ts` 的 query/context tool descriptions 中补充 `strict`、`fallbackToCompact`、`policy-adjusted` 术语
- 在 `local-backend.ts` 的 `callTool` dispatch 中添加 `rule_lab_analyze` 等工具的 wiring
- 确保 5 个测试文件的 17 个用例全部通过

### 不在范围内

- 不修改 fork Unity 核心引擎模块的业务逻辑
- 不新增 fork 中未有的 Unity 功能
- 不处理 merge-upstream 遗留的 CLI 测试回归

## Capabilities

### Modified Capabilities

- `mcp-local-backend`: 恢复被上游删除的 Unity 辅助函数（buildNextHops、pickVerifierSymbolAnchor、computeVerifierMinimumEvidenceSatisfied、filterBm25ResultsByScopePreset、rankExpandedSymbolsForQuery），补全 rule_lab 工具 callTool dispatch wiring
- `mcp-tools`: 在 query 和 context 的 tool descriptions 中补充 `strict`、`fallbackToCompact`、`policy-adjusted` 等 Unity hydration 语义术语

## Capabilities 待确认项

- [x] 能力清单已确认：2 个 Modified Capability，修复 17 个回归

## Impact

### 正面影响

- `restore-local-backend-unity-features` 的交付完整收敛
- Unity runtime process 的辅助功能（next-hops 提示、查询噪声控制、evidence gate）完全恢复
- 开发者和 Agent 在 MCP 工具调用时可获取完整的 Unity hydration 语义描述

### 风险

- `buildNextHops` 等函数可能依赖上游已变更的内部 API，需要对 fork 版本做适配
- `computeVerifierMinimumEvidenceSatisfied` 的语义必须在 adapter 注入后的 local-backend 上下文中正确运行

### 受影响方

- 使用 Unity runtime process 功能的 MCP 客户端
- `restore-local-backend-unity-features` change 的归档记录（需要补充完整性声明）

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 标准页：`repo://gitnexus`
  - 项目页：`openspec/changes/restore-local-backend-unity-features/` (archived)
  - 回写目标：local-backend.ts、tools.ts、真理源文档
