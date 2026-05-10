# GitNexus Configuration Files

This document defines the current configuration and state file rules used by GitNexus.

## Repo-local (`<repo>/.gitnexus/`)

| File | Owner | Purpose | Write Path | Read Path |
|------|-------|---------|------------|-----------|
| `lbug` | `analyze` / MCP runtime | LadybugDB graph index data | `gitnexus analyze` rebuilds it | Query tools and MCP backend |
| `meta.json` | `analyze` | Index metadata and defaults | Saved at end of `analyze` | `status`, hooks, CLI default repo resolution |
| `unity-parity-seed.json` | `analyze` | Unity parity seed cache payload | Saved during `analyze` finalize | Unity lazy/parity loaders |


### `meta.json` schema (current)

```json
{
  "repoPath": "/abs/path/to/repo",
  "repoId": "resolved-repo-name-or-alias",
  "lastCommit": "git-head-sha",
  "indexedAt": "ISO-8601 timestamp",
  "analyzeOptions": {
    "includeExtensions": [".ts", ".cs"],
    "scopeRules": ["Assets/**"],
    "repoAlias": "optional-alias",
    "embeddings": true
  },
  "stats": {
    "files": 0,
    "nodes": 0,
    "edges": 0,
    "communities": 0,
    "processes": 0,
    "embeddings": 0
  }
}
```

Notes:
- `repoId` is persisted after registration and is used as the CLI default `repo` when `--repo` is omitted.
- For backward compatibility, when `repoId` is missing, CLI falls back to matching the current path in global registry.

## Repo-local optional inputs

| File | Purpose |
|------|---------|
| `.gitnexusignore` | Extra ignore rules on top of `.gitignore` |
| `.gitnexus/sync-manifest.txt` | Recommended location for unified analyze manifest (`--scope-manifest`): supports path-prefix scope lines and `@key=value` directives for analyze options. |
| `.gitnexus/rules/overrides.yaml` | Optional project-specific alias/disable/threshold overrides for approved rules |

`sync-manifest.txt` and `rules/overrides.yaml` are user-provided inputs, not system-owned state.

### `sync-manifest.txt` unified rules (current)

`sync-manifest.txt` is the user-intent config file for analyze scope and selected analyze options.

Supported format:

```txt
# scope rules
Assets/
Packages/

@extensions=.cs,.meta
@repoAlias=neonspark-core
@embeddings=false
```

Rules:
- Non-`@` lines are scope path-prefix rules (same semantics as before; trailing `*` supported).
- `@key=value` directives are case-insensitive for key and support:
  - `@extensions=<csv>` (equivalent to `--extensions`)
  - `@repoAlias=<name>` (equivalent to `--repo-alias`)
  - `@embeddings=<true|false>` (equivalent to `--embeddings`)
- Unknown directives must fail fast with explicit error (no silent ignore).
- If the same directive appears multiple times, the last one wins.
- When `.gitnexus/sync-manifest.txt` exists and analyze is called without `--scope-manifest` and without `--scope-prefix`, CLI auto-uses this default manifest path.
- When explicit CLI values (`--extensions`, `--repo-alias`, `--embeddings`) differ from manifest directives, CLI applies `--sync-manifest-policy` (`ask|update|keep|error`, default `ask`):
  - `ask`: TTY prompt asks whether to update manifest
  - `update`: rewrite directives deterministically
  - `keep`: keep manifest unchanged and continue
  - `error`: fail immediately with actionable drift summary
- In non-interactive mode, `ask` fails with an actionable error requiring explicit policy selection.

### Runtime Claim Contract (current)

- Query-time `runtime_chain_verify=on-demand` uses graph-only closure from structured anchors.
- Query-time runtime claim closure does **not** use rule-catalog matching.
- Historical `.gitnexus/rules/**` compiled bundles from the deprecated system are not loaded at query time.

## Global (`~/.gitnexus/`)

| File | Purpose |
|------|---------|
| `config.json` | Global CLI settings: setup scope, pinned CLI package spec/version, wiki API config |
| `registry.json` | Global list of indexed repositories for multi-repo MCP/CLI resolution |

## Precedence rules

1. For analyze option resolution (`extensions`, `repoAlias`, `embeddings`, `scope rules`):
   1. CLI explicit flags
   2. manifest directives from `--scope-manifest` (`@extensions`, `@repoAlias`, `@embeddings`, plus scope lines)
   3. `<repo>/.gitnexus/meta.json.analyzeOptions` when `reuseOptions !== false`
   4. built-in defaults
   5. default manifest auto-discovery path: `.gitnexus/sync-manifest.txt` is treated as `--scope-manifest` only when no scope option is explicitly provided
2. For direct tool commands, when `--repo` is missing:
   1. use `<repo>/.gitnexus/meta.json.repoId`
   2. fallback to `~/.gitnexus/registry.json` path match
3. Query-time runtime claim closure input precedence:
   1. explicit structured anchors on request (`symbolName`, `resourceSeedPath`, `mappedSeedTargets`, `resourceBindings`)
   2. derived seed path (`resource_path_prefix`, then `filePath`, then resource path extraction from `queryText`)
   3. if structured anchors are insufficient: return explicit `rule_not_matched` (no query-time rule-match fallback)
4. For npx package spec resolution:
   1. explicit setup flags / env
   2. `~/.gitnexus/config.json` (`cliPackageSpec`, then `cliVersion`)
   3. package default dist-tag

### Unity runtime process persistence note

- `Process` lifecycle metadata persistence has no external config/env switch.
- Behavior is pipeline-derived: persistence is enabled when Unity resource-binding flow is active (Unity auto-detected via `Assets/*.cs`).

## Why `meta.json` Is Not Merged With `sync-manifest.txt`

- `sync-manifest.txt` is user-authored intent config.
- `meta.json` is analyze runtime output snapshot (`repoId`, `stats`, `lastCommit`, `indexedAt`, and effective `analyzeOptions`).

They have different ownership and lifecycle. Merging them couples mutable user intent with runtime state and increases drift/conflict risk.

## Migration guidance

Recommended stable analyze setup:

```txt
Assets/
Packages/
@extensions=.cs,.meta
@repoAlias=neonspark-core
@embeddings=false
```

Recommended command in automation:

```bash
gitnexus analyze --scope-manifest .gitnexus/sync-manifest.txt
```

If you want to disable historical option reuse:

```bash
gitnexus analyze --scope-manifest .gitnexus/sync-manifest.txt --no-reuse-options
```

## Ownership rules

- `analyze` owns `.gitnexus/meta.json`, `.gitnexus/lbug`, `.gitnexus/unity-parity-seed.json`.
- `setup` owns global `~/.gitnexus/config.json` and agent MCP wiring.

## Legacy state

- Historical `.gitnexus/rules/**` artifacts may exist in older repos from the deprecated system.
- They are migration/audit state only and are not part of the active workflow contract.
- Default `clean` removes repo-local index artifacts and unregisters from global registry.
- Default `clean` does **not** remove `.gitnexus/rules/**`.
- `clean --include-rules-all` may remove all `.gitnexus/rules/**` artifacts (explicit opt-in only).
