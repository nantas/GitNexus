<!-- version: 1.9.0 -->
<!-- Last updated: 2026-05-10 -->

Last reviewed: 2026-05-10

**Project:** GitNexus · **Environment:** dev · **Maintainer:** repository maintainers (see GitHub)

## Scope

| Boundary | Rule |
|----------|------|
| **Reads** | `gitnexus/`, `gitnexus-web/`, `eval/`, plugin packages, `.github/`, `.gitnexus/`, docs. |
| **Writes** | Only paths required for the change; keep diffs minimal. Update lockfiles when deps change. |
| **Executes** | `npm`, `npx`, `node` under `gitnexus/` and `gitnexus-web/`; `uv run` for Python under `eval/`; documented CI/dev workflows. |
| **Off-limits** | Real `.env` / secrets, production credentials, unrelated repos, destructive git ops without confirmation. |

## Model Configuration

- **Primary:** Use a named model (e.g. Claude Sonnet 4.x). Avoid `Auto` or unversioned `latest` when reproducibility matters.
- **Notes:** The GitNexus CLI indexer does not call an LLM.

## Execution Sequence (complex tasks)

For multi-step work, state up front:
1. Which rules in this file and **[GUARDRAILS.md](GUARDRAILS.md)** apply (and any relevant Signs).
2. Current **Scope** boundaries.
3. Which **validation commands** you will run (`cd gitnexus && npm test`, `cd gitnexus && npm run test:all`, `npx tsc --noEmit`).

On long threads, *"Remember: apply all AGENTS.md rules"* re-weights these instructions against context dilution.

## Claude Code hooks

**PreToolUse** hooks can block tools (e.g. `git_commit`) until checks pass. Adapt to this repo: `cd gitnexus && npm test` (default pool, quick) before commit. Use `cd gitnexus && npm run test:all` when full CI-quality gate is needed.

## Context budget

Commands and gotchas live under **Repo reference** below and in **[CONTRIBUTING.md](CONTRIBUTING.md)**. If always-on rules grow, split into **`.cursor/rules/*.mdc`** (globs). **Cursor:** project-wide rules in `.cursor/index.mdc`. **Claude Code:** load `STANDARDS.md` only when needed.

## Reference docs

