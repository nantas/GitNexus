---
name: gitnexus-cli-dev-link
description: "Use when you need to replace the globally installed gitnexus CLI with a symlink to this repository's freshly built dist/cli for cross-repo testing, or uninstall that dev link and restore npm-installed CLI."
---

# GitNexus CLI Dev Link Workflow

Use this workflow to switch your machine-wide `gitnexus` command between:

- npm global package version
- local development build from this repository (`gitnexus/dist/cli/index.js`)

## Preconditions

- Run inside this GitNexus repository (repo root is resolved at runtime)
- Node.js + npm available
- You are allowed to run global npm commands (`npm link`, `npm unlink -g`, `npm install -g`)

## Install Dev CLI (local build -> global symlink)

```bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CLI_PKG_DIR="$REPO_ROOT/gitnexus"

cd "$CLI_PKG_DIR"

# Step 1: Sync dependencies to match package.json declarations
#    This is critical — stale node_modules (e.g. @ladybugdb/core 0.15.x
#    when ^0.16.1 is declared) can cause SIGSEGV at runtime.
npm install

# Step 2: Build from source (clean + tsc)
npm run build

# Step 3: Create global symlink
npm link

# Step 4: Verify
echo "gitnexus path: $(command -v gitnexus)"
ls -l "$(command -v gitnexus)"

# executable-bit guard:
# in some environments the linked dist entry may lose +x and `gitnexus` returns "permission denied"
if ! gitnexus --version >/dev/null 2>&1; then
  chmod +x "$CLI_PKG_DIR/dist/cli/index.js"
  hash -r
fi

gitnexus --version
```

### Why `npm install` before build?

`npm link` reuses the local `node_modules/`. If installed versions drift
from `package.json` declarations (common after git merge/rebase), the
built CLI will link against wrong native modules at runtime. Known
failure mode: `@ladybugdb/core` 0.15.x (SIGSEGV on 8GB heap) vs the
declared `^0.16.1` (fixed). Running `npm install` first ensures
`node_modules/` matches declarations.

Expected result:

- `command -v gitnexus` points to npm global bin
- the bin target resolves to this repo (symlink to current workspace package)

## Uninstall Dev CLI (remove symlink)

```bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CLI_PKG_DIR="$REPO_ROOT/gitnexus"

cd "$CLI_PKG_DIR"
npm unlink -g @veewo/gitnexus

echo "dev symlink removed; reinstall npm package to restore published CLI:"
echo "  npm install -g @veewo/gitnexus"
```

Important:

- `npm unlink -g @veewo/gitnexus` only removes the dev link.
- To get npm published version back, run:

```bash
npm install -g @veewo/gitnexus
```

## Quick Verification

```bash
command -v gitnexus
gitnexus --version
gitnexus setup --help | rg -- '--cli-spec|--cli-version'
```

If you just switched versions, restart the agent/editor session so MCP servers pick up the new CLI process.
