# Project setup: create and migrate `.gitnexusrc`

> Status: implementation plan. Verified against the current source tree on 2026-09-28. The GitNexus index is 1752 commits behind HEAD; graph results were not used as evidence. The user previously deferred rebuilding this repository's index.

## 1. Goal and acceptance

`gitnexus setup --scope project` should help a repository acquire a durable, reviewable `.gitnexusrc`. When an older index exists, setup should offer a one-time migration from `.gitnexus/gitnexus.json` or its legacy `.gitnexus/meta.json` mirror. A later `analyze` reads the new file; setup itself does not analyze, clean, open, or mutate the database.

Acceptance criteria:

1. A fresh project setup can create a valid root `.gitnexusrc` after the user chooses full or scoped analysis. It never silently selects full analysis when the intended range is unknown.
2. A project setup with a legacy v1.5.9 `analyzeOptions` receipt can present and migrate its supported values. A newer `indexCoverage` receipt supplies the last successful selection even when `analyzeOptions` is absent.
3. Existing `.gitnexusrc` is validated and preserved byte-for-byte. Repeated setup does not change it.
4. A conflicting or incomplete receipt is shown as such; setup does not guess its missing values or fall back from a corrupt primary metadata file to an older mirror.
5. Global setup and `--coding-agent` keep their current editor-wide behavior and never create a repository file.
6. No migration path automatically rebuilds an index. The result reports whether `analyze` is needed and names the effective scope it will use.

The FTS error-classification fix is separate work. Setup migration does not claim to repair FTS or a LadybugDB file format.

## 2. Current implementation and source of truth

| Concern | Current source | Relevant fact |
|---|---|---|
| Setup routing | `gitnexus/src/cli/index.ts`, `setup.ts`, `setup-detected-agents.ts` | `--scope` means editor installation scope (`global` or `project`). `--coding-agent` takes a separate global installer path. |
| Analyze config | `gitnexus/src/cli/analyze-config.ts` | Root `.gitnexusrc` is JSON, strict about keys and types, and CLI flags override it. Missing file is allowed. |
| Index metadata | `gitnexus/src/storage/repo-meta.ts`, `repo-manager.ts` | `gitnexus.json` is primary; `meta.json` is a legacy mirror. `loadMeta` uses the mirror only when the primary is absent, never when it is corrupt or unreadable. |
| Last analyzed selection | `gitnexus/src/core/run-analyze.ts` | `indexCoverage` records `scopeRules`, `includeExtensions`, and `maxFileSizeBytes` for Git repositories. It records what ran, not the desired next-run defaults. |
| Version history | tag `v1.5.9`, `gitnexus/src/cli/analyze.ts` | That version read `analyzeOptions` on later runs and saved `includeExtensions`, `scopeRules`, `repoAlias`, `embeddings`, `aiContext`, and optionally `csharpDefineCsproj`. Current analyze does not reuse them. |
| Branch indexes | `gitnexus/src/storage/repo-manager.ts`, `gitnexus/src/cli/status.ts` | Branch slots can each have metadata, while `.gitnexusrc` is one repository-wide file. |

`runnerIdentity.cliVersion` identifies the analyzer that wrote an index. `schemaFingerprint` identifies GitNexus graph schema compatibility. Neither is a reliable LadybugDB file-format version. Setup may display these as context; it must not call either a database-version check. Schema mismatch and other rebuild triggers remain the responsibility of `analyze`.

## 3. CLI behavior

Add a repository-config mode distinct from the existing installation `--scope`:

```text
--rc-mode <auto|migrate|create|skip>   default: auto for project, skip for global
--accept-rc                           accept the displayed, complete plan without a TTY
--rc-scope <all|comma-separated-prefixes>
--rc-extensions <all|comma-separated-extensions>
--rc-name <name>
--rc-csharp-define-csproj <path>
```

These are proposed spellings; reserve them in CLI tests before implementation. Do not reuse `--scope` for analysis rules. Other supported legacy values (`embeddings`, `aiContext`) may be confirmed in the interactive preview; if non-interactive overrides are needed, add narrowly named `--rc-embeddings` / `--rc-skip-agents-md` flags rather than an unvalidated JSON blob.

Examples for scripts (the first requires an unambiguous legacy selection):

```bash
gitnexus setup --scope project --agent codex --rc-mode migrate --accept-rc
gitnexus setup --scope project --agent codex --rc-mode create \
  --rc-scope Assets/,Packages/ --rc-extensions .cs,.meta \
  --rc-csharp-define-csproj Assembly-CSharp.csproj --accept-rc
gitnexus setup --scope project --agent codex --rc-mode create \
  --rc-scope all --rc-extensions all --accept-rc
```

