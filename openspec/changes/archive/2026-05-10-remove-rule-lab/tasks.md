# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 确认每个 capability spec 的实现范围与边界
  - spec: `mcp-local-backend` — 移除 rule-lab 工具分派 + handler
  - spec: `unity-runtime-process` — 更新真理源文档
  - spec: `cli-rule-lab` — 删除 CLI 命令树
- [x] 1.2 确认依赖前置条件：无外部协作项，全在单仓库内

## 2. 核心实现任务

### 批次 1: 删除核心 rule-lab 源码（设计 D1）

- [x] 2.1 删除 `gitnexus/src/rule-lab/` 整个目录（16 文件）
  - 验证: `rm -rf` 后 `grep -r "from.*rule-lab" src/` 结果仅剩被修改文件
- [x] 2.2 删除 `gitnexus/src/cli/rule-lab.ts`
  - 验证: `test -f` 返回 false
- [x] 2.3 删除 `gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts`
  - 验证: `test -f` 返回 false

### 批次 2: 修改引用代码（设计 D2, D3, D5）

- [x] 2.4 修改 `gitnexus/src/cli/index.ts` — 移除 `attachRuleLabCommands` import 和调用，移除 `ruleLabAnalyzeCommand` 等 handler 名从 lazy factory 映射
  - 验证: `npx tsc --noEmit` 无错误
- [x] 2.5 修改 `gitnexus/src/mcp/tools.ts` — 移除 5 个 `rule_lab_*` 工具定义（`rule_lab_analyze`、`rule_lab_review_pack`、`rule_lab_curate`、`rule_lab_promote`、`rule_lab_regress`）
  - 验证: `grep "rule_lab_" src/mcp/tools.ts` 结果为空
- [x] 2.6 修改 `gitnexus/src/mcp/local/local-backend.ts` — 移除 5 个 rule-lab imports，移除 6 个 `case 'rule_lab_*'` handler 分支（含 handler 方法体），移除 `loadAnalyzeRules` 调用（如在 `enrichWithUnityEvidence` 或 `attachUnityContext` 中）
  - 验证: `grep "rule_lab\|rule-lab" src/mcp/local/local-backend.ts` 结果为空；`npx tsc --noEmit` 无错误
- [x] 2.7 修改 `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts` — 移除 `loadCompiledRuleBundle` import、`UnityResourceBinding`/`LifecycleOverrides` type import；移除 `loadAnalyzeRules` 函数定义、`loadRuleRegistry` 函数定义（及其引用的 `RuntimeClaimRuleRegistry` 类）；保留 `RuntimeClaimRule` type、`parseRuleYaml` 函数、`RuleRegistryLoadError` 类
  - 验证: `npx tsc --noEmit` 无错误
- [x] 2.8 修改 `gitnexus/src/mcp/local/runtime-chain-verify.ts` — 移除 `RuntimeClaimRule` type import（第 5 行）；移除 `verifyRuleDrivenRuntimeChain` 函数定义；简化 `buildFailureRuntimeClaim` 移除 `RuntimeClaimRule` 参数依赖
  - 验证: `npx tsc --noEmit` 无错误；`grep "RuntimeClaimRule\|verifyRuleDrivenRuntimeChain"` 结果为空

### 批次 3: 删除测试文件（设计 D1, D5）

- [x] 2.9 删除 `gitnexus/src/rule-lab/*.test.ts`（随批次 1 自动处理）
- [x] 2.10 删除 `gitnexus/src/cli/rule-lab.test.ts`
- [x] 2.11 删除 `gitnexus/test/unit/rule-lab-tools.test.ts`
- [x] 2.12 删除 `gitnexus/test/unit/rule-lab-m1.test.ts`
- [x] 2.13 删除 `gitnexus/test/unit/rule-lab-bindings.test.ts`
- [x] 2.14 删除 `gitnexus/test/integration/rule-lab-contracts.test.ts`
- [x] 2.15 删除 `gitnexus/test/integration/no-gap-lab-surface.test.ts`
- [x] 2.16 删除 `gitnexus/test/fixtures/gap-lab-exhaustive/` 目录
- [x] 2.17 删除 `gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts`
- [x] 2.18 删除 `gitnexus/src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.test.ts`

### 批次 4: 修改受影响的测试（设计 D4）

- [x] 2.19 修改 `gitnexus/test/unit/runtime-chain-verify-graph-only-input.test.ts` — 移除 `writeCompiledRuleBundle` import 和调用；移除 `<tmpdir>/runtime-chain-graph-only-input-` temporary directory setup/teardown；改为直接使用内联 `RuntimeClaimRule` 对象或 `parseRuleYaml` 构建输入
  - 验证: `npx tsc --noEmit` 无错误；测试语义仍覆盖 graph-only closure path
- [x] 2.20 修改 `gitnexus/test/unit/local-backend-runtime-claim-evidence-gate.test.ts` — 移除 `writeCompiledRuleBundle` import 和调用；移除所有 `.gitnexus/rules/compiled/` 文件写入操作；保持 evidence gate 逻辑测试不变
  - 验证: `npx tsc --noEmit` 无错误
- [x] 2.21 修改 `gitnexus/test/integration/local-backend-calltool.test.ts` — 移除 phase5 rule-lab promoted rule is loadable/test 用例
  - 验证: `npx tsc --noEmit` 无错误
