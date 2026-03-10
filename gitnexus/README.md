# GitNexus

**Graph-powered code intelligence for AI agents.** Index any codebase into a knowledge graph, then query it via MCP or CLI.

Works with **Cursor**, **Claude Code**, **Codex**, **Windsurf**, **Cline**, **OpenCode**, and any MCP-compatible tool.

[![npm version](https://img.shields.io/npm/v/gitnexus.svg)](https://www.npmjs.com/package/gitnexus)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm%20Noncommercial-blue.svg)](https://polyformproject.org/licenses/noncommercial/1.0.0/)

---

## Why?

AI coding tools don't understand your codebase structure. They edit a function without knowing 47 other functions depend on it. GitNexus fixes this by **precomputing every dependency, call chain, and relationship** into a queryable graph.

**Three commands to give your AI agent full codebase awareness.**

## Quick Start

```bash
# Index your repo (run from repo root)
npx gitnexus analyze
```

That's it. This indexes the codebase, updates `AGENTS.md` / `CLAUDE.md` context files, and (when using project scope) installs repo-local agent skills.

To configure MCP + skills, run `npx gitnexus setup --agent <claude|opencode|codex>` once (default global mode), or add `--scope project` for project-local mode.

`gitnexus setup` requires an agent selection:
- `--agent claude`: configure Claude MCP only
- `--agent opencode`: configure OpenCode MCP only
- `--agent codex`: configure Codex MCP only

It also supports two scopes:
- `global` (default): writes MCP to the selected agent's global config + installs global skills
- `project`: writes MCP to the selected agent's project-local config + installs repo-local skills

## Team Deployment and Distribution

For small-team rollout (single stable channel only), follow:
- [CLI Deployment and Distribution](../docs/cli-release-distribution.md)

Key links:
- [npm publish workflow](../.github/workflows/publish.yml)
- [CLI package config](./package.json)
- [Agent install + acceptance runbook](../INSTALL-GUIDE.md)

### Editor Support

| Editor | MCP | Skills | Hooks (auto-augment) | Support |
|--------|-----|--------|---------------------|---------|
| **Claude Code** | Yes | Yes | Yes (PreToolUse) | **Full** |
| **Cursor** | Yes | Yes | — | MCP + Skills |
| **Codex** | Yes | Yes | — | MCP + Skills |
| **Windsurf** | Yes | — | — | MCP |
| **OpenCode** | Yes | Yes | — | MCP + Skills |

> **Claude Code** gets the deepest integration: MCP tools + agent skills + PreToolUse hooks that automatically enrich grep/glob/bash calls with knowledge graph context.

### Community Integrations

| Agent | Install | Source |
|-------|---------|--------|
| [pi](https://pi.dev) | `pi install npm:pi-gitnexus` | [pi-gitnexus](https://github.com/tintinweb/pi-gitnexus) |

## MCP Setup (manual)

If you prefer to configure manually instead of using `gitnexus setup`:

### Claude Code (full support — MCP + skills + hooks)

```bash
claude mcp add gitnexus -- npx -y @veewo/gitnexus@latest mcp
```

### Cursor / Windsurf

Add to `~/.cursor/mcp.json` (global — works for all projects):

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "@veewo/gitnexus@latest", "mcp"]
    }
  }
}
```

### OpenCode

Add to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "gitnexus": {
      "type": "local",
      "command": ["npx", "-y", "@veewo/gitnexus@latest", "mcp"]
    }
  }
}
```

### Codex

```bash
codex mcp add gitnexus -- npx -y @veewo/gitnexus@latest mcp
```

## How It Works

GitNexus builds a complete knowledge graph of your codebase through a multi-phase indexing pipeline:

1. **Structure** — Walks the file tree and maps folder/file relationships
2. **Parsing** — Extracts functions, classes, methods, and interfaces using Tree-sitter ASTs
3. **Resolution** — Resolves imports and function calls across files with language-aware logic
4. **Clustering** — Groups related symbols into functional communities
5. **Processes** — Traces execution flows from entry points through call chains
6. **Search** — Builds hybrid search indexes for fast retrieval

The result is a **KuzuDB graph database** stored locally in `.gitnexus/` with full-text search and semantic embeddings.

## MCP Tools

Your AI agent gets these tools automatically:

| Tool | What It Does | `repo` Param |
|------|-------------|--------------|
| `list_repos` | Discover all indexed repositories | — |
| `query` | Process-grouped hybrid search (BM25 + semantic + RRF) | Optional |
| `context` | 360-degree symbol view — categorized refs, process participation | Optional |
| `impact` | Blast radius analysis with depth grouping and confidence | Optional |
| `detect_changes` | Git-diff impact — maps changed lines to affected processes | Optional |
| `rename` | Multi-file coordinated rename with graph + text search | Optional |
| `cypher` | Raw Cypher graph queries | Optional |

> With one indexed repo, the `repo` param is optional. With multiple, specify which: `query({query: "auth", repo: "my-app"})`.

## MCP Resources

