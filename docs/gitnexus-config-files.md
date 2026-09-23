# GitNexus Configuration Files

This document defines the current configuration and state file rules used by GitNexus.

## Repo-local (`<repo>/.gitnexus/`)

| File | Owner | Purpose | Write Path | Read Path |
|------|-------|---------|------------|-----------|
| `lbug` | `analyze` / MCP runtime | LadybugDB graph index data | `gitnexus analyze` rebuilds it | Query tools and MCP backend |
| `gitnexus.json` | `analyze` | Primary index metadata and storage ownership | Saved at end of `analyze` | `status`, hooks, MCP/CLI storage resolution |
| `meta.json` | `analyze` | Legacy metadata mirror | Dual-written with `gitnexus.json` | Older clients |
| `unity-parity-seed.json` | `analyze` | Unity parity seed cache payload | Saved during `analyze` finalize | Unity lazy/parity loaders |

### Index metadata (representative fields)

```json
{
  "repoPath": "/abs/path/to/repo",
  "repoId": "resolved-repo-name-or-alias",
  "storagePath": "/abs/path/to/repo/.gitnexus",
  "lastCommit": "git-head-sha",
  "analysisInputFingerprint": "sha256-of-effective-analysis-inputs",
  "indexedAt": "ISO-8601 timestamp",
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
- `gitnexus.json` and its legacy `meta.json` mirror store index state, not analyze option defaults. Ownership and schema fields are managed by `analyze`; do not hand-edit or copy metadata between repositories. Analyze configuration comes from `.gitnexusrc`.
- Commit `.gitnexusrc` in the repository root for recurring analyze defaults. CLI arguments override configured values.

```json
{
  "name": "my-unity-project",
  "includeExtensions": [".cs", ".meta"],
  "scopeRules": ["Assets/", "Packages/com.veewo.*"],
  "csharpDefineCsproj": "Assembly-CSharp.csproj"
}
```

`csharpDefineCsproj` resolves relative to the target repository. Define symbols are loaded once and passed into workerData; changing the define profile changes C# parse-cache keys. Before freshness checks, analyze fingerprints normalized scope/extensions and the actual define symbols (including external csproj content changes). A changed or missing fingerprint forces full graph writeback; successful publication records it in index metadata. An unchanged configuration still permits the up-to-date fast path. This receipt is not a source of option defaults.

Scope rules remain path prefixes, with a trailing `*` accepted as a wildcard prefix.

### Freshness coverage receipt

For Git repositories, successful analysis records `indexCoverage` next to
`fileHashes` in both metadata files:

```json
{
  "indexCoverage": {
    "maxFileSizeBytes": 524288,
    "scopeRules": ["Assets/", "Packages/"],
    "includeExtensions": [".cs", ".meta"],
    "dirtyPaths": []
  }
}
```

`status` without `--repo` replays this completed run's scope, extensions and size
limit when comparing source content. Scope and extension filtering have the same
semantics as analyze; empty arrays mean unrestricted selection. Out-of-scope
changes do not count as content drift, while in-scope additions, edits and
removals still do. Git HEAD, runner identity and incomplete-index checks remain
independent freshness gates.

The receipt describes indexed coverage, not current configuration intent. Changing
`.gitnexusrc` does not retroactively change that coverage; run analyze to apply the
new defaults. Its analysis-input fingerprint forces a rebuild for changed
scope/extensions. Receipt fields never supply missing analyze options.

Older receipts missing either selection array remain readable. Status retains
its conservative legacy scan for missing filters; it cannot reconstruct scope
from hashes or an opaque fingerprint and may report out-of-scope additions until
reanalyzed. The next analyze bypasses the clean-HEAD fast path once, rebuilds
using explicit CLI / `.gitnexusrc` / built-in defaults, and records both arrays.
To preserve a previous one-off selection, pass those flags again or put them in
`.gitnexusrc`. Subsequent unchanged runs retain the fast path.


The effective `--max-file-size` / `GITNEXUS_MAX_FILE_SIZE` limit also bounds lazy
source-text reads during CSV export (512 KiB by default). Relationship providers
may retain supplemental File nodes for oversized resources; those nodes and their
edges remain in the graph, but their `content` is empty. Files within the limit
retain their full text under `contentRetention=full`; the limit does not truncate
accepted source text. This prevents post-scan resource nodes from bypassing the
walker's size budget during database COPY.

## Repo-local optional inputs

| File | Purpose |
|------|---------|
| `.gitnexusignore` | Extra ignore rules on top of `.gitignore` |


### Runtime Claim Contract (current)

- Query-time `runtime_chain_verify=on-demand` uses graph-only closure from structured anchors.
- Query-time runtime claim closure does **not** load any rule artifacts for matching; closure is purely graph-based.

## Global (`~/.gitnexus/`)

| File | Purpose |
|------|---------|
| `config.json` | Global CLI settings: setup scope, pinned CLI package spec/version, wiki API config |
| `registry.json` | Global list of indexed repositories for multi-repo MCP/CLI resolution |

## Precedence rules

1. For analyze option resolution:
   1. CLI explicit flags
   2. `<repo>/.gitnexusrc` (flat keys or nested `analyze` object)
   3. built-in defaults
2. For MCP repo-scoped tools, an explicit repo wins. Otherwise a sole registered repo or configured MCP default is used; read-only tools may resolve the registered path containing the process cwd without crossing an unindexed nested Git checkout. Mutating tools require an explicit repo when no sole/default repo exists.
   - The fork `unity-ui-trace` CLI additionally resolves local metadata `repoId`, then a registry path match.
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
- Static process evidence is persisted for all projects. Unity lifecycle classification is pipeline-derived when Unity is auto-detected via `Assets/*.cs`. The synthetic root and its edges are replaced together during derived-layer incremental refresh.

## Ownership rules

- `analyze` owns `.gitnexus/gitnexus.json`, its legacy `.gitnexus/meta.json` mirror, `.gitnexus/lbug`, `.gitnexus/unity-parity-seed.json`.
- `setup` owns global `~/.gitnexus/config.json` and agent MCP wiring.

- `gitnexus-unity-rule-gen` now points to direct public flow guidance: `approved -> compile -> analyze -> CLI validation`.

## Legacy compatibility note

- Default `clean` removes repo-local index artifacts while preserving `.gitnexus/meta.json` and `.gitnexus/config.json`.
- Historical `.gitnexus/gap-lab/` and `.gitnexus/rules/` artifacts may exist in older repos; these are no longer part of the active workflow and can be safely deleted manually.
