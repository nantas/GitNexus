---
name: gitnexus-cli
description: "Use when the user needs to run GitNexus CLI commands like analyze/index a repo, check status, clean the index, generate a wiki, or list indexed repos. Examples: \"Index this repo\", \"Reanalyze the codebase\", \"Generate a wiki\""
---

# GitNexus CLI Commands

Use one command alias in the session so every CLI/MCP call stays on one version line. After `setup`, use `~/.gitnexus/config.json` as the CLI package spec source (`cliPackageSpec` first, then `cliVersion`). MCP wiring and skill install locations are scope-dependent (`project` vs `global`).

### setup — choose scope explicitly

```bash
gitnexus setup --scope project --agent codex --cli-spec @veewo/gitnexus@<version>
```

Rules:

- If user asks "setup this repository" / "本仓库 setup", use `--scope project`.
- `--scope project` updates repo-local files:
  - Codex MCP config: `.codex/config.toml`
  - Skills: `.agents/skills/gitnexus/`
- `--scope global` updates user-global files:
  - Codex MCP config: `~/.codex/config.toml`
  - Skills: `~/.agents/skills/gitnexus/`
- `--scope global` does not overwrite repo-local `.agents/skills` or `.codex/config.toml`.
- Never rely on setup defaults for scope; pass `--scope` explicitly to avoid global/project mismatch.

```bash
if command -v gitnexus >/dev/null 2>&1; then
  GN="gitnexus"
else
  GITNEXUS_CLI_SPEC="$(
    node -e 'const fs=require("fs");const os=require("os");const path=require("path");
    try {
      const raw=fs.readFileSync(path.join(os.homedir(),".gitnexus","config.json"),"utf8");
      const parsed=JSON.parse(raw);
      const spec=typeof parsed.cliPackageSpec==="string" && parsed.cliPackageSpec.trim()
        ? parsed.cliPackageSpec.trim()
        : typeof parsed.cliVersion==="string" && parsed.cliVersion.trim()
          ? `@veewo/gitnexus@${parsed.cliVersion.trim()}`
          : "";
      if (spec) process.stdout.write(spec);
    } catch {}'
  )"
  if [ -z "$GITNEXUS_CLI_SPEC" ]; then
    echo "Missing GitNexus CLI package spec in ~/.gitnexus/config.json. Run gitnexus setup --cli-spec <packageSpec> first." >&2
    exit 1
  fi
  GN="npx -y ${GITNEXUS_CLI_SPEC}"
fi
```

## Commands

### analyze — Build or refresh the index

```bash
$GN analyze
```

Run from the project root. This parses all source files, builds the knowledge graph, writes it to `.gitnexus/`, and generates CLAUDE.md / AGENTS.md context files.

| Flag | Effect |
|------|--------|
| `--force` | Force full re-index even if up to date |
| `--no-reuse-options` | Do not reuse stored analyze options from previous index |
| `--embeddings` | Enable embedding generation (off by default) |
| `--extensions <ext>` | Comma-separated file extensions |

**Unity 项目推荐:** 对 Unity 项目使用 `--extensions .cs` 配合 `--csharp-define-csproj <path>` 以获得最佳分析性能：

```bash
$GN analyze --extensions .cs --csharp-define-csproj /path/to/Assembly-CSharp.csproj
```

- Unity 资源绑定（`UNITY_COMPONENT_INSTANCE`、`UNITY_SERIALIZED_TYPE_IN` 等）和 lifecycle 合成边由内部 Unity Scan 阶段通过独立 glob 自动加载，无需在 `--extensions` 中包含 `.meta/.prefab/.unity/.asset`
- 纳入 `.meta` 会建立约 15 倍的 File 节点且对 Unity 绑定无益（`.meta` 由 `meta-index.ts` 独立处理）
- 性能影响：neonspark 规模项目从约 22 分钟降至 3–5 分钟
| `--repo-alias <name>` | Override indexed repository name |
| `--csharp-define-csproj <path>` | Load C# `DefineConstants` from `.csproj` for `#if` normalization |
| `--skills` | Generate repo-specific skill files from detected communities |
| `--verbose` | Enable verbose ingestion warnings |

**Option persistence:** After a successful analyze, these options are saved to `meta.json.analyzeOptions` and automatically reused on the next run:
- `includeExtensions` (from `--extensions`)
- `scopeRules`
- `repoAlias`
- `embeddings`
- `csharpDefineCsproj`

Use `--no-reuse-options` to ignore stored values and start fresh.

**C# preprocessing (Unity):** For projects with heavy conditional compilation, add `--csharp-define-csproj /path/to/Assembly-CSharp.csproj` (neonspark: `/Volumes/Shuttle/projects/neonspark/Assembly-CSharp.csproj`). This value is persisted to `meta.json` after the first run and reused automatically (with file-existence validation). Without it, C# files are parsed raw and tree-sitter may mishandle `#if` branches.

#### Rebuild recovery — when analyze hangs or crashes

If `analyze --force` hangs (no progress after 5+ minutes) or crashes leaving a corrupted index:

```bash
# 1. Clean the corrupted index
$GN clean --force

# 2. Rebuild
$GN analyze --force
```

