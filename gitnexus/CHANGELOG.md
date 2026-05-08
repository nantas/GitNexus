# Changelog

All notable changes to GitNexus will be documented in this file.

## [Unreleased]

### Breaking Changes
- Removed `--sync-manifest-policy`, `--scope-manifest`, and `--scope-prefix` CLI options.
  `sync-manifest.txt` is no longer auto-loaded. Use `--extensions` and stored
  `meta.json.analyzeOptions` instead.
- `clean` command no longer preserves `sync-manifest.txt`; the entire `.gitnexus/`
  directory is removed.

### Added
- `--csharp-define-csproj` is now persisted to `meta.json.analyzeOptions` and
  automatically reused on subsequent analyze runs (with file-existence validation).
- Added `validateStoredOptions()` to validate stored analyze options before reuse,
  emitting warnings and falling back to defaults for invalid fields.

### Changed
- Analyze options resolution simplified from three layers (CLI > manifest > stored)
  to two layers (CLI > stored).

## [1.5.5] - 2026-05-08

### Fixed
- Fixed native segfault during repository indexing caused by tree-sitter ABI drift. `tree-sitter@^0.22.0` resolved to `0.22.4` at install time, but 10 of 13 grammar packages ship native prebuilds compiled against `tree-sitter@0.21.x`. Loading 0.21.x parsers with the 0.22.4 runtime triggers `SIGSEGV` on certain C# files. Pinned `tree-sitter` to `^0.21.1` and aligned grammar versions to their last 0.21-ABI-compatible releases.

## [1.5.4] - 2026-05-08

### Fixed
- Fixed `gitnexus clean` to preserve `sync-manifest` instead of removing it, preventing scoped index setups from losing their manifest configuration.
- Fixed right-panel agent badge state synchronization in the web UI.
- Fixed native parser crashes on large UTF-8 repositories by guarding against tree-sitter Unicode identifier edge cases and oversized input buffers.

### Changed
- Updated parsing pitfalls documentation to reflect `tree-sitter-c-sharp@0.23.1` guidance and conditional-compilation normalization.
- Refactored analyze workflow guidance in agent-facing docs for clearer manifest handling and CLI-first verification.

## [1.5.3] - 2026-04-20

### Added
- Added Godot GDScript source analysis support, including language detection for `.gd` files, parser wiring, query extraction for classes/functions/constructors/signals/constants, and graph ingestion integration.
- Added GDScript export-detection regression coverage in integration tests.

### Changed
- Updated GDScript import extraction to only treat `preload(...)` and `load(...)` as imports, avoiding call/import double-classification in graph construction.
- Extended ingestion routing/config mappings so GDScript participates consistently in parser loading and call-routing fallbacks.

### Fixed
- Fixed optional dependency handling for `tree-sitter-gdscript` by switching to guarded dynamic loading in parser paths, preventing hard startup failures when the optional parser package is not installed.

## [1.5.2] - 2026-04-20

### Fixed
- Pinned `tree-sitter-c-sharp` to `0.23.1` so fresh installs do not resolve to `0.23.5`, which can break C# parser initialization and produce Unity indexes with no C# symbols, calls, communities, or processes.

## [1.5.1] - 2026-04-17

> Stable release notes comparing `v1.5.0` -> `v1.5.1`.

### Added
- Added a reduced Rule Lab authoring flow for `gitnexus-unity-rule-gen`, with exact source/target slice handling, mandatory focus-lock, resumable checkpoints, and authenticity evidence gates.
- Added shared Unity rule-authoring contract docs plus setup-installed mirror coverage so agent workflows and distributed skills stay in sync.
- Added exhaustive discovery and coverage-gate support for reduced Rule Lab authoring, including lexical scanning, ownership classification, missing-edge verification, balanced-slim candidate artifacts, and hard blocking when evidence quality is insufficient.

### Changed
- Simplified the public Unity rule-authoring workflow to the direct path only: `approved -> compile -> analyze -> CLI validation`, and aligned docs, skills, and setup-installed artifacts to that contract.
- Tightened Rule Lab preflight and artifact contracts with run-artifact parity checks, coverage gates before candidate generation, balanced-slim persistence, and explicit scope/seed/exemplar semantics.
- Updated config and source-of-truth docs to clarify that reduced Rule Lab is an offline authoring layer while query-time runtime-chain closure remains graph-only.

