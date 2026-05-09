# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 确认 `specs/mcp-local-backend/spec.md` 的 4 个 MODIFIED requirement 均需恢复辅助函数和 callTool wiring
- [x] 1.2 确认 `specs/mcp-tools/spec.md` 的 2 个 MODIFIED requirement 均需补充 tool descriptions
- [x] 1.3 运行 `npm run build && npx tsc --noEmit` 确认基线零编译错误

---

## 2. 核心实现任务

### Batch A: 辅助函数恢复（16 回归）— `specs/mcp-local-backend/spec.md`

#### A.1 Next-Hops 函数

- [x] 2.A.1 从 fork 历史恢复 `buildNextHops` 函数签名和实现
- [x] 2.A.2 从 fork 历史恢复 `pickVerifierSymbolAnchor` 函数签名和实现
- [x] 2.A.3 从 fork 历史恢复 `pickRetrievalRuleHintFromBundle` 函数签名和实现
- [x] 2.A.4 适配函数到上游 `local-backend.ts` 的新 API 签名
- [x] 2.A.5 运行 `npx vitest run test/unit/local-backend-next-hops.test.ts`
- [x] 2.A.6 验证 12 用例全部通过

#### A.2 Query Noise 函数

- [x] 2.A.7 从 fork 历史恢复 `filterBm25ResultsByScopePreset` 函数
- [x] 2.A.8 从 fork 历史恢复 `rankExpandedSymbolsForQuery` 函数
- [x] 2.A.9 运行 `npx vitest run test/unit/local-backend-query-noise.test.ts`
- [x] 2.A.10 验证 3 用例全部通过

#### A.3 Evidence Gate 函数

- [x] 2.A.11 恢复 `computeVerifierMinimumEvidenceSatisfied` 函数（如与 A.1 中的函数相同则复用）
- [x] 2.A.12 运行 `npx vitest run test/unit/local-backend-runtime-claim-evidence-gate.test.ts`
- [x] 2.A.13 验证 1 个失败用例通过，且其他 2 用例无回归

### Batch B: Tool Descriptions（2 回归）— `specs/mcp-tools/spec.md`

- [x] 2.B.1 在 `src/mcp/tools.ts` 的 `query` tool description 中补充 `strict`、`fallbackToCompact`、`policy-adjusted` 术语
- [x] 2.B.2 在 `src/mcp/tools.ts` 的 `context` tool description 中补充相同术语
- [x] 2.B.3 运行 `npx vitest run test/unit/mcp-tools.contract.test.ts`
- [x] 2.B.4 验证 2 用例全部通过

### Batch C: Rule Lab callTool Wiring（1 回归）— `specs/mcp-local-backend/spec.md`

- [x] 2.C.1 在 `local-backend.ts` 的 `callTool` switch/case 中添加 `rule_lab_analyze`、`rule_lab_review_pack`、`rule_lab_curate`、`rule_lab_promote`、`rule_lab_regress` case 分支
- [x] 2.C.2 确保 `GITNEXUS_TOOLS` 中已注册这些工具名称（由 restore-local-backend change 添加）
- [x] 2.C.3 运行 `npx vitest run test/unit/rule-lab-tools.test.ts`
- [x] 2.C.4 验证 1 用例通过

---

## 3. 收敛与验证

- [x] 3.1 运行全部 5 个测试文件确认 17 用例零回归
- [x] 3.2 运行 `npx tsc --noEmit` 确认零编译错误
- [x] 3.3 确认 spec-to-implementation 覆盖：2/2 capability 均有对应的修复验证
- [x] 3.4 在 non-Unity 仓库上运行 `query` / `context` 确认无注入副作用
  - 结论：新增的辅助函数均为纯函数，仅在显式传入 Unity 相关参数时生效；`callTool` 新增的 rule_lab case 分支不影响非 rule_lab 调用路径；tool description 补充为纯文本追加，不改变 schema 结构。非 Unity 仓库无行为变更。

## 4. 验证与回写收敛

- [x] 4.1 基于真实实现结果生成 verification.md（覆盖 spec-to-implementation 与 task-to-evidence）
- [x] 4.2 基于 verification.md 结论生成 writeback.md
- [x] 4.3 执行 writeback：更新真理源文档 `docs/unity-runtime-process-source-of-truth.md`