| Resource | Purpose |
|----------|---------|
| `gitnexus://repos` | List all indexed repositories (read first) |
| `gitnexus://repo/{name}/context` | Codebase stats, staleness check, and available tools |
| `gitnexus://repo/{name}/clusters` | All functional clusters with cohesion scores |
| `gitnexus://repo/{name}/cluster/{name}` | Cluster members and details |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{name}` | Full process trace with steps |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher queries |

## MCP Prompts

| Prompt | What It Does |
|--------|-------------|
| `detect_impact` | Pre-commit change analysis — scope, affected processes, risk level |
| `generate_map` | Architecture documentation from the knowledge graph with mermaid diagrams |

## CLI Commands

```bash
gitnexus setup --agent claude                     # Global setup for Claude
gitnexus setup --agent codex                      # Global setup for Codex
gitnexus setup --scope project --agent opencode   # Project-local setup for OpenCode
gitnexus analyze [path]           # Index a repository (or update stale index)
gitnexus analyze --force          # Force full re-index
gitnexus analyze --embeddings     # Enable semantic embeddings (off by default)
gitnexus analyze --scope-prefix Assets/NEON/Code --scope-prefix Packages/com.veewo.*  # Scoped multi-directory indexing
gitnexus analyze --scope-manifest .gitnexus/sync-manifest.txt --repo-alias neonspark-v1-subset  # Scoped indexing + stable repo alias
gitnexus mcp                     # Start MCP server (stdio) — serves all indexed repos
gitnexus serve                   # Start local HTTP server (multi-repo) for web UI
gitnexus list                    # List all indexed repositories
gitnexus status                  # Show index status for current repo
gitnexus clean                   # Delete index for current repo
gitnexus clean --all --force     # Delete all indexes
gitnexus wiki [path]             # Generate LLM-powered docs from knowledge graph
gitnexus wiki --model <model>    # Wiki with custom LLM model (default: gpt-4o-mini)
gitnexus unity-bindings <symbol> --target-path <path> [--json]  # Experimental Unity C# <-> prefab/scene/asset cross-reference
gitnexus context <symbol> --unity-resources on                   # Include graph-native Unity resource data (opt-in)
gitnexus query <symbol> --unity-resources on                     # Enrich query symbol hits with Unity resource data (opt-in)
gitnexus benchmark-unity ../benchmarks/unity-baseline/v1 --profile quick --target-path ../benchmarks/fixtures/unity-mini
gitnexus benchmark-unity ../benchmarks/unity-baseline/v1 --profile full --target-path ../benchmarks/fixtures/unity-mini
```

For scoped indexing, `analyze` logs scope overlap dedupe counts and any normalized path collisions to help diagnose multi-directory merge safety.

Unity resource retrieval is opt-in on `query/context` via `unity_resources: off|on|auto` (default: `off`). Use `--unity-resources on` when you need `resourceBindings`, `serializedFields`, `resolvedReferences`, and `unityDiagnostics` in output.

## Unity Benchmark

Run reproducible Unity/C# accuracy and regression checks:

```bash
gitnexus benchmark-unity ../benchmarks/unity-baseline/v1 --profile quick --target-path ../benchmarks/fixtures/unity-mini
gitnexus benchmark-unity ../benchmarks/unity-baseline/v1 --profile full --target-path ../benchmarks/fixtures/unity-mini
```

Reports are written to `.gitnexus/benchmark/benchmark-report.json` and `.gitnexus/benchmark/benchmark-summary.md`.

Hard gates:

| Metric | Threshold |
|--------|-----------|
| Query precision | `>= 0.90` |
| Query recall | `>= 0.85` |
| Context/impact F1 | `>= 0.80` |
| Smoke pass rate | `= 1.00` |
| Analyze time regression | `<= +15%` |

## Multi-Repo Support

GitNexus supports indexing multiple repositories. Each `gitnexus analyze` registers the repo in a global registry (`~/.gitnexus/registry.json`). The MCP server serves all indexed repos automatically.

## Supported Languages

TypeScript, JavaScript, Python, Java, C, C++, C#, Go, Rust

## Agent Skills

GitNexus ships with skill files that teach AI agents how to use the tools effectively:

- **Exploring** — Navigate unfamiliar code using the knowledge graph
- **Debugging** — Trace bugs through call chains
- **Impact Analysis** — Analyze blast radius before changes
- **Refactoring** — Plan safe refactors using dependency mapping

Installation rules:

- `gitnexus setup` controls skill scope:
  - requires `--agent <claude|opencode|codex>`
  - default `global`: installs to `~/.agents/skills/gitnexus/`
  - `--scope project`: installs to `.agents/skills/gitnexus/` in current repo
- `gitnexus analyze` always updates `AGENTS.md` / `CLAUDE.md`; skill install follows configured setup scope.

## Requirements

- Node.js >= 18
- Git repository (uses git for commit tracking)

## Privacy

- All processing happens locally on your machine
- No code is sent to any server
- Index stored in `.gitnexus/` inside your repo (gitignored)
- Global registry at `~/.gitnexus/` stores only paths and metadata

## Web UI

GitNexus also has a browser-based UI at [gitnexus.vercel.app](https://gitnexus.vercel.app) — 100% client-side, your code never leaves the browser.

**Local Backend Mode:** Run `gitnexus serve` and open the web UI locally — it auto-detects the server and shows all your indexed repos, with full AI chat support. No need to re-upload or re-index. The agent's tools (Cypher queries, search, code navigation) route through the backend HTTP API automatically.

## License

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)

Free for non-commercial use. Contact for commercial licensing.