### Fixed
- Fixed duplicate suppression and approval handoff validation so reduced Rule Lab compares against approved YAML artifacts instead of graph state and fails with clearer field-path diagnostics.

## [1.5.0] - 2026-04-06

> Stable release notes comparing `v1.4.9` -> `v1.5.0`.

### Added
- Added a rule-driven Unity runtime process stack built around `analyze_rules`, including `runtime_claim` contracts, readable `process_ref` IDs, derived process resources, anchored runtime-chain verification, and evidence/hydration controls for `query` and `context`.
- Added Rule Lab authoring and validation workflows, including `gitnexus rule-lab compile --repo-path`, stage-aware rule bundles, curated draft artifacts, topology review payloads, probe-based regression gates, and semantic authenticity checks.
- Added Unity authoring workflows and shared contracts for agents, including `gitnexus-unity-rule-gen`, `gitnexus-unity-e2e-verify`, distributed `_shared` runtime/hydration/UI-trace contracts, and setup-installed skill guidance.
- Added new Unity rule binding coverage with `method_triggers_scene_load` and `method_triggers_method`, plus `description` metadata and `scene_name` parsing to model scene-load and callback-driven runtime edges that static analysis misses.
- Added manifest-driven analyze workflow controls, including unified `scope-manifest` directives, default `sync-manifest` reuse, and interactive drift-guard behavior for keeping scoped indexing configs in sync.
- Added local-binary MCP setup guidance and C# define-driven preprocessing normalization so generated workflow docs prefer `gitnexus mcp`, and conditional-compilation Unity projects can be indexed with container-aware diagnostics.

### Fixed
- Fixed multiple rule-driven Unity retrieval failures, including synthetic edge injection bugs, verifier ranking/fallback issues, nested-workspace runtime rule lookup, and lifecycle metadata persistence so runtime-chain results are more complete and stable.
- Fixed `method_triggers_method` YAML parsing so required source/target method fields are extracted correctly; previously these rules silently emitted zero synthetic `CALLS` edges and caused runtime verification to fail.
- Fixed schema coverage by restoring the `FROM Method TO Record` relation pair required by the new runtime and parsing paths.
- Fixed scope-manifest extension handling so scoped analyze runs do not accidentally override explicit extension filters.
- Fixed build and publish reliability by preserving the executable bit on `dist/cli/index.js` during build output generation.
- Fixed tree-sitter parsing reliability for newer C# inputs with chunked parse callbacks, Unicode identifier regression coverage, and follow-up diagnostics for conditional-compilation parsing pitfalls.

## [1.5.0-rc.4] - 2026-04-05

> Release candidate notes comparing `v1.5.0-rc.3` -> `v1.5.0-rc.4`.

### Fixed
- Fixed `method_triggers_method` binding kind not producing synthetic CALL edges at analyze time. The YAML parser in `parseRuleYaml()` was missing extraction of the four required fields (`source_class_pattern`, `source_method`, `target_class_pattern`, `target_method`), causing all `method_triggers_method` rules to silently produce zero edges and `runtime_chain_verify` to always return `failed`. Added parser fix and round-trip unit tests.
- Fixed `docs/unity-runtime-process-source-of-truth.md` missing MCP tool name references (`rule_lab_discover`, `rule_lab_promote`) required by contract tests.
- Added mandatory three-part checklist to `AGENTS.md`: when adding a new `UnityResourceBinding` binding kind or field, type definition + parser extraction + unit test must land in the same commit.

## [1.5.0-rc.3] - 2026-04-04

> Release candidate notes comparing `v1.5.0-rc.2` -> `v1.5.0-rc.3`.