| Mode / environment | Behavior |
|---|---|
| `auto`, project, TTY, rc present | Validate and preserve rc; no prompt or rewrite. |
| `auto`, project, TTY, rc missing | Display proposed JSON, source and conflicts. Ask to accept, edit choices, or skip rc creation. Fresh repositories must choose full or scoped selection. |
| `auto`, project, no TTY, rc missing | Do current MCP/skill setup, print `Analysis config: pending` plus the exact explicit command needed to create/migrate rc. Never wait for stdin or silently write inferred scope. |
| `migrate`, project | Require usable old metadata. Resolve conflicts or missing scope/extensions through explicit flags or TTY answers. `--accept-rc` permits non-TTY writing only when the plan is complete. |
| `create`, project | Require explicit full/scoped choices for both paths and extensions via TTY or `--rc-scope` plus `--rc-extensions`; name/C# path remain optional. Ignore old metadata for the proposed values, but warn if it records a different selection. |
| `skip`, any scope | Preserve current setup behavior; do not read/write rc for migration. |
| `auto` with global or `--coding-agent` | No repository rc operation. Explicit `migrate`/`create` with these modes is a usage error before any writes. |

For an existing invalid rc, `auto`, `migrate`, and `create` fail before setup writes anything; `skip` remains available for editor-only setup. An explicit create/migrate request against an existing valid rc fails with a clear “already exists” message rather than overwriting it. The regular project setup remains usable when the user declines the rc prompt, and its summary must say rc creation was skipped.

Exit contract: an explicit `migrate`/`create` that cannot complete returns nonzero before setup writes; default non-TTY `auto` may complete editor setup with exit zero but must print `Analysis config: pending` and must not print an unqualified “ready to analyze” next step. A confirmed creation reports `Analysis config: created` and the selected scope/extensions.

## 4. Migration plan and field mapping

Introduce one module, provisionally `gitnexus/src/cli/setup-analyze-config.ts`, with a small interface: `planRepositoryAnalyzeConfig(repoRoot, overrides)` returns a read-only plan; `writeRepositoryAnalyzeConfig(plan)` writes the validated result once. The module owns metadata selection, conversion, validation, and no-overwrite creation. `setup.ts` owns CLI interaction and summary output. Keep rc parsing/normalization in `analyze-config.ts` as the shared validation source; do not duplicate its key rules.

The plan records `sourceFile`, `indexedAt`, per-field evidence, proposed JSON, warnings, and unresolved decisions. It must distinguish an **absent** field from an explicit empty array (`[]` means full scope/extensions). It must not derive scope from `fileHashes`, `analysisInputFingerprint`, or indexed file names.

| New rc field | Candidate source | Rule |
|---|---|---|
| `scopeRules` | `indexCoverage.scopeRules`; otherwise `analyzeOptions.scopeRules` | Prefer the last successful coverage when both are present. If both disagree, show the conflict and require confirmation. Missing both means unknown, not full. |
| `includeExtensions` | `indexCoverage.includeExtensions`; otherwise `analyzeOptions.includeExtensions` | Same conflict and missing-value rule. Preserve explicit `[]` as full extension selection. |
| `name` | `analyzeOptions.repoAlias` | Validate with rc name rules. `repoId`/registry name is display-only because it may be generated rather than an intended explicit alias. |
| `csharpDefineCsproj` | `analyzeOptions.csharpDefineCsproj` | Preserve only after current path validation. Do not guess from a nearby csproj. A missing value is reported, especially for Unity repositories, but is not synthesized. |
| `embeddings` | `analyzeOptions.embeddings` | This is an old explicit toggle, not inferred from `stats.embeddings` (a result count). Show potential rebuild cost when true. |
| `skipAgentsMd` | `analyzeOptions.aiContext === false` | Old `--no-ai-context` suppressed context files but did not necessarily suppress skills; map only to the matching current switch. Omit the key when the old value is true or absent. |
| `maxFileSize` | `indexCoverage.maxFileSizeBytes` | Offer as a candidate only when non-default and exactly representable in KiB; otherwise report the recorded value without inventing a config setting. |

All other metadata fields are index state, not migratable analyze options. The proposal remains a *candidate* until confirmed; an old run's effective options are not automatically the user's future intent. The write path should serialize the flat rc shape in stable field order with a trailing newline and no metadata/provenance fields inside the rc file.

## 5. Metadata and file safety

