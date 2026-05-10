# Proposal

## 问题定义

GitNexus 的 rule-lab（规则实验室）和 gap-lab（缺口实验室）系统自 2026-04 架构回滚后已被宣布退役，但代码、测试、MCP 工具、CLI 命令、skills 和文档中仍有大量残留。同时，核心函数 `applyUnityRuntimeBindingRules`（Fork 独有，~550 行）因从未接入 pipeline 而完全无效。

残留代码造成的问题：
1. **安全隐患**：`applyUnityRuntimeBindingRules` 是一个 550 行、依赖 rule-lab `analyze_rules` 产物、但从未被调用的函数，属于静默死代码
2. **维护负债**：~12 个测试文件、6 个 CLI 子命令、5 个 MCP 工具全部需要维护但完全不可用
3. **认知噪音**：真理源文档中保留 Phase 5.7 描述和 rule-lab 工作流，但是这些路径从未被执行
4. **配置扰动**：三个 skill 文件被 install via setup，引导用户进入无效工作流

**目标**：彻底删除 rule-lab / gap-lab 相关所有代码、测试、CLI、MCP 工具、skills、文档，将 Unity runtime process 简化为可执行的三段链路（Phase 5.5 → 5.6 → 6）。

## 范围边界

### 在范围内（In Scope）

| 分类 | 具体内容 |
|------|---------|
| **源码** | `src/rule-lab/` 全部 16 文件、`src/cli/rule-lab.ts`、`src/core/ingestion/unity-runtime-binding-rules.ts` |
| **MCP 工具** | 5 个 `rule_lab_*` 工具定义 + handler |
| **测试** | ~12 个测试文件 + gap-lab fixture 目录 |
| **Benchmark** | Phase 5 rule-lab acceptance runner |
| **CLI** | `rule-lab` 命令树（6 子命令） |
| **Skills** | `gitnexus-unity-rule-gen` skill、`unity-rule-authoring-contract`、gap-lab 引用 |
| **文档** | 真理源中 Phase 5.7、§2.4、§2.5 等章节；`gap-lab-rule-lab-architecture.md`；旧报告 |
| **Spec** | `mcp-local-backend/spec.md` 中的 rule-lab dispatch 要求 |
| **配置** | `vitest.config.ts` 中 rule-lab test include |

### 不在范围内（Out of Scope）

| 分类 | 具体内容 |
|------|---------|
| **graph-only verifier** | `runtime-chain-verify.ts`、`runtime-chain-closure-evaluator.ts` 等 graph-only 检索链路保持不变 |
| **Unity lifecycle 合成** | `applyUnityLifecycleSyntheticCalls` 保持不变（已验证为正常接入） |
| **Unity 资源扫描** | `processUnityResources`、`unityScanPhase` 保持不变 |
| **Unity enrichment** | `unityEnrichPhase` 保持不变 |
| **scope-resolution** | Upstream 引入的 scope-resolution pipeline 保持不变 |
| **RTF/framework 行为** | `runtime-claim-rule-registry.ts` 中的 `RuntimeClaimRule` 类型和 `parseRuleYaml` — 保留以支持 YAML 规则解析能力（如未来有其他消费方） |

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `mcp-local-backend`: 移除 rule-lab 工具分派要求；清理 `local-backend.ts` 中 5 个 `rule_lab_*` handler、相关 imports 和 `loadAnalyzeRules` 调用
- `unity-runtime-process`: 更新 `docs/unity-runtime-process-source-of-truth.md`，移除所有 rule-lab/gap-lab 章节，将架构图简化为三段链路
- `cli-rule-lab`: 删除 `rule-lab` CLI 命令树（6 个子命令 + 编译命令）；从 `cli/index.ts` 移除 `attachRuleLabCommands` 注册

## Capabilities 待确认项

- [x] 无待确认项 — 范围已在 `binding.md` 和讨论中确认

## Impact

### 影响资产（35 项）

| 类型 | 数量 | 示例 |
|------|------|------|
| 源码文件删除 | ~19 | `src/rule-lab/` (16), `cli/rule-lab.ts`, `unity-runtime-binding-rules.ts` |
| 源码文件修改 | ~3 | `cli/index.ts`, `mcp/tools.ts`, `local-backend.ts` |
| 类型/import 清理 | ~2 | `runtime-claim-rule-registry.ts` (移除 rule-lab import), `runtime-chain-verify.ts` (移除死码) |
| 测试删除 | ~12 | `rule-lab-tools.test.ts`, `rule-lab-m1.test.ts`, `rule-lab-bindings.test.ts` |
| 测试修改 | ~5 | `runtime-chain-verify-graph-only-input.test.ts`, `local-backend-runtime-claim-evidence-gate.test.ts` |
| Benchmark 删除 | ~2 | `phase5-rule-lab-acceptance-runner.*` |
| Skills 删除/更新 | ~5 | `gitnexus-unity-rule-gen/`, `unity-rule-authoring-contract.md` |
| 文档删除/更新 | ~7 | `gap-lab-rule-lab-architecture.md`, 旧 reports, 真理源 |
| 配置修改 | ~1 | `vitest.config.ts` |
| Spec 更新 | ~1 | `mcp-local-backend/spec.md` |

### 风险

- **MCP 工具删除**：`rule_lab_*` 从 tools.ts 移除后，任何调用方会立即收到 `Unknown tool` 错误。当前无已知外部调用方。
- **CLI 命令删除**：`gitnexus rule-lab *` 命令移除后，任何脚本或文档引用会失败。建议在发布说明中标注。
- **测试套件**：删除后可减少 ~5% 的测试计数，但 2 个 `runtime-chain-verify` 测试需重写以移除 `writeCompiledRuleBundle` 依赖。

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：见 `binding.md`
