# Writeback Plan

## Status
- **Change:** remove-sync-manifest-simplify-analyze-opts
- **Verification:** Complete (see `verification.md`)
- **Ready for Writeback:** Yes

## Targets

### 1. `gitnexus/skills/gitnexus-cli.md` (source)
- **Action:** Update analyze workflow description
- **Changes needed:**
  - Remove references to `--sync-manifest-policy`, `--scope-manifest`, `--scope-prefix`
  - Document that `--csharp-define-csproj` is persisted to `meta.json.analyzeOptions` and auto-reused
  - Update "Path A / Path B" distinction if it references sync-manifest
  - Add note about `validateStoredOptions` behavior (warns on invalid stored values)

### 2. `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` (installed)
- **Action:** Synchronize with source above
- **Rule:** Must match `gitnexus/skills/gitnexus-cli.md` exactly

### 3. `INSTALL-GUIDE.md`
- **Action:** Remove sync-manifest related setup steps
- **Changes needed:**
  - Remove any section instructing users to create `.gitnexus/sync-manifest.txt`
  - Update analyze command examples to not include removed flags
  - Add note about `meta.json.analyzeOptions` persistence

### 4. `AGENTS.md`
- **Action:** Update analyze command documentation
- **Changes needed:**
  - Remove references to `--csharp-define-csproj` being non-persistent
  - Remove `--scope-manifest` / `--scope-prefix` mentions
  - Update the known parsing pitfalls section if it references `--csharp-define-csproj` behavior

### 5. `gitnexus/CHANGELOG.md`
- **Action:** Record breaking change
- **Entry draft:**
  ```
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
  ```

## Execution Checklist

| # | Target | Status | Commit Path |
|---|--------|--------|-------------|
| 1 | `gitnexus/skills/gitnexus-cli.md` | ✓ Done | `gitnexus/skills/gitnexus-cli.md` |
| 2 | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` | ✓ Done | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` |
| 3 | `INSTALL-GUIDE.md` | ✓ Done | `INSTALL-GUIDE.md` |
| 4 | `AGENTS.md` | ✓ Done | `AGENTS.md` |
| 5 | `gitnexus/CHANGELOG.md` | ✓ Done | `gitnexus/CHANGELOG.md` |

## Evidence
- Verification file: `openspec/changes/remove-sync-manifest-simplify-analyze-opts/verification.md`
- Compilation: `npx tsc --noEmit` — clean
- Tests: `npm test` — 1698 passed, 1 pre-existing failure (unrelated)
- Files deleted: `gitnexus/src/cli/sync-manifest.ts`, `sync-manifest.test.ts`, `scope-manifest-config.ts`