1. Resolve the Git root before planning; use existing storage resolution so configured index paths work. Check that metadata's canonical `repoPath` identifies this repository. Never migrate a copied or foreign index by path coincidence.
2. Read `gitnexus.json` first. Use `meta.json` only if the primary is provably absent. Parse/read errors of a present primary stop migration and report the path and error. An explicit migration request fails before other writes; default `auto` can finish editor setup but reports rc as pending. Do not modify either metadata file.
3. If branch-specific receipts exist, compare the active branch with the flat receipt before choosing a repository-wide rc. Divergent scope/extensions require explicit user selection; no cross-branch “latest timestamp wins” rule.
4. Reject an existing rc symlink, hard link, malformed JSON, or invalid settings using the established repository control-file and rc validation rules. Preserve a valid rc exactly.
5. Validate the proposed JSON through the same parser used by analyze before writing. Write a temporary file in the repo root and install it with no-overwrite semantics; clean the temporary file on failure. Another process creating `.gitnexusrc` during setup must produce an “already exists” result, never an overwrite.
6. Preflight explicit `migrate`/`create` requests before changing MCP wiring or skills. Setup already writes several independent files, so report any later partial failure per artifact rather than claiming an all-or-nothing transaction.

No hidden `clean`, `analyze`, database open, registry mutation, or metadata rewrite belongs in this module. Creating rc may cause the next analyze to rebuild; the setup summary states that consequence and points to `gitnexus analyze` after the user reviews scope.

## 6. Implementation sequence

1. Add CLI options and input validation in `gitnexus/src/cli/index.ts` and `setup.ts`; preserve the separate `--coding-agent` route. Define the setup result states `preserved`, `created`, `pending`, `skipped`, `failed` for clear output.
2. Add the migration-plan module and fixture-backed read-only tests using v1.5.9 metadata and current coverage receipts. Reuse metadata precedence and rc validation logic.
3. Add TTY prompts and non-TTY explicit mode handling. Make all prompts occur after the plan is printed and before any writes.
4. Add no-overwrite rc creation; integrate it into project setup and include the resulting status and next analyze command in the summary.
5. Update `docs/gitnexus-config-files.md`, `INSTALL-GUIDE.md`, CLI help, and `gitnexus/skills/gitnexus-cli.md`; sync the installed `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` and review other setup-installed guidance listed in root `AGENTS.md`.
6. Run targeted CLI/config tests and the package build. Do one project setup smoke test on a temporary Git repository for both TTY and non-TTY modes. No real project index rebuild is part of this feature's test gate.

## 7. Verification matrix

| Scenario | Required result |
|---|---|
| Fresh repo, TTY, full choice | rc explicitly records full selection and analyze accepts it. |
| Fresh repo, TTY, scoped choice | Prefixes/extensions/C# path survive one setup and a second setup leaves bytes unchanged. |
| Fresh repo, non-TTY `auto` | No rc, no hang, actionable pending summary. |
| v1.5.9 `analyzeOptions` only | Supported fields map correctly, especially alias and inverted `aiContext`. |
| New `indexCoverage` only | Scope/extensions migrate; absent name/C# path are reported as unknown. |
| Coverage vs old options disagree | No unattended write until conflict resolved. |
| Primary missing, valid mirror | Mirror is eligible. |
| Primary corrupt, valid mirror | Migration stops; mirror is not silently selected. |
| Foreign `repoPath`, differing branch receipts | Migration stops or requires explicit selection; no copied-index contamination. |
| Existing valid/invalid rc | Valid bytes preserved; invalid config is surfaced before writes. |
| Concurrent rc creator / interrupted write | No overwrite or partial final rc. |
| Global setup / `--coding-agent` | No rc created; existing editor setup tests retain their behavior. |

Focused test homes: `gitnexus/src/cli/setup.test.ts`, `gitnexus/src/cli/analyze-options.test.ts`, and a new migration-module test. Run build/test commands with the repository's required 10–30 minute timeout; report exact failures and seek approval before rerunning, per root `AGENTS.md`.

## 8. Main risks and decisions

- **Scope expansion:** the highest risk is turning an old scoped index into a full scan. Unknown arrays are never treated as empty arrays; non-TTY defaults do not write rc.
- **Legacy information loss:** the old metadata does not carry every current rc option. Missing settings remain absent and visible in the plan, not guessed.
- **Editor automation:** setup is currently non-interactive in common test/agent flows. TTY detection and explicit modes keep those flows from hanging; the result must clearly mark rc as pending.
- **One rc, several branch indexes:** differing branch scopes require a repo-wide decision.
- **Version messaging:** runner and schema receipts can justify a later rebuild, but they do not establish a LadybugDB file-format version. Setup must avoid a false “database upgraded” claim.
