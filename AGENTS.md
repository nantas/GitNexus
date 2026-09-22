<!-- version: 1.15.0 -->
<!-- Last updated: 2026-09-07 -->

Last reviewed: 2026-09-07

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
3. Which **validation commands** you will run (`cd gitnexus && npm test`, `npx tsc --noEmit`).

On long threads, *"Remember: apply all AGENTS.md rules"* re-weights these instructions against context dilution.

## Claude Code hooks

**PreToolUse** hooks can block tools (e.g. `git_commit`) until checks pass. Adapt to this repo: `cd gitnexus && npm test` before commit.

## Context budget

Commands and gotchas live under **Repo reference** below and in **[CONTRIBUTING.md](CONTRIBUTING.md)**. If always-on rules grow, split into **`.cursor/rules/*.mdc`** (globs). **Cursor:** project-wide rules in `.cursor/index.mdc`. **Claude Code:** load `STANDARDS.md` only when needed.

## Reference docs

- **[ARCHITECTURE.md](ARCHITECTURE.md)**, **[CONTRIBUTING.md](CONTRIBUTING.md)**, **[GUARDRAILS.md](GUARDRAILS.md)**
- **Objective-C provider work:** read **[docs/languages/objective-c-provider.md](docs/languages/objective-c-provider.md)** before changing Objective-C parsing or resolution.
- **Call & inheritance resolution (RFC #909 Ring 3):** See ARCHITECTURE.md § Scope-Resolution Pipeline. All languages resolve calls and inheritance through the scope-resolution pipeline (`Registry.lookup`, `preEmitInheritanceEdges`, `emitHeritageEdges`, `buildMro` → `MethodDispatchIndex`). **Shared code in `gitnexus/src/core/ingestion/` must not name languages** — plug language behavior in via `LanguageProvider` / `ScopeResolver` hooks. A language plugs in by implementing `ScopeResolver` (`scope-resolution/contract/scope-resolver.ts`) and registering it in `SCOPE_RESOLVERS`. (The legacy call-resolution DAG + `@heritage` capture path were removed in RING4-1 #942.)
- **Cursor:** `.cursor/index.mdc` (always-on); `.cursor/rules/*.mdc` (glob-scoped). Legacy `.cursorrules` deprecated.
- **GitNexus:** standard skills in `.claude/skills/gitnexus-*/`; MCP rules in `gitnexus:start` block below.

## PR Swarm Review (cross-CLI)

To run a production-readiness review of a GitNexus pull request from **any** AI CLI, follow
the canonical, CLI-neutral spec **[`pr-swarm-review/orchestration.md`](pr-swarm-review/orchestration.md)**
(seven read-only review personas under `pr-swarm-review/personas/`). It defines two
execution modes with the same output contract: **Swarm mode** (parallel subagents, e.g.
Claude Code) and **Solo mode** (one agent runs all lanes sequentially — Codex, Gemini,
Cursor, Copilot, or any agent reading this file). Per-CLI entrypoints are thin wrappers
listed in [`pr-swarm-review/README.md`](pr-swarm-review/README.md); edit review logic only
in the canonical files, never in the wrappers. The review is read-only — it never edits,
commits, or posts.

## Engineering planning & execution (`/gitnexus-plan` · `/gitnexus-work` · `/gitnexus-review` · `/gitnexus-lfg`)

Four canonical, CLI-neutral skill specs under `.claude/skills/` (Claude Code invokes
them as slash commands; Codex or any other agent reading this file should read the
named SKILL.md and follow it directly — user-level Codex prompts are documented in the
plan/work/lfg skill READMEs):

- **`gitnexus-plan/SKILL.md`** — deep, implementation-ready plan for a code change:
  GitNexus graph intelligence for navigation, statement-level PDG slices for behavioral
  constraints, targeted source reads for verification. Output lands in `docs/plans/`
  with a reusable implementation context pack (section 11). Planning-only — it never
  edits code (index freshness refreshes via `analyze --index-only` are the one
  permitted state change). Interactive runs ask up front how deep to go
  (quick / standard / deep); Deepen mode strengthens an existing plan in place.
- **`gitnexus-work/SKILL.md`** — executes a gitnexus-plan as verified atomic commits:
  drift-checks the plan's evidence pin against HEAD, `impact` before every symbol
  edit, tests from the plan's scenarios, `detect_changes` before every commit.
- **`gitnexus-review/SKILL.md`** — read-only GitNexus review of a PR URL/number,
  branch or commit range, or local staged/unstaged/untracked changes. It pins exact
  SHAs, aligns the graph and checkout, runs a PDG-backed taint pass on trust-boundary
  diffs, scales to per-domain expert lenses from the graph's clusters (dispatched as
  parallel swarm lanes — `ci-personas/` — when the CI review agent runs it), and
  reports evidence-backed findings.
