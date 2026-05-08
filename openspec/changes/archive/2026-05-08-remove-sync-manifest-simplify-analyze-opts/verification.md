# Verification Report

## Change
- **Name:** remove-sync-manifest-simplify-analyze-opts
- **Schema:** orbitos-change-v1
- **Verification Date:** 2026-05-08
- **Verified By:** agent

---

## Spec-to-Implementation Matrix

### Capability: `analyze-cli-interface`

| Scenario | Status | Evidence |
|----------|--------|----------|
| `analyze-rejects-removed-options` | ✓ Verified | `--sync-manifest-policy`, `--scope-manifest`, `--scope-prefix` removed from `analyze` command registration in `src/cli/index.ts`. CLI reports "unknown option" for these. Integration test in `test/unit/cli-option-rejection.test.ts` (3 tests) spawns CLI and asserts non-zero exit + error message. |
| `benchmark-rejects-removed-options` | ✓ Verified | `--scope-manifest`, `--scope-prefix` removed from `benchmark-unity`, `benchmark-agent-context`, `benchmark-agent-safe-query-context` in `src/cli/index.ts`. Integration test in `test/unit/cli-option-rejection.test.ts` (2 tests) spawns CLI and asserts non-zero exit + error message. |
| `analyze-accepts-all-remaining-options` | ✓ Verified | `analyze` command retains `--force`, `--no-reuse-options`, `--embeddings`, `--extensions`, `--repo-alias`, `--csharp-define-csproj`, `--skills`, `--verbose`. |

### Capability: `analyze-csproj-persistence`

| Scenario | Status | Evidence |
|----------|--------|----------|
| `csproj-written-to-meta-json` | ✓ Verified | `src/cli/analyze.ts` writes `csharpDefineCsproj: effectiveCsharpDefineCsproj` into `meta.analyzeOptions` (line ~430). `src/storage/repo-manager.ts` type updated to include `csharpDefineCsproj?: string`. |
| `csproj-reused-from-meta-json` | ✓ Verified | `validateStoredOptions()` in `src/cli/analyze-options.ts` validates stored `csharpDefineCsproj` (file existence via `fs.stat`). When valid, `resolveEffectiveAnalyzeOptions()` reuses it from stored layer when no CLI override. |
| `csproj-not-reused-when-file-missing` | ✓ Verified | `validateStoredOptions()` warns and sets `csharpDefineCsproj` to `undefined` when file does not exist. Test `csproj-file-not-found-warns-and-falls-back` passes. |
| `csproj-cli-override-stored` | ✓ Verified | `resolveEffectiveAnalyzeOptions()` checks `options?.csharpDefineCsproj !== undefined` first (CLI wins), then falls back to stored. After analyze, meta.json is updated with CLI value. |
| `no-csproj-stored-and-no-cli` | ✓ Verified | `resolveEffectiveAnalyzeOptions()` returns `csharpDefineCsproj: undefined` when neither CLI nor stored value exists. No C# preprocessor normalization occurs. |

### Capability: `analyze-options-resolution`

| Scenario | Status | Evidence |
|----------|--------|----------|
| `cli-override-wins-over-stored` | ✓ Verified | `resolveEffectiveAnalyzeOptions()` checks CLI option presence first (e.g., `options?.extensions !== undefined`) before falling back to stored. Test `prefers explicit CLI values over stored settings` passes. |
| `reuse-false-ignores-stored` | ✓ Verified | When `reuseOptions: false`, all fields default to empty/undefined/false. Test `disables reuse via reuseOptions=false` passes. |
| `no-stored-uses-defaults` | ✓ Verified | When `stored` is `undefined`, defaults apply: `includeExtensions: []`, `scopeRules: []`, `repoAlias: undefined`, `embeddings: false`, `csharpDefineCsproj: undefined`. Test `uses defaults when no stored options exist` passes. |
| `stored-validated-before-use` | ✓ Verified | `analyzeCommand()` calls `validateStoredOptions(existingMeta?.analyzeOptions, repoPath)` before passing to `resolveEffectiveAnalyzeOptions()`. Invalid stored alias falls back to `undefined` with warning. Test `invalid-repo-alias-warns-and-falls-back` passes. |

### Capability: `clean-command-config-preserve`

| Scenario | Status | Evidence |
|----------|--------|----------|
| `clean-removes-all-contents` | ✓ Verified | `src/cli/clean.ts` uses `fs.rm(storagePath, { recursive: true, force: true })` directly. Integration test in `test/unit/clean-integration.test.ts` creates `.gitnexus/` with `meta.json`, `lbug`, and `sync-manifest.txt`, runs `clean --force`, and asserts directory is removed. |
| `clean-idempotent-when-no-gitnexus` | ✓ Verified | Integration test in `test/unit/clean-integration.test.ts` runs `clean --force` in directory without `.gitnexus/` and asserts command succeeds with "No indexed repository" message. |

### Capability: `stored-options-validation`