### Added
- Added `method_triggers_method` binding kind to `analyze_rules`: lets rule authors declare dynamic dispatch gaps (C# events, Mirror SyncList callbacks, delegates) that static analysis cannot capture. At analyze time, a synthetic CALLS edge is injected from the source method to the target method, bridging the gap and enabling complete chain retrieval.
- Added `description` field to `UnityResourceBinding` and rule top-level (`RuleDslDraft`): documentation-only, not parsed by the engine, readable by agents for context and expected-behavior validation.
- Updated `gitnexus-unity-rule-gen` skill with `method_triggers_method` binding kind guidance, YAML template, and failure diagnostics.
- Added CLI setup installed-content index to `AGENTS.md` with maintenance rules requiring sync checks after functional changes.



> Release candidate notes comparing `v1.5.0-rc` -> `v1.5.0-rc.2`.

### Changed
- Replaced `/path/to/repo/INSTALL-GUIDE.md` placeholder paths with raw GitHub URL in all install prompts (INSTALL-GUIDE, DISTRIBUTION.md release template, release pages).
- Hardened scope decision workflow: manifest absent now requires explicit user confirmation before analyze; no silent default to full index.
- Added `clean` manifest-deletion warning with backup/restore recipe to INSTALL-GUIDE.
- Added `--no-reuse-options` guidance for scope change scenarios.
- Added CLI-first verification note: MCP may use stale session cache; verify via CLI first, then restart session for MCP acceptance.
- Added `--scope-manifest` flag and manifest syntax rules (path prefix, not glob) to `gitnexus-cli` skill.
- Updated `gitnexus-config-files.md` with manifest syntax clarification.

## [1.5.0-rc] - 2026-04-04

> Release candidate notes comparing `v1.4.11-rc.2` -> `v1.5.0-rc`.

### Added
- Added `gitnexus rule-lab compile --repo-path` CLI subcommand to compile YAML analyze_rules into stage-aware bundles.
- Added `gitnexus-unity-rule-gen` interactive skill: guided workflow for generating Unity `analyze_rules` from natural-language chain clues, with graph exploration, YAML generation, compile, re-index, and 4-step verification.
- Added `_shared/unity-hydration-contract.md` shared contract (compact→parity decision rule) and `_shared/unity-ui-trace-contract.md` full contract (goals, selector modes, output fields), extracted from inline skill content.
- Added Unity runtime process E2E verification skill (`gitnexus-unity-e2e-verify`) for end-to-end chain closure validation.
- Added `process_ref` model and stable derived process IDs returned from `query`/`context` tool outputs.
- Added `gitnexus://repo/{name}/process/{processName}` MCP resource reader for step-by-step process traces.
- Added `runtime_claim` contract schema and rule-based runtime claim integration with explicit failure classes.
- Added `hydration_policy` semantics and strict fallback downgrade for evidence delivery control.
- Added evidence view filtering/truncation and minimum evidence gate for `query`/`context` responses.
- Added probe-based regression gating and replay evidence in rule-lab.
- Added semantic authenticity gate for rule-lab phase5 acceptance.

### Changed
- Replaced hardcoded Unity runtime verification system with a rule-driven resource↔code binding infrastructure; all synthetic edge injection is now governed by `analyze_rules` YAML.
- Removed all `GITNEXUS_UNITY_*` environment variables; Unity runtime configuration is now unified under the config file.
- Simplified query-time verifier: removed hardcoded fallback paths, unified topology execution via DSL rules.
- Updated `gitnexus-cli` skill: added `--extensions`, `--scope-prefix`, `--skills` flags to analyze table; replaced inline unity-ui-trace block with `_shared/` reference.
- Updated `gitnexus-guide` skill: added `gitnexus-unity-rule-gen` to skills table; added Unity edge types (`UNITY_ASSET_GUID_REF`, `UNITY_COMPONENT_INSTANCE`) to graph schema section.
- Extended `StageAwareCompiledRule` and promote pipeline to carry `resource_bindings` and `lifecycle_overrides` Unity fields through the bundle.

### Fixed
- Fixed 3 bugs in rule-driven synthetic edge injection (field pattern matching, lifecycle scope resolution, loader-bridge edge emission).
- Fixed retrieval fallback tightening and evidence trimming decoupling in query path.
- Fixed runtime rule selection and symbol ranking in verifier.
- Fixed runtime rule fallback from nested cwd and workspace catalog when repo root lacks rules.
- Fixed rule-lab startup artifact alignment with DSL v2 compile output.

## [1.4.11-rc.2] - 2026-04-01

> Release candidate notes comparing `v1.4.11-rc` -> `v1.4.11-rc.2`.

### Changed
- Moved the repository-local Unity runtime process source-of-truth guidance outside the GitNexus-managed marker block in root `AGENTS.md` / `CLAUDE.md`, so `analyze` no longer rewrites that project-specific section.
- Synced tracked project skill copies under `.agents/skills/gitnexus/` with bundled skill docs, including runtime-process contract references.

### Fixed
- Fixed AI context generation to keep runtime-process source-of-truth text out of generated marker content, preventing accidental overwrite of user-maintained repository guidance.
- Added regression assertions for AI context output so generated `AGENTS.md` / `CLAUDE.md` do not include the runtime-process source-of-truth section.

## [1.4.11-rc] - 2026-04-01

> Release candidate notes comparing `v1.4.10-rc` -> `v1.4.11-rc`.

### Added
- Added runtime process evidence stitching for Unity retrieval flows, including confidence-aware clues for partial evidence and class-hit projection into process results.
- Added regression coverage for Unity lifecycle/runtime-process projection, schema persistence fallbacks, and setup guidance distribution across workflow-facing skill paths.

### Changed
- Expanded query/context runtime hydration orchestration so Unity class/process evidence is surfaced consistently in tool outputs and shared workflow contracts.
- Standardized runtime-process guidance into a shared source-of-truth contract and distributed it across AGENTS-aligned skill docs and setup-generated guidance.

### Fixed
- Fixed Ladybug impact traversal to avoid read-only DB traversal failures in runtime analysis paths.
- Fixed process resource lifecycle metadata persistence and fallback insert reporting so `repo/processes` output reflects stored state accurately.

## [1.4.10-rc] - 2026-03-30

> Release candidate notes comparing `v1.4.9` -> `v1.4.10-rc`.

### Added
- Added shared workflow contracts for the main-matrix GitNexus skills, covering MCP/CLI routing, Unity resource-binding escalation, and Unity UI trace trigger ordering.

### Changed
- Updated the repository skill-matrix workflow guidance to enforce MCP-first analysis with explicit CLI fallback and stale-index recovery handoff.
- Clarified role boundaries between `gitnexus-guide` (routing/index guidance), `gitnexus-cli` (command-operation manual), and scenario skills (contract-driven execution).
- Added mandatory shared-contract references in `AGENTS.md` so Unity binding and UIToolkit visual-semantic trigger paths are consistently applied.

## [1.4.9] - 2026-03-30

> Stable release notes comparing `v1.4.8` -> `v1.4.9`.

### Added
- Added Unity UI trace query controls and ranking signals:
  - `selector_mode` for `selector_bindings` (`balanced` default, `strict` precision mode)
  - result `score` and user-facing `confidence` (`high|medium|low`) for evidence prioritization
- Added Unity UI trace smoke coverage (`test:unity-ui-trace:smoke`) and CI wiring for regression detection.
- Added repository configuration/state reference documentation at `docs/gitnexus-config-files.md`, and linked it from generated agent context (`AGENTS.md`/`CLAUDE.md`).

### Changed
- Improved Unity UI trace resolution and recall:
  - enforce exact-path uniqueness for `.uxml` targets before canonical-name expansion
  - support class-token matches inside composite USS selectors in `balanced` mode
- Updated skill/workflow guidance for Unity UI trace usage, selector-mode tradeoffs, and output interpretation.
- Removed repository identity and index stats from generated `AGENTS.md`/`CLAUDE.md` context blocks to reduce cross-user merge conflicts.
- Updated direct CLI tools (`query/context/impact/cypher/unity-ui-trace`) to auto-resolve default `repo` from local index metadata when `--repo` is omitted.

### Fixed
- Fixed Unity UXML namespaced tag parsing (`ui:Template` / `ui:Style`) for better `template_refs` coverage.
- Fixed Unity asset reference scanning stability/recall via streaming scan, GUID-prefilter narrowing, and multiline YAML object-block matching.
- Fixed `selector_bindings` path-target misses by preferring `UXML -> resource -> m_Script -> C#` trace path before filename fallback.
- Persisted canonical `repoId` into `.gitnexus/meta.json` during `analyze`, with backward-compatible fallback to global registry path matching when `repoId` is missing.

## [1.4.9-rc] - 2026-03-24

### Added
- Added a query-time `selector_mode` control for Unity UI trace `selector_bindings` (`balanced` default for higher recall, `strict` for precision-first exact selector matches).
- Added selector result ranking metadata in Unity UI trace with `score` and user-facing `confidence` (`high|medium|low`) to prioritize likely-correct evidence chains.
- Added a dedicated Unity UI trace smoke test command (`test:unity-ui-trace:smoke`) and wired it into CI unit workflow for continuous regression checks.
- Added neonspark sample regression reports under `docs/reports/` to baseline `asset_refs/template_refs/selector_bindings` hit-rate and latency.

### Changed
- Improved Unity UI trace target resolution for `.uxml` path inputs to enforce exact-path uniqueness before canonical-name expansion, reducing false `ambiguous` diagnostics.
- Expanded selector binding matching in `balanced` mode to support class-token hits inside composite USS selectors (for example `.isLock .patchPreview-icon`), increasing real-project recall.
- Updated GitNexus skill workflow guides (CLI + Guide, repo and installed copies) with Unity UI trace usage, selector-mode tradeoffs, and output interpretation (`score/confidence/diagnostics`).

### Fixed
- Fixed Unity UXML reference parsing to correctly recognize namespaced tags (`ui:Template` / `ui:Style`) for `template_refs` coverage in real Unity projects.
- Fixed Unity asset reference scanning stability and recall by moving to stream-based scanning with GUID-prefilter candidate narrowing and multiline YAML object-block matching.
- Fixed `selector_bindings` misses for path targets by preferring `UXML -> resource -> m_Script -> C#` tracing before filename-canonical fallback.

## [1.4.8] - 2026-03-23

> Stable release notes comparing `v1.3.11` -> `v1.4.8`.

### Added
- Expanded type resolution through Phases 4-7 with constructor/self-super inference, doc-comment return typing, chained-call and pattern analysis, and broader resolver coverage across supported languages.
- Added Ruby CLI/web support, stronger Kotlin/Swift ingestion paths, AST decorator entrypoint hints, and `.gitignore` / `.gitnexusignore` aware file discovery.
- Added benchmark and regression coverage for scoped CLI guidance, hook config resolution, Unity retrieval quality, and agent-context workflows.

### Changed
- Migrated the storage/runtime backend from KuzuDB to LadybugDB and shifted Unity resource retrieval to summary-first persistence with compact/parity lazy hydration at query time.
- Standardized workflow-facing setup, analyze, status, and hook guidance around local `gitnexus` first with npx fallback resolved from `~/.gitnexus/config.json`, and persisted the selected CLI package spec during `setup`.
- Refreshed release/install documentation, generated agent context, bundled skills, and hook scripts to use consistent scoped `@veewo/gitnexus` command guidance.

### Fixed
- Fixed status/analyze recovery when GitNexus metadata exists but the LadybugDB store is missing, and reduced duplicate Unity parity seed loads under concurrency with singleflight plus idle-bounded caching.
- Fixed impact handling to return structured partial results instead of crashing and restored `HAS_METHOD` / `OVERRIDES` relation coverage.
- Fixed CLI and workflow reliability issues including stdout routing, dynamic skill installation, postinstall permissions, same-directory Python imports, unavailable native parser fallback, multi-repo tool test guidance, and Vitest worker `EPIPE` noise.

## [1.4.8-rc.2] - 2026-03-20

### Changed
- Standardized workflow-facing command guidance to treat `~/.gitnexus/config.json` as the single npx package-spec source after `setup`.
- Updated INSTALL-GUIDE, AGENTS/CLAUDE generation, bundled skills, installed skill copies, README snippets, and fixture guidance to remove misleading hard-coded `@latest` fallback examples.
- Updated Claude/Cursor hook runtime fallback resolution to load package specs from config instead of maintaining a separate hard-coded `@latest` default.

### Fixed
- Fixed false-negative workflow consistency checks caused by mixed version hints between setup-persisted config, repo docs, skill templates, and hook scripts.
- Added regression coverage for workflow-facing version guidance and hook config resolution so future workflow text drift is caught in tests.

## [1.4.8-rc] - 2026-03-19

### Added
- Unified CLI package-spec resolver used across setup/resource/AGENTS generation/hook flows.
  - Resolution priority: explicit setup args (`--cli-spec`/`--cli-version`) > env (`GITNEXUS_CLI_SPEC`/`GITNEXUS_CLI_VERSION`) > persisted config (`~/.gitnexus/config.json`) > `@latest`.
- `gitnexus setup` now supports:
  - `--cli-version <version>`
  - `--cli-spec <packageSpec>`
  and persists the resolved package spec into CLI config for later sessions.

### Changed
- Standardized stale-index remediation guidance to use local CLI first (`gitnexus analyze`) with npx fallback resolved from one package spec source.
- Updated setup/manual docs and skill templates to avoid hard-coded mixed-version invocation paths.
- Updated MCP JSON templates used in this repository to local binary form (`gitnexus mcp`) to eliminate static `@latest` drift in checked-in configs.

### Fixed
- Fixed false “Already up to date” path when metadata exists but LadybugDB file is missing.
  - `analyze` now rebuilds when `.gitnexus/meta.json` exists but `.gitnexus/lbug` is absent.
  - `status` now warns explicitly when metadata exists but LadybugDB file is missing.
  - registry validation now requires both `meta.json` and `lbug`.

## [1.4.7-rc] - 2026-03-19

### Changed
- Updated agent installation and indexing guidance to use local `gitnexus` CLI first, with fallback to `npx -y @veewo/gitnexus@latest` only when local CLI is unavailable.
- Synchronized stale-index recovery instructions across AGENTS/CLAUDE entry docs and GitNexus skill workflows to follow the same local-first command resolution strategy.
- Updated INSTALL-GUIDE command examples to use a session-level runner variable (`$GN`) for consistent `setup/analyze/status/query/context/impact/cypher/clean/list` invocation behavior.

## [1.4.6-rc] - 2026-03-19

> Cumulative release notes for `nantas-dev`, comparing `v1.3.11` -> `v1.4.6-rc`.

### Added
- Unity retrieval architecture upgrades:
  - summary-first persistence model (`UNITY_RESOURCE_SUMMARY`) with query-time lazy expansion.
  - compact/parity hydration contract (`hydrationMeta`, `needsParityRetry`) with parity warmup path.
  - lazy overlay + parity cache layers for repeat query acceleration.
- Unity serializable-class resource binding coverage (U3), including AssetRef-oriented context enrichment.
- Benchmark/eval tooling expansion:
  - Unity benchmark orchestration and gate reports.
  - Agent-context benchmark pipeline and dataset tooling.
- Analyze-scope and repo-alias workflow support for real-repo benchmark runs.
- Setup workflow improvements for Codex/OpenCode MCP configuration and idempotent setup behavior.
- Type resolution expansion through Phases 4-7 and broader language coverage.
- Scoped CLI regression guard tests to prevent unscoped `npx gitnexus ...` command guidance from reappearing (`scoped-cli-commands.test.ts`).

### Changed
- Storage/backend runtime migrated from KuzuDB to LadybugDB v0.15.
- Analyze/runtime memory profile reduced via streaming and bounded intermediate structures.
- Unity hydration strategy shifted from analyze-time full materialization to on-demand query-time hydration.
- CI/release workflow hardening and scoped package distribution under `@veewo/gitnexus`.
- Standardized all actionable CLI/MCP command guidance and workflow scripts to scoped package form:
  - `npx -y @veewo/gitnexus@latest <subcommand>`
  - covered generators (`ai-context`, MCP resources), setup defaults, hooks, skills, docs, eval harnesses, and fixtures.

### Fixed
- Unity parity seed hot-path now uses singleflight + idle-bounded in-memory cache, reducing duplicate seed reads under concurrency.
- Impact tool stability and relation coverage (`HAS_METHOD`, `OVERRIDES`) improvements.
- CLI output and setup reliability fixes (stdout routing, duplicate MCP table guards, hook/postinstall robustness).
- Test/runtime stability fixes, including Vitest worker `EPIPE` noise suppression.
- Removed ambiguous unscoped package invocation paths (`gitnexus@latest` / `npx gitnexus ...`) that could resolve to the wrong npm package in mixed environments.

## [1.4.6] - 2026-03-18

### Added
- **Phase 7 type resolution** — return-aware loop inference for call-expression iterables (#341)
  - `ReturnTypeLookup` interface with `lookupReturnType` / `lookupRawReturnType` split
  - `ForLoopExtractorContext` context object replacing positional `(node, env)` signature
  - Call-expression iterable resolution across 8 languages (TS/JS, Java, Kotlin, C#, Go, Rust, Python, PHP)
  - PHP `$this->property` foreach via `@var` class property scan (Strategy C)
  - PHP `function_call_expression` and `member_call_expression` foreach paths
  - `extractElementTypeFromString` as canonical raw-string container unwrapper in `shared.ts`
  - `extractReturnTypeName` deduplicated from `call-processor.ts` into `shared.ts` (137 lines removed)
  - `SKIP_SUBTREE_TYPES` performance optimization with documented `template_string` exclusion
  - `pendingCallResults` infrastructure (dormant — Phase 9 work)

### Fixed
- **impact**: return structured error + partial results instead of crashing (#345)
- **impact**: add `HAS_METHOD` and `OVERRIDES` to `VALID_RELATION_TYPES` (#350)
- **cli**: write tool output to stdout via fd 1 instead of stderr (#346)
- **postinstall**: add permission fix for CLI and hook scripts (#348)
- **workflow**: use prefixed temporary branch name for fork PRs to prevent overwriting real branches
- **test**: add `--repo` to CLI e2e tool tests for multi-repo environment
- **php**: add `declaration_list` type guard on `findClassPropertyElementType` fallback
- **docs**: correct `pendingCallResults` description in roadmap and system docs

### Chore
- Add `.worktrees/` to `.gitignore`

## [1.4.5] - 2026-03-17

### Added
- **Ruby language support** for CLI and web (#111)
- **TypeEnvironment API** with constructor inference, self/this/super resolution (#274)
- **Return type inference** with doc-comment parsing (JSDoc, PHPDoc, YARD) and per-language type extractors (#284)
- **Phase 4 type resolution** — nullable unwrapping, for-loop typing, assignment chain propagation (#310)
- **Phase 5 type resolution** — chained calls, pattern matching, class-as-receiver (#315)
- **Phase 6 type resolution** — for-loop Tier 1c, pattern matching, container descriptors, 10-language coverage (#318)
  - Container descriptor table for generic type argument resolution (Map keys vs values)
  - Method-aware for-loop extractors with integration tests for all languages
  - Recursive pattern binding (C# `is` patterns, Kotlin `when/is` smart casts)
  - Class field declaration unwrapping for C#/Java
  - PHP `$this->property` foreach member access
  - C++ pointer dereference range-for
  - Java `this.data.values()` field access patterns
  - Position-indexed when/is bindings for branch-local narrowing
- **Type resolution system documentation** with architecture guide and roadmap
- `.gitignore` and `.gitnexusignore` support during file discovery (#231)
- Codex MCP configuration documentation in README (#236)
- `skipGraphPhases` pipeline option to skip MRO/community/process phases for faster test runs
- `hookTimeout: 120000` in vitest config for CI beforeAll hooks

### Changed
- **Migrated from KuzuDB to LadybugDB v0.15** (#275)
- Dynamically discover and install agent skills in CLI (#270)

### Performance
- Worker pool threshold — skip worker creation for small repos (<15 files or <512KB total)
- AST walk pruning via `SKIP_SUBTREE_TYPES` for leaf-only nodes (string, comment, number literals)
- Pre-computed `interestingNodeTypes` set — single Set.has() replaces 3 checks per AST node
- `fastStripNullable` — skip full nullable parsing for simple identifiers (90%+ case)
- Replace `.children?.find()` with manual for loops in `extractFunctionName` to eliminate array allocations

### Fixed
- Same-directory Python import resolution (#328)
- Ruby method-level call resolution, HAS_METHOD edges, and dispatch table (#278)
- C++ fixture file casing for case-sensitive CI
- Template string incorrectly included in AST pruning set (contains interpolated expressions)

## [1.4.0] - Previous release