- **`gitnexus-lfg/SKILL.md`** — pipeline orchestrator: plan (depth asked up front) →
  blocking user gate (proceed or stop) → work → `gitnexus-review`.

The family ships with the npm package (`gitnexus/skills/`, installed to editor targets
by `gitnexus setup`) and the Claude Code plugin; review also has a standalone Cursor
mirror. `gitnexus/test/unit/shipped-skills-sync.test.ts` guards the copies. Token savings of the workflow are measurable with
`eval/workflow_bench/` (real headless CLI runs, free-model routing supported — see its README).

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-09-07 | 1.15.0 | Added the Objective-C provider guide as the required reference before changing Objective-C parsing or resolution. |
| 2026-07-20 | 1.14.0 | `gitnexus-review` gains a coordinated swarm: six `ci-personas/` lanes the CI review agent dispatches as subagents (via the `Agent` tool), with a bounded critic gate and sidechain-excluded evidence. |
| 2026-07-16 | 1.13.0 | `gitnexus-plan` asks plan depth up front (quick/standard/deep) in interactive runs; `gitnexus-lfg` gate slimmed to proceed/stop (Deepen stays as the route-back mechanism). |
| 2026-07-16 | 1.12.0 | Renamed `gitnexus-pr-review` to `gitnexus-review`; added PR URL/number, branch/range, and local-change targets plus install migration (setup warns on a legacy `gitnexus-pr-review` dir and leaves it in place; uninstall removes it). |
| 2026-07-11 | 1.11.0 | Skill family shipped via npm skills/ + plugin (sync-guarded); added eval/workflow_bench token-savings benchmark. |
| 2026-07-11 | 1.10.0 | Added `gitnexus-work` (plan executor) and `gitnexus-lfg` (plan → deepen/work gate → review pipeline) skills; section renamed to Engineering planning & execution. |
| 2026-07-11 | 1.9.0 | Added Engineering planning (`/gitnexus-plan`) section; registered the `gitnexus-plan` skill (`.claude/skills/gitnexus-plan/`). |
| 2026-05-22 | 1.8.0 | Kotlin added to `MIGRATED_LANGUAGES` (registry-primary call resolution by default). Closes #1756 (companion-vs-instance dispatch) and #1757 (lambda scopes); refs #1746. RFC §6.4 corpus criterion waived (corpus-mode wiring is #927-scope); fixture criterion met. |
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
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **GitNexus**.

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — Resolve cliPackageSpec from ~/.gitnexus/config.json (cliVersion fallback), then `npx -y <resolved-spec> analyze`.

## Always Start Here

Read the repository context, then the matching skill. Ask before rebuilding a stale index. `query/context` slim guidance is narrowing-first: inspect `decision.recommended_follow_up`, `missing_proof_targets`, and `suggested_context_targets` before requesting full output. Query-time runtime closure is graph-only; under strict hydration, parity rerun is required after compact fallback.

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "nantas-dev"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "nantas-dev" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/GitNexus/context` | Codebase overview, check index freshness |
| `gitnexus://repo/GitNexus/clusters` | All functional areas |
| `gitnexus://repo/GitNexus/processes` | All execution flows |
| `gitnexus://repo/GitNexus/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Review a pull request | `.agents/skills/gitnexus/gitnexus-pr-review/SKILL.md` |
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
| `gitnexus/skills/_shared/unity-rule-authoring-contract.md` | `.agents/skills/gitnexus/_shared/unity-rule-authoring-contract.md` |

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
> > - CLI 命令变更（新增子命令、修改参数）
> - Unity runtime process 架构变更（新增 edge type、新增 process 阶段）
> - Shared contract 接口变更
> - `query/context` 默认返回契约或 `response_profile` 升级路径变更
> >
> 检查方式：阅读对应源文件，确认 skill 中的示例、字段说明、工作流步骤与当前实现一致。


---

## 已知解析陷阱

| 问题 | 参考文档 |
|------|---------|
| tree-sitter Unicode 标识符导致 Class 节点缺失、`HAS_METHOD` 边丢失；大文件 `Invalid argument` 崩溃；调用层常见错误 | [`docs/tree-sitter-parsing-pitfalls.md`](docs/tree-sitter-parsing-pitfalls.md) |

> C# 含条件编译分支（`#if/#elif/#else/#endif`）时，建议在仓库根 `.gitnexusrc` 提交 `"csharpDefineCsproj": "Assembly-CSharp.csproj"`；临时覆盖使用 `--csharp-define-csproj <path>`（Unity 项目优先 `Assembly-CSharp.csproj`；neonspark 使用 `/Volumes/Shuttle/projects/neonspark/Assembly-CSharp.csproj`），以便按 `DefineConstants` 做预处理归一化后再解析。