| Scenario | Status | Evidence |
|----------|--------|----------|
| `valid-stored-options-pass-validation` | ✓ Verified | `validateStoredOptions()` returns all valid fields unchanged. Test `passes valid options unchanged` passes. |
| `invalid-repo-alias-warns-and-falls-back` | ✓ Verified | Regex `^[a-zA-Z0-9._-]{3,64}$` enforced; invalid alias triggers `console.warn` and returns `undefined`. Test passes. |
| `invalid-extension-format-warns-and-falls-back` | ✓ Verified | Entries not starting with `.` are filtered with warning. Test passes. |
| `csproj-file-not-found-warns-and-falls-back` | ✓ Verified | `fs.stat` failure triggers warning and `undefined` fallback. Test passes. |
| `empty-scope-rules-warns` | ✓ Verified | Empty/whitespace-only entries filtered via `normalizeScopeRules`. Test `filters empty scope rules` passes. |

---

## Task-to-Evidence

| Task | Status | Evidence |
|------|--------|----------|
| 2.1.1 `csharpDefineCsproj` in `RepoMeta.analyzeOptions` | ✓ | `src/storage/repo-manager.ts` line 14 |
| 2.2.1 Remove `scopeManifest`/`scopePrefix` interfaces | ✓ | `src/cli/analyze-options.ts` — `AnalyzeScopeOptions` removed; `ResolveAnalyzeOptionsInput` simplified |
| 2.2.2 Remove manifest reading logic | ✓ | `readScopeManifestConfig`, `parseScopeManifestConfig` import removed; `resolveAnalyzeScopeRules` removed |
| 2.2.3 Add `csharpDefineCsproj` to stored/effective types | ✓ | `StoredAnalyzeOptions` and `EffectiveAnalyzeOptions` both include field |
| 2.2.4 Simplify to CLI > stored | ✓ | `resolveEffectiveAnalyzeOptions` no longer references manifest |
| 2.2.5 Add `validateStoredOptions` | ✓ | New async function with repoAlias regex, ext format, scopeRules filter, csproj file check |
| 2.3.1 Remove `syncManifestPolicy`/`scopeManifest`/`scopePrefix` from `AnalyzeOptions` | ✓ | `src/cli/analyze.ts` interface cleaned |
| 2.3.2 Remove sync-manifest imports/calls | ✓ | `enforceSyncManifestConsistency` and `resolveScopeManifestForAnalyze` removed |
| 2.3.3 `validateStoredOptions` before `resolveEffectiveAnalyzeOptions` | ✓ | `analyzeCommand()` calls validation first |
| 2.3.4 Pass `csharpDefineCsproj` to pipeline | ✓ | `buildPipelineRunOptionsForAnalyze` receives from `effectiveOptions` |
| 2.3.5 meta.json includes `csharpDefineCsproj` | ✓ | Written in `analyzeCommand()` |
| 2.3.6 Simplify `hasCliOverrides` | ✓ | Removed scopeManifest/scopePrefix branches; added `csharpDefineCsproj` |
| 2.4.1 Remove options from `analyze` CLI | ✓ | `src/cli/index.ts` |
| 2.4.2 Remove options from benchmark CLI | ✓ | `src/cli/index.ts` three benchmark commands |
| 2.5.1 Remove from benchmark options interfaces | ✓ | `benchmark-unity.ts`, `benchmark-agent-context.ts`, `benchmark-agent-safe-query-context.ts` |
| 2.6.1 Simplify `clean.ts` | ✓ | Direct `fs.rm` instead of per-file cleanup |
| 2.7.1 Delete sync-manifest files | ✓ | `sync-manifest.ts`, `sync-manifest.test.ts`, `scope-manifest-config.ts` deleted |
| 2.7.2 New `test/unit/analyze-options.test.ts` | ✓ | `validateStoredOptions` (6 scenarios) + `resolveEffectiveAnalyzeOptions` (4 scenarios) |
| 2.7.3 New `test/unit/analyze-pipeline-options.test.ts` | ✓ | `buildPipelineRunOptionsForAnalyze` `csharpDefineCsproj` pass-through tests |
| 2.7.4 New `test/unit/repo-manager-alias.test.ts` | ✓ | `saveMeta/loadMeta` with `csharpDefineCsproj` persistence |
| 2.7.5 New `test/unit/cli-option-rejection.test.ts` | ✓ | CLI integration: 5 tests verifying `--sync-manifest-policy`, `--scope-manifest`, `--scope-prefix` rejected on `analyze` and `benchmark-unity` |
| 2.7.6 New `test/unit/clean-integration.test.ts` | ✓ | CLI integration: 2 tests verifying `clean --force` removes `.gitnexus/` and succeeds when absent |
| 2.8.1 `npx tsc --noEmit` | ✓ | Clean compile |
| 2.8.2 `npm test` | ✓ | 1725 passed, 1 pre-existing failure unrelated to this change |

---

## Breaking Changes Verified

- `sync-manifest.txt` is no longer auto-loaded or preserved
- `--sync-manifest-policy`, `--scope-manifest`, `--scope-prefix` are rejected as unknown options
- `scopeRules` now only sourced from stored `meta.json.analyzeOptions` (no CLI input path)
- `clean` removes entire `.gitnexus/` directory unconditionally

## Migration Notes Verified

- Existing `meta.json.analyzeOptions` with `csharpDefineCsproj` will be validated (file existence check) and reused
- Users previously relying on `--scope-prefix` must ensure scope rules are persisted in `meta.json` (re-analyze once)