**When to clean before rebuild:**
- Previous run left `.gitnexus/csv/` with no `relations.csv` (crash mid-streaming)
- `.gitnexus/lbug.wal` exists but `lbug` is tiny (LadybugDB in unrecovered state)
- Any `analyze` run hangs indefinitely in the "Loading into LadybugDB..." phase
- After `gitnexus clean`, always run `analyze --force` to rebuild

**When to run:** First time in a project, after major code changes, or when `gitnexus://repo/{name}/context` reports the index is stale.

### status — Check index freshness

```bash
$GN status
```

Shows whether the current repo has a GitNexus index, when it was last updated, and symbol/relationship counts. Use this to check if re-indexing is needed.

### clean — Delete the index

```bash
$GN clean --force
```

Removes the entire `.gitnexus/` directory (including `meta.json` and all index data). Also unregisters the repo from the global registry. Use this to recover from a corrupted index before re-indexing.

| Flag      | Effect                                            |
| --------- | ------------------------------------------------- |
| `--force` | Skip confirmation prompt                          |
| `--all`   | Clean all indexed repos, not just the current one |

> **Note:** Configuration is now persisted in `meta.json.analyzeOptions`. After `clean`, these settings are lost and must be re-specified on the next `analyze`.

### wiki — Generate documentation from the graph

```bash
$GN wiki
```

Generates repository documentation from the knowledge graph using an LLM. Requires an API key (saved to `~/.gitnexus/config.json` on first use).

| Flag                | Effect                                    |
| ------------------- | ----------------------------------------- |
| `--force`           | Force full regeneration                   |
| `--model <model>`   | LLM model (default: minimax/minimax-m2.5) |
| `--base-url <url>`  | LLM API base URL                          |
| `--api-key <key>`   | LLM API key                               |
| `--concurrency <n>` | Parallel LLM calls (default: 3)           |
| `--gist`            | Publish wiki as a public GitHub Gist      |

### list — Show all indexed repos

```bash
$GN list
```

Lists all repositories registered in `~/.gitnexus/registry.json`. The MCP `list_repos` tool provides the same information.

### query/context — Unity hydration mode

For Unity resource retrieval:

```bash
$GN context DoorObj --repo neonnew-core --file Assets/NEON/Code/Game/Doors/DoorObj.cs --unity-resources on --unity-hydration compact
```

```bash
$GN query "DoorObj binding" --repo neonnew-core --unity-resources on --unity-hydration compact
```

Rules:

- `--unity-hydration compact` is the default (fast path).
- If response `hydrationMeta.needsParityRetry=true`, rerun with `--unity-hydration parity`.
- `--unity-hydration parity` is completeness-first mode for advanced verification.

### Unity runtime process contract trigger

When CLI analysis targets Unity runtime process semantics (runtime chain closure/confidence), load:

- `_shared/unity-runtime-process-contract.md`

Runtime-process verification examples:

```bash
$GN query "Reload NEON.Game.Graph.Nodes.Reloads" --repo neonspark --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand
```

```bash
$GN context ReloadNode --repo neonspark --unity-resources on --unity-hydration compact --runtime-chain-verify on-demand
```

### unity-ui-trace — Unity UI evidence tracing workflow

For full workflow details, load: `_shared/unity-ui-trace-contract.md`

```bash
$GN unity-ui-trace "Assets/NEON/VeewoUI/Uxml/BarScreen/Patch/PatchItemPreview.uxml" --goal asset_refs --repo neonspark
$GN unity-ui-trace "Assets/NEON/VeewoUI/Uxml/BarScreen/CoreScreen.uxml" --goal template_refs --repo neonspark
$GN unity-ui-trace "Assets/NEON/VeewoUI/Uxml/BarScreen/Patch/PatchItemPreview.uxml" --goal selector_bindings --selector-mode balanced --repo neonspark
```

## After Indexing

1. **Read `gitnexus://repo/{name}/context`** to verify the index loaded
2. Use the other GitNexus skills (`exploring`, `debugging`, `impact-analysis`, `refactoring`) for your task

## Troubleshooting

- **"Not inside a git repository"**: Run from a directory inside a git repo
- **Index is stale after re-analyzing**: Restart Claude Code to reload the MCP server
- **Embeddings slow**: Omit `--embeddings` (it's off by default) or set `OPENAI_API_KEY` for faster API-based embedding
- **`analyze --force` hangs or crashes**: Run `$GN clean --force` to remove the corrupted index, then `$GN analyze --force` to rebuild. Common corruption signatures: `.gitnexus/csv/` exists but `relations.csv` is missing; `.gitnexus/lbug.wal` exists while `lbug` is only a few KB.
- **Stored options invalid warnings**: If `meta.json.analyzeOptions` contains invalid values (e.g., bad alias format, missing `.csproj` file), GitNexus will warn and fall back to defaults. Use `--no-reuse-options` to ignore all stored settings.

## Runtime-Chain Closure Guard

- Treat runtime-chain outputs as two layers:
  - `verifier-core`: binary verifier result (`verified_full` | `failed`)
  - `policy-adjusted`: user-visible result after hydration policy is applied
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, the result is downgraded policy-adjusted output and is not closure.
- In that downgraded state, rerun with parity before final conclusions.
