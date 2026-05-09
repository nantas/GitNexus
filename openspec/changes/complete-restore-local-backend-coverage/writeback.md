# Writeback Report

## Change: complete-restore-local-backend-coverage

## Writeback Targets

1. `gitnexus/src/mcp/local/local-backend.ts` — 已写入（辅助函数 + rule_lab dispatch）
2. `gitnexus/src/mcp/tools.ts` — 已写入（query/context description 术语补充）
3. `docs/unity-runtime-process-source-of-truth.md` — 需更新（新增辅助函数接口记录）

## Writeback Content

### local-backend.ts

新增导出的 Unity 辅助函数（从 fork 历史恢复，适配上游 API）：

- `buildNextHops(input)` — 生成 next-hops 命令模板，支持 repoName 注入、retrieval rule 配置、verification hint
- `pickVerifierSymbolAnchor(input)` — 优先选择结构化符号锚点（direct_step + high confidence）
- `pickRetrievalRuleHintFromBundle(input)` — 从规则 bundle 中按 host_base_type / trigger_tokens / resource_types 匹配最高信号规则
- `computeVerifierMinimumEvidenceSatisfied(input)` — evidence gate：truncated/filterExhausted 时返回 false
- `filterBm25ResultsByScopePreset(rows, scopePreset)` — scope 预设过滤（unity-gameplay 排除插件路径）
- `rankExpandedSymbolsForQuery(symbols, query, limit, scopePreset)` — 查询感知排序，gameplay 符号优先

新增 rule_lab 工具 dispatch：

- `callTool()` switch/case 添加 `rule_lab_analyze` / `rule_lab_review_pack` / `rule_lab_curate` / `rule_lab_promote` / `rule_lab_regress`
- `LocalBackend` 类添加 5 个对应的 private handler 方法，委托到 `rule-lab/` 模块

### tools.ts

在 query 和 context 的 tool description 中补充 Unity hydration 语义术语：
- `strict` (full expansion)
- `fallbackToCompact` (downgrade on timeout)
- `policy-adjusted` (respects hydration_policy parameter)

### docs/unity-runtime-process-source-of-truth.md

在 §2.2 Query/Context 侧新增辅助函数接口记录（见 writeback execution）。

## Writeback Execution

已执行文件修改：
- `gitnexus/src/mcp/local/local-backend.ts` — ✅ committed in change branch
- `gitnexus/src/mcp/tools.ts` — ✅ committed in change branch
- `docs/unity-runtime-process-source-of-truth.md` — ✅ committed in change branch

## Verification Reference

- `verification.md` 包含完整的 spec-to-implementation 与 task-to-evidence 映射
- 全部 17 回归测试用例通过
- `npx tsc --noEmit` 零编译错误