- [x] 2.22 修改 `gitnexus/test/integration/unity-rule-authoring-skill-contracts.test.ts` — 移除 gap-lab surface 断言；简化测试或删除（技能文件存在性检查已无意义）
  - 验证: 测试通过或确认删除
- [x] 2.23 修改 `gitnexus/test/unit/tools.test.ts` — 移除 `rule_lab_analyze`、`rule_lab_review_pack`、`rule_lab_curate`、`rule_lab_promote`、`rule_lab_regress` 工具名检查
  - 验证: `npx vitest run test/unit/tools.test.ts` 通过
- [x] 2.24 修改 `gitnexus/src/mcp/local/runtime-claim-rule-registry.test.ts` — 移除 `loadRuleRegistry` 相关测试用例；保留 `parseRuleYaml` 测试
  - 验证: `npx vitest run src/mcp/local/runtime-claim-rule-registry.test.ts` 通过

### 批次 5: 更新配置

- [x] 2.25 修改 `gitnexus/vitest.config.ts` — 移除 `src/cli/rule-lab.test.ts` 和 `src/rule-lab/**/*.test.ts` 的 include 条目
  - 验证: `npm test` 运行且测试数量比修改前减少（删除文件数量匹配）

### 批次 6: 更新文档

- [x] 2.26 更新 `docs/unity-runtime-process-source-of-truth.md`:
  - 移除 §2.1 中 Phase 5.7 (`applyUnityRuntimeBindingRules`)
  - 移除 §2.4 (Phase 5 Offline Rule Lab) 整节
  - 移除 §2.5 (Rule Authoring Boundary) 整节
  - 移除 §4.4 (Phase 5 Offline Rule Lab Contract) 整节
  - 移除 §5 中 rule-lab 相关配置参数（`enableContainerNodes`、`payloadMode`、`parityWarmup`、`parityWarmupMaxParallel`）
  - 移除 §7 (V2 Migration Writeback) 中 rule-lab 相关条目
  - 移除 §8 (Rule Lab Boundaries) 整节
  - 统一将 §2.1 改为"三段链路"：Phase 5.5 → Phase 5.6 (rename) → Phase 6
  - 验证: 全文 `grep -i "rule-lab\|rule_lab\|gap-lab\|gap_lab\|compile\|analyze_rules"` 结果为空
- [x] 2.27 删除 `docs/gap-lab-rule-lab-architecture.md`
  - 验证: `test -f` 返回 false
- [x] 2.28 更新 `docs/gitnexus-config-files.md` — 移除 Historical `.gitnexus/gap-lab/runs/**` 引用
- [x] 2.29 更新 `docs/event-delegate-gap-analysis.md` — 移除 gap-lab 引用（第 1, 3 点）
- [x] 2.30 删除 `docs/reports/2026-04-11-gap-lab-neonspark-run-repair-checklist.md`
- [x] 2.31 删除 `docs/reports/2026-04-12-neonspark-mirror-syncvar-hook-gap-rule-rerun-issues.md`

### 批次 7: 更新 skills 和 AGENTS.md

- [x] 2.32 删除 `.agents/skills/gitnexus/gitnexus-unity-rule-gen/` 目录
  - 验证: `test -d` 返回 false
- [x] 2.33 删除 `.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md`
- [x] 2.34 更新 `.agents/skills/gitnexus/gitnexus-unity-e2e-verify/SKILL.md` — 移除 rule-lab compile、discover 步骤
- [x] 2.35 删除 `gitnexus/skills/gitnexus-unity-rule-gen.md`（setup 安装源文件）
- [x] 2.36 删除 `gitnexus/skills/_shared/unity-rule-authoring-contract.md`（setup 安装源文件）
- [x] 2.37 更新 `gitnexus/skills/gitnexus-unity-e2e-verify.md`（setup 安装源文件） — 移除 rule-lab 引用
- [x] 2.38 更新 `AGENTS.md` — 移除 setup 安装内容索引中的 `gitnexus-unity-rule-gen` 和 `unity-rule-authoring-contract` 条目；更新 skill 引用表

### 批次 8: 回写 spec

- [x] 2.39 更新 `openspec/specs/mcp-local-backend/spec.md` — 同步删除 rule-lab dispatch 要求（基于 `specs/mcp-local-backend/spec.md` delta）

### 编译与测试验证

- [x] 2.40 `npx tsc --noEmit` 编译通过，无错误
- [x] 2.41 `npm test` 全部通过，测试总数比修改前减少（删除文件数量匹配预期）

## 3. 收敛与验证准备

- [x] 3.1 验证检查点：
  - `grep -r "rule_lab\|rule-lab" src/` 结果仅限保留的 `RuntimeClaimRule` 类型（非移除范围）
  - `test -f` 确认关键文件已删除
  - `npm test` 全部通过
- [x] 3.2 回写准备：
  - `mcp-local-backend/spec.md` 的 `Requirement: Rule Lab Tool Dispatch` 已移除

## 4. 验证与回写收敛

- [x] 4.1 基于真实实现结果生成 `verification.md`（覆盖 spec-to-implementation 与 task-to-evidence）
- [x] 4.2 基于 verification.md 结论生成 `writeback.md`（目标、字段映射、前置条件）
- [x] 4.3 执行 writeback.md 中定义的回写目标，并记录可审计证据