- **[ARCHITECTURE.md](ARCHITECTURE.md)**, **[CONTRIBUTING.md](CONTRIBUTING.md)**, **[GUARDRAILS.md](GUARDRAILS.md)**
- **Call-resolution DAG (legacy path):** See ARCHITECTURE.md § Call-Resolution DAG. Typed 6-stage DAG inside the `parse` phase; language-specific behavior behind `inferImplicitReceiver` / `selectDispatch` hooks on `LanguageProvider`. Shared code in `gitnexus/src/core/ingestion/` must not name languages. Types: `gitnexus/src/core/ingestion/call-types.ts`.
- **Scope-resolution pipeline (RFC #909 Ring 3):** See ARCHITECTURE.md § Scope-Resolution Pipeline. Replaces the legacy DAG for languages in `MIGRATED_LANGUAGES` (see `registry-primary-flag.ts`). A language plugs in by implementing `ScopeResolver` (`scope-resolution/contract/scope-resolver.ts`) and registering it in `SCOPE_RESOLVERS`. CI parity gate runs BOTH paths per migrated language on every PR.
- **Cursor:** `.cursor/index.mdc` (always-on); `.cursor/rules/*.mdc` (glob-scoped). Legacy `.cursorrules` deprecated.
- **GitNexus:** skills in `.claude/skills/gitnexus/`; MCP rules in `gitnexus:start` block below.

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-05-09 | 1.8.0 | Added Unity benchmark & E2E test guidance; added upstream merge guide with dependency conflict resolution rules; restored `@ladybugdb/core` to ^0.16.1 (was downgraded to 0.15.x during upstream merge, causing SIGSEGV). |
| 2026-05-10 | 1.9.0 | Split npm test into default-pool-only (`npm test`) vs full suite (`npm run test:all`); increased hookTimeout to 300s and added lbug-db pool testTimeout 300s; updated AGENTS.md test workflow to reflect three-pool structure. |
| 2026-04-23 | 1.7.0 | TypeScript added to `MIGRATED_LANGUAGES` (registry-primary call resolution by default). |
| 2026-04-20 | 1.6.0 | Added scope-resolution pipeline pointer (RFC #909 Ring 3); Python migrated to registry-primary. |
| 2026-04-19 | 1.5.0 | Cross-repo impact (#794): `impact`/`query`/`context` accept `repo: "@<group>"` + `service`. Removed `group_query`/`group_contracts`/`group_status` MCP tools; added `gitnexus://group/{name}/contracts` and `gitnexus://group/{name}/status` resources. |
| 2026-04-16 | 1.4.0 | Fixed: web UI description, pre-commit behavior, MCP tools (7->16), added gitnexus-shared, removed stale vite-plugin-wasm gotcha. |
| 2026-04-13 | 1.3.0 | Updated GitNexus index stats after DAG refactor. |
| 2026-03-24 | 1.2.0 | Fixed gitnexus:start block duplication. |
| 2026-03-23 | 1.1.0 | Updated agent instructions, references, Cursor layout. |
| 2026-03-22 | 1.0.0 | Initial structured header and changelog. |

---

<!-- gitnexus:start -->
# GitNexus MCP

## Always Start Here

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**
4. **Follow config/state file rules:** `docs/gitnexus-config-files.md`
5. **If user asks to release/publish a specific version and this repo has `DISTRIBUTION.md`, execute that workflow in full-release mode by default** (unless user explicitly asks `prepare-only` or `publish-only`).

> If step 1 warns the index is stale, ask user whether to rebuild index via `gitnexus analyze` when local CLI exists; otherwise resolve the pinned npx package spec from `~/.gitnexus/config.json` (`cliPackageSpec` first, then `cliVersion`) and run `npx -y <resolved-spec> analyze` (it reuses previous analyze scope/options by default; add `--no-reuse-options` to reset). If user declines, explicitly warn that retrieval may not reflect current codebase. For build/analyze/test commands, use a 10-30 minute timeout; on failure/timeout, report exact tool output and do not auto-retry or silently fall back to glob/grep.
> `query/context` slim guidance is narrowing-first: inspect `decision.recommended_follow_up`, `missing_proof_targets`, and `suggested_context_targets` before upgrading to `response_profile=full`.
> Query-time runtime closure is graph-only and does not require `verification_rules` / `trigger_tokens`; if you need hydration diagnostics such as `needsParityRetry` or strict fallback state, rerun with `response_profile=full` and then use parity before closure claims.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.agents/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.agents/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.agents/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Unity Runtime Process 真理源

- 统一设计与实现对照文档：`docs/unity-runtime-process-source-of-truth.md`
- 涉及 Unity runtime process 的任务，先阅读该文档，再执行检索/实现/验收。
- 若历史设计文档与当前实现不一致，以该真理源文档和对应代码为准，并在变更后同步更新。
- 运行时链路结论采用两层语义：`verifier-core`（二元）与 `policy-adjusted`（对外结果）。
- 当 `hydration_policy=strict` 且 `hydrationMeta.fallbackToCompact=true` 时，`policy-adjusted` 可降级为 `verified_partial/verified_segment`；此时必须 parity rerun 后再做 closure 结论。

## CLI Setup 安装内容索引

`gitnexus setup` 命令会将以下内容安装到用户仓库。**每次功能或代码变更提交后，必须检查这些文件是否需要同步更新。**

### Skills（安装到 `.agents/skills/gitnexus/`）

| 源文件 | 安装路径 | 用途 |
|--------|---------|------|
| `gitnexus/skills/gitnexus-exploring.md` | `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md` | 架构探索 / "How does X work?" |
| `gitnexus/skills/gitnexus-impact-analysis.md` | `.agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` | 影响分析 / "What breaks if I change X?" |
| `gitnexus/skills/gitnexus-debugging.md` | `.agents/skills/gitnexus/gitnexus-debugging/SKILL.md` | Bug 追踪 / "Why is X failing?" |
| `gitnexus/skills/gitnexus-refactoring.md` | `.agents/skills/gitnexus/gitnexus-refactoring/SKILL.md` | 重构 / rename / extract / split |
| `gitnexus/skills/gitnexus-guide.md` | `.agents/skills/gitnexus/gitnexus-guide/SKILL.md` | 工具、资源、schema 参考 |
| `gitnexus/skills/gitnexus-cli.md` | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` | CLI 命令：index / status / clean / wiki |
| `gitnexus/skills/gitnexus-pr-review.md` | `.agents/skills/gitnexus/gitnexus-pr-review/SKILL.md` | PR 审查工作流 |

### Shared Contracts（安装到 `.agents/skills/gitnexus/_shared/`）

| 源文件 | 安装路径 |
|--------|---------|
| `gitnexus/skills/_shared/unity-runtime-process-contract.md` | `.agents/skills/gitnexus/_shared/unity-runtime-process-contract.md` |
| `gitnexus/skills/_shared/unity-ui-trace-contract.md` | `.agents/skills/gitnexus/_shared/unity-ui-trace-contract.md` |
| `gitnexus/skills/_shared/unity-hydration-contract.md` | `.agents/skills/gitnexus/_shared/unity-hydration-contract.md` |

### Hooks（安装到用户全局 Claude 配置）

| 内容 | 安装路径 |
|------|---------|
| GitNexus Claude Code hook | `~/.claude/hooks/gitnexus/gitnexus-hook.cjs` |

### MCP Config

`gitnexus setup` 会向以下编辑器配置文件注入 MCP server 条目（视用户环境而定）：
- `.mcp.json`（项目级）
- `~/.cursor/mcp.json`（Cursor 全局）
- `~/.config/claude/claude_desktop_config.json`（Claude Desktop）

### 维护规则

> **每次提交涉及以下内容时，必须检查并同步更新上表中对应的源文件：**
> - MCP 工具接口变更（新增/修改/删除工具参数或行为）
> - `analyze_rules` 规则格式变更（新增 binding kind、新增字段、修改 YAML schema）
> - CLI 命令变更（新增子命令、修改参数）
> - Unity runtime process 架构变更（新增 edge type、新增 process 阶段）
> - `query/context` 默认返回契约或 `response_profile` 升级路径变更
>
> 检查方式：阅读对应源文件，确认 skill 中的示例、字段说明、工作流步骤与当前实现一致。

### 新增 binding kind 或 resource_bindings 字段时的强制要求

> **每次新增 `UnityResourceBinding` binding kind 或为现有 kind 新增字段时，必须在同一 commit 内完成以下三件事，缺一不可：**
>
> 1. **类型定义**：在 `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts` 的 `UnityResourceBinding` 接口中添加新字段。
> 2. **解析器**：在 `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts` 的 `parseRuleYaml()` binding 解析循环中，用 `scalar()` 或 `list()` 提取对应字段。
> 3. **单元测试**：在 `gitnexus/test/unit/runtime-claim-rule-registry.test.ts` 中添加 `describe('parseRuleYaml – <kind>')` 测试块，断言新字段被正确解析，以及缺失时返回 `undefined`。
>
> **背景**：`method_triggers_method` 在 1.5.0-rc.3 中新增了类型定义和处理函数，但 `parseRuleYaml()` 未同步添加字段提取，导致所有 `method_triggers_method` 规则在 analyze 阶段产出 0 条合成边，且没有任何测试覆盖这条路径，问题直到在真实仓库验证时才被发现。

---

## Upstream 合并指南

> 基于 `chore/merge-upstream-2026-05` 的实践经验总结。

### 核心原则

1. **Package 依赖以 upstream 为准**：`package.json` 冲突时优先使用上游版本号（fork 的依赖范围可能已过时，且 fork 侧的改动通常不依赖特定小版本）
2. **核心管线文件优先 fork**：`local-backend.ts`、`pipeline.ts`、`parse-worker.ts` 等深度修改的文件，优先保留 fork 版本再手工移植上游改动
3. **逐批验证**：按依赖顺序分批合并（基础设施 → 管线底座 → DB/进程 → CLI → MCP/存储 → 测试元数据），每批独立编译验证
4. **用户确认**：以下场景**必须暂停**并请用户决策：
   - 功能等价不可达成（上游架构变更导致 fork 功能无法通过纯接口适配保留）
   - 行为语义冲突（同一函数在 fork/upstream 有互斥实现）
   - 依赖版本分歧（同一依赖在 fork/upstream 有不同 major 版本）

### 依赖冲突处理流程

当 `package.json` 或 `package-lock.json` 发生冲突时：

```
1. 列出 fork vs upstream 版本差异（使用 `npm view <pkg> versions --json` 确认可用版本）
2. 优先采纳 upstream 版本号
3. 如有以下情况，暂停请用户确认：
   - Fork 显式新增了上游没有的依赖（如 tree-sitter-gdscript）
   - Fork 显式固定了某个旧版本（如 `graphology-types: "^0.24.8"` 用于类型补丁）
   - 依赖版本相差 2+ 个 major（如 fork ^1.x vs upstream ^3.x）
4. 记录最终决策到 merge commit message 和 verification.md
```

### 镜像文件列表与策略

批次 5 中的高冲突文件（`local-backend.ts`、`pipeline.ts`、`parse-worker.ts`、`tools.ts`、`resources.ts`）因双方改动量巨大，不适合手工融合。建议策略：
- 取上游完整版本（策略 B）
- 在后续独立 change 中将 fork 功能作为 adapter 重新注入
- 不要在同一个 merge change 中试图解决所有语义冲突

### 历史参考

- `openspec/changes/merge-upstream-2026-05/` — 完整的 merge change 工件
- `docs/2026-03-18-upstream-merge-feasibility-and-checklist.md` — 前次可行性分析

---

## 测试开发与验证强制流程

### 三 Pool 分池结构

`gitnexus/vitest.config.ts` 配置了三个 vitest pool，每次 `vitest run` 按以下方式执行：

| Pool | 模式 | 内容 | 预期耗时 |
|------|------|------|---------|
| `default` | 并行 fork 池 | 单元测试 + 非集成测试（395+ 文件） | ~30-40s |
| `lbug-db` | 串行 (`fileParallelism: false`)，`testTimeout: 300s` | LadybugDB 集成测试（17+ 文件） | ~5-8 min |
| `cli-e2e` | 串行 | `skills-e2e.test.ts`（1 文件） | ~30s |

**分池理由**：LadybugDB 的 N-API mmap addon 在并行 fork 中产生文件锁冲突，`lbug-db` pool 强制串行执行。每文件在独立 fork 中运行，fork 退出时 N-API 析构 segfault 被 `dangerouslyIgnoreUnhandledErrors` 捕获。

### 命令分层

| 命令 | 范围 | 用途 |
|------|------|------|
| `npm test` | default pool 仅 (`--project default`) | **开发者快速反馈**，~30-40s |
| `npm run test:all` | 全部三 pool | **CI 质量门**，可能 >5 min |
| `npm run test:unit` | 仅 `test/unit/` | 快速单元测试子集 |
| `npm run test:integration` | 集成测试（需先 build） | 集成回归 |

> ⚠️ `npm test` 在 2026-05-10 变更：原 `vitest run`（全量）改为 `vitest run --project default`（仅 default pool）。需要全量覆盖时使用 `npm run test:all`。

### 超时配置

| 参数 | 值 | 说明 |
|------|-----|------|
| `hookTimeout`（顶层） | 300000（5 min） | 为 globalSetup LadybugDB schema DDL 提供充足时间 |
| `testTimeout`（顶层） | 30000（30 s） | default pool 快速杀死 hung 测试 |
| `testTimeout`（lbug-db pool） | 300000（5 min） | 适应串行集成测试的累积执行时间 |

### 编写新测试时必须遵守

1. **文件位置**：新测试文件必须放在 `test/unit/`（或 `test/integration/`）目录下，**禁止**放在 `src/` 子目录中，除非该路径已在 `vitest.config.ts` 的 `include` 中显式列出。
2. **测试框架**：必须使用 **vitest API**，即 `import { describe, it, expect } from 'vitest';`，**禁止使用** `node:test` + `node:assert/strict`。
3. **命名规范**：测试文件以 `.test.ts` 结尾。
4. **运行前检查**：执行 `npm test`（默认 pool）后，必须对比输出中的 **Tests** 数量是否增加，确认新测试被 default pool 包含。若测试属于 `lbug-db` pool（集成测试），需同时用 `npm run test:all` 验证。
   - 正确示例：`Tests  8141 passed`（比修改前 +20）
   - 错误示例：测试数量未变化，说明新测试文件未被 vitest 发现

> 迁移记录：`openspec/changes/archive/2026-05-09-migrate-node-test-to-vitest`

### 验证清单（提交前必须完成）

- [ ] 新测试文件位于 `test/unit/`（或已列入 `vitest.config.ts` `include` 的路径）
- [ ] 使用 `import { describe, it, expect } from 'vitest'` 而非 `node:test`
- [ ] `npm test`（default pool）输出中，测试总数增加了新写入的用例数
- [ ] 若新测试属于集成测试（`lbug-db` pool），运行 `npm run test:all` 确认包含
- [ ] `npx tsc --noEmit` 无编译错误
- [ ] 旧测试无回归失败

---

## Unity Benchmark 与 E2E 测试指南

### 前提条件

- `@ladybugdb/core` >= 0.16.1（2026-05-09 修复：之前因合并降级到 0.15.x 导致 CLI 在 8GB 堆下 SIGSEGV，已升级到 0.16.1）
- `npm run build` 必须运行在测试执行前
- 测试目标仓库必须 `git init`（GitNexus 要求 git 仓库）

### Unity Mini 快速基准测试

```bash
cd gitnexus

# 创建独立的测试仓库（避免 stale .gitnexus 干扰）
TEST_DIR=$(mktemp -d /tmp/unity-mini-XXXX)
rsync -a --exclude='.git' --exclude='.gitnexus' ../benchmarks/fixtures/unity-mini/ "$TEST_DIR/"
cd "$TEST_DIR" && git init --quiet && git add -A && git commit -m "init" --quiet
cd -

# 运行 analyze（排除 Unity 资源文件，仅 C#）
npm run build && node dist/cli/index.js analyze "$TEST_DIR" --force --extensions .cs

# 运行完整 benchmark（含 query/context/impact 测试）
npm run build && node dist/cli/index.js benchmark-unity ../benchmarks/unity-baseline/v1 \
  --profile quick --target-path "$TEST_DIR"
```

### 完整 Benchmark 命令

| 命令 | 范围 | 目标数据集 |
|------|------|-----------|
| `npm run benchmark:quick` | quick (10 symbols, 5 tasks) | `benchmarks/fixtures/unity-mini` |
| `npm run benchmark:full` | full | `benchmarks/fixtures/unity-mini` |
| `npm run benchmark:neonspark:quick` | quick | neonspark (需 `GITNEXUS_NEONSPARK_TARGET_PATH`) |
| `npm run benchmark:neonspark:full` | full | neonspark (需 `GITNEXUS_NEONSPARK_TARGET_PATH`) |

> 注意：`benchmark:quick` 和 `benchmark:full` 自带 `npm run build`，但如果在 gitnexus/ 子目录外执行，需先 build。

### Unity Runtime Process E2E 测试

```bash
cd gitnexus

# 完整的 u3 gates（Unity runtime process 验证门）
npm run build && node --test dist/benchmark/u2-e2e/*.test.js \
  dist/mcp/local/unity-enrichment.test.js \
  dist/core/ingestion/unity-resource-processor.test.js

# 单独运行 Unity enrichment 测试
npx vitest run src/mcp/local/unity-enrichment.test.ts

# UI trace 验收测试
npm run build && node --test dist/core/unity/ui-trace.acceptance.test.js
```

### 测试环境注意事项

1. **使用独立目录**：每次 `analyze` 前使用 `mktemp -d` + `rsync` 创建干净的 git 仓库，避免 `.gitnexus/` 缓存干扰
2. **资源文件处理**：Unity `.prefab`/`.unity`/`.asset` 文件目前被排除在标准 C# analyze 之外（`--extensions .cs`），Unity 资源扫描阶段（`ingestion-pipeline`）恢复后会自动处理
3. **Segfault 已修复**：LadybugDB 0.16.1 在 8GB 堆下不再崩溃；如果遇到 SIGSEGV，先检查 `@ladybugdb/core` 版本
4. **Timeout**：neonspark 完整 benchmark 可能需要 10-30 分钟，设置足够长的 timeout

---

## 已知解析陷阱

| 问题 | 参考文档 |
|------|---------|
| tree-sitter Unicode 标识符导致 Class 节点缺失、`HAS_METHOD` 边丢失；大文件 `Invalid argument` 崩溃；调用层常见错误 | [`docs/tree-sitter-parsing-pitfalls.md`](docs/tree-sitter-parsing-pitfalls.md) |

> C# 含条件编译分支（`#if/#elif/#else/#endif`）时，执行 analyze 建议显式传入 `--csharp-define-csproj <path>`（Unity 项目优先 `Assembly-CSharp.csproj`；neonspark 使用 `/Volumes/Shuttle/projects/neonspark/Assembly-CSharp.csproj`）。该参数在首次 analyze 成功后自动持久化到 `meta.json.analyzeOptions`，后续运行会自动复用（文件存在性验证通过时）。若文件被移动或删除，系统会输出警告并跳过预处理归一化。
