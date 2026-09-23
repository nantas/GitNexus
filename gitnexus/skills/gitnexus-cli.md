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
- `--coding-agent <agents>` selects the upstream detected-editor installer explicitly; it is separate from fork `--scope` / `--agent` wiring.
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

Run `$GN analyze` from the repository root. Recurring defaults live in a committed `.gitnexusrc`; explicit CLI flags override them. `gitnexus.json` (with a legacy `meta.json` mirror) is index state and does not supply analyze option defaults.

Unity example `.gitnexusrc`:

```json
{
  "name": "my-unity-project",
  "includeExtensions": [".cs", ".meta"],
  "scopeRules": ["Assets/", "Packages/com.veewo.*"],
  "csharpDefineCsproj": "Assembly-CSharp.csproj"
}
```

`csharpDefineCsproj` resolves relative to the target repository and selects active C# conditional-compilation branches while preserving source offsets. Scope rules are path prefixes; trailing `*` means prefix wildcard, not general glob syntax.

```bash
$GN analyze --force
# Temporary overrides:
$GN analyze --extensions .cs,.meta --scope Assets/,Packages/ --csharp-define-csproj Assembly-CSharp.csproj
```

Changes to effective scope/extensions or C# define symbols automatically rebuild the graph, even on a clean unchanged Git HEAD. External csproj symbol changes are included. Older indexes without an analysis-input receipt rebuild once; unchanged inputs retain the fast path.


Use `$GN analyze --help` for available flags. `--index-only` skips context and skill generation; `--skip-agents-md` and `--skip-skills` control those outputs separately. `--name` selects a registry name; `--repo-alias` is a compatibility alias.

After a failed or timed-out analyze, report the exact error and inspect the cause before another run. For Unity runtime validation, use the shared runtime-process and hydration contracts below.

### status — Check index freshness

```bash
$GN status
```

Shows whether the current repo has a GitNexus index, when it was last updated, and symbol/relationship counts. Use this to check if re-indexing is needed.

### clean — Delete the index

```bash
$GN clean --force
```

Removes index data while preserving `.gitnexus/config.json`, `.gitnexus/meta.json`, and `.gitnexus/.gitnexusignore`. Recurring analyze defaults remain in the repository `.gitnexusrc`; the next analyze rebuilds derived data.

| Flag      | Effect                                            |
| --------- | ------------------------------------------------- |
| `--force` | Skip confirmation prompt                          |
| `--all`   | Clean all indexed repos, not just the current one |

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
- **`analyze --force` hangs or crashes**: Run `$GN clean --force` to remove the corrupted index, then `$GN analyze --force` (with your CLI options) to rebuild. Common corruption signatures: `.gitnexus/csv/` exists but `relations.csv` is missing; `.gitnexus/lbug.wal` exists while `lbug` is only a few KB.

## Runtime-Chain Closure Guard

- Treat runtime-chain outputs as two layers:
  - `verifier-core`: binary verifier result (`verified_full` | `failed`)
  - `policy-adjusted`: user-visible result after hydration policy is applied
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, the result is downgraded policy-adjusted output and is not closure.
- In that downgraded state, rerun with parity before final conclusions.


## Additional analyze modes

- `--pdg` enables the control/data dependence and taint layers used by `pdg_query` and `explain`.
- `--asyncapi-spec <path>` imports an AsyncAPI contract alongside code analysis.
- `node .gitnexus/run.cjs <command>` selects an available runner and preserves a configured package pin. Before the runner exists, resolve `cliPackageSpec` / `cliVersion` from `~/.gitnexus/config.json`; `bunx <resolved-spec> analyze` is an alternative bootstrap when only Bun is installed.
