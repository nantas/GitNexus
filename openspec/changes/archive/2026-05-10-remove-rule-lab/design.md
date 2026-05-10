# Design

## Context

rule-lab（规则实验室）和 gap-lab（缺口实验室）系统在 2026-04 架构回滚后已被宣布退役，但大量残留代码、配置、测试、skills 和文档未清除。核心问题 `applyUnityRuntimeBindingRules`（~550 行）因从未接入 pipeline 完全不可执行，同时带来维护负债和认知噪音。

本 change 的范围通过 proposal 和 3 个 spec 文件确定：
- `specs/mcp-local-backend/spec.md` — 移除 rule-lab 工具分派
- `specs/unity-runtime-process/spec.md` — 更新真理源文档
- `specs/cli-rule-lab/spec.md` — 删除 CLI 命令树

## Goals / Non-Goals

**Goals:**
- 删除 `src/rule-lab/`、`cli/rule-lab.ts`、`unity-runtime-binding-rules.ts` 全部源码
- 删除 12 个相关测试文件 + gap-lab fixture + benchmark
- 移除 5 个 `rule_lab_*` MCP 工具定义和 handler
- 更新 `runtime-claim-rule-registry.ts` 中 rule-lab 导入依赖
- 更新/删除 5 个 skill 文件（含 setup 安装源文件）
- 更新 7 个文档（真理源、架构决策、旧报告、config 文档等）
- 更新 `vitest.config.ts` 移除 rule-lab test include
- 更新 `mcp-local-backend/spec.md` 移除 rule-lab dispatch 要求
- 保持 `npx tsc --noEmit` 无编译错误、`npm test` 通过

**Non-Goals:**
- 不修改 graph-only verifier（`runtime-chain-verify.ts`）
- 不修改 Unity lifecycle 合成（`applyUnityLifecycleSyntheticCalls`）
- 不修改 Unity 资源扫描（`processUnityResources`、`unityScanPhase`）
- 不修改 `runtime-claim-rule-registry.ts` 中的 `RuntimeClaimRule` 类型和 `parseRuleYaml`（保留以支持 YAML 规则解析能力）

## Decisions

### D1: 删除 vs. 保留死代码

**决策**: 全部删除。`applyUnityRuntimeBindingRules`（~550 行）从未被调用，`src/rule-lab/`（16 文件）自 4 月回滚后无效。保留死代码产生的维护成本 > 删除风险。

**理由**:
- `applyUnityRuntimeBindingRules` 的调用点在 pipeline 中完全不存在（`grep` 确认无 import）
- `rule_lab_*` CLI 命令和 MCP 工具无已知外部依赖
- `rule-lab` 测试文件 ~12 个，占测试套件 ~5%，全部依赖已死功能

### D2: `runtime-claim-rule-registry.ts` 的清理边界

**决策**: 移除 `loadCompiledRuleBundle`/`UnityResourceBinding`/`LifecycleOverrides` 的 import，移除 `loadAnalyzeRules` 和 `loadRuleRegistry` 函数导出。保留 `RuntimeClaimRule` 类型、`parseRuleYaml` 函数和 `RuleRegistryLoadError` 类。

**理由**:
- `RuntimeClaimRule` 类型被 `runtime-chain-verify.ts` 通过 `type` import 引用（用于接口中的可选字段）
- `parseRuleYaml` 被 `runtime-claim-rule-registry.test.ts` 测试引用
- `loadRuleRegistry` 和 `loadAnalyzeRules` 的调用者（`discover.ts`、`promote.test.ts`、`compile.ts`）全部在删除范围内

### D3: `runtime-chain-verify.ts` 的清理边界

**决策**: 移除 `RuntimeClaimRule` 的 type import，将 `verifyRuleDrivenRuntimeChain` 函数和 `buildFailureRuntimeClaim` 中的 `RuntimeClaimRule` 依赖全部删除。

**理由**: 两个调用点（`local-backend.ts` 1447 和 2670 行）均不传 `rule` 参数，`verifyRuleDrivenRuntimeChain` 永不被触发。证明已在 pre-design 代码探索中确认。

### D4: 测试中 `writeCompiledRuleBundle` 的替换策略

**决策**: 不保留 `compiled-bundles.ts`。受影响的 2 个测试（`runtime-chain-verify-graph-only-input.test.ts` 和 `local-backend-runtime-claim-evidence-gate.test.ts`）改为直接从 `RuntimeClaimRule` 对象构建测试输入，不再写磁盘 bundle。

**理由**:
- `compiled-bundles.ts` 的唯一用途是 rule-lab compile 的产物读写
- 两个测试只是需要使用 `RuntimeClaimRule` 形状的数据，不需要 `writeCompiledRuleBundle` 函数
- 测试可以内联 bundle 数据或使用 `parseRuleYaml` 直接从 YAML 字符串解析

### D5: 删除顺序 — 源码优先、测试最后

**决策**: 按 7 批顺序执行（源码删除 → 引用修改 → 测试删除 → 测试修改 → benchmark 删除 → 配置更新 → 文档/skills）。删除文件前先清理所有 import 引用，避免编译断裂。

## Risks / Migration

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 遗漏 import 引用导致编译断裂 | 低 | 高 | 每批次后运行 `npx tsc --noEmit` |
| `runtime-chain-verify.ts` 中遗漏死码 | 低 | 低 | 删除后再次 grep 验证无残留 |
| MCP 客户端发送 `rule_lab_*` 工具调用 | 极低 | 低 | 移除工具定义后获得清晰的 `Unknown tool` 错误 |
| skill 删除后用户引用 | 低 | 低 | 在 release notes 中标注 |
| 回写 `mcp-local-backend/spec.md` 时机 | 低 | 中 | 最后一步执行，确保 spec 和代码状态一致 |
