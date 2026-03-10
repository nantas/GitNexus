# GitNexus Agent 安装与索引验收通用指南（任意仓库）

本指南面向“任何 coding agent”，目标是在**任意 Git 仓库**完成以下闭环：

1. 全局安装 `@veewo/gitnexus` CLI
2. 执行 `gitnexus setup`（按用户选择 `global/project` + `--agent`）
3. 与用户确认索引范围，生成 `.gitnexus/sync-manifest.txt`
4. 执行 `gitnexus analyze` 构建索引
5. 完成检索测试验收（`query/context/impact/cypher`）

## 一句话指令模板（给任意 agent）

把下面这句话直接发给 agent：

```text
阅读 https://raw.githubusercontent.com/nantas/GitNexus/refs/heads/nantas-dev/INSTALL-GUIDE.md ，并在当前仓库完成 GitNexus 安装、setup、索引构建和检索验收；按文档先与我确认 agent 类型与索引范围，再执行。
```

如果你在本地使用，可改为本地路径：

```text
阅读 /path/to/repo/INSTALL-GUIDE.md ，并在当前仓库完成 GitNexus 安装、setup、索引构建和检索验收；按文档先与我确认 agent 类型与索引范围，再执行。
```

## 0. 执行前必须确认（先问用户）

在执行命令前，先确认这 4 项：

1. `setup` 作用域：`global` 或 `project`
2. 目标 agent：`claude` / `opencode` / `codex`
3. 索引范围：全量还是 scoped（若 scoped，确认要包含/排除的目录）
4. 验收输入：至少 2-3 个业务关键词，以及 1-2 个关键符号名（用于 `context/impact`）

## 1. 安装与版本确认

在任意仓库内可执行：

```bash
npm uninstall -g gitnexus
npm install -g @veewo/gitnexus

which gitnexus
gitnexus --version
npm view @veewo/gitnexus version --registry=https://registry.npmjs.org
```

通过标准：

- `gitnexus --version` 与 npm 最新版本一致（或符合团队指定版本）
- `which gitnexus` 指向当前有效的全局安装路径

## 2. Setup（严格按 agent 选择执行）

`setup` 必须传 `--agent <claude|opencode|codex>`。

### 2.1 Global 示例

```bash
gitnexus setup --agent claude
gitnexus setup --agent opencode
gitnexus setup --agent codex
```

### 2.2 Project 示例（在目标 repo 根目录）

```bash
gitnexus setup --scope project --agent claude
gitnexus setup --scope project --agent opencode
gitnexus setup --scope project --agent codex
```

### 2.3 预期改动

- `global + claude`：提示 `claude mcp add ...`，并安装全局 skills（Claude hooks 仅在该模式处理）
- `global + opencode`：写 `~/.config/opencode/opencode.json`（存在旧文件时兼容 `config.json`）+ 全局 skills
- `global + codex`：执行 `codex mcp add ...` + 全局 skills
- `project + claude`：写 `<repo>/.mcp.json` + 项目 skills
- `project + opencode`：写 `<repo>/opencode.json` + 项目 skills
- `project + codex`：写 `<repo>/.codex/config.toml` + 项目 skills

## 3. 进入目标仓库并确认 alias 策略

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
```

推荐 alias 长期模式（同一 repo + 同一 scope 长期复用），例如：

```bash
ALIAS="$(basename "$REPO_ROOT")-core"
```

## 4. 生成 scoped manifest（若用户选择 scoped）

manifest 统一放在：`.gitnexus/sync-manifest.txt`

```bash
mkdir -p .gitnexus
cat > .gitnexus/sync-manifest.txt <<'EOF'
# 一行一个路径前缀；支持 * 通配（末尾）
src
packages
EOF
```

注意：

- 这里的目录内容必须先由用户确认，不要直接套用固定模板
- 若用户选择全量索引，可跳过 manifest，直接全量 analyze

## 5. 执行 Analyze

### 5.1 Scoped（推荐）

```bash
gitnexus analyze \
  --repo-alias "$ALIAS" \
  --scope-manifest .gitnexus/sync-manifest.txt
```

可按仓库语言补充扩展名过滤，例如：

```bash
gitnexus analyze \
  --repo-alias "$ALIAS" \
  --scope-manifest .gitnexus/sync-manifest.txt \
  --extensions .ts,.tsx,.js,.jsx
```

### 5.2 Full（全量）

```bash
gitnexus analyze --repo-alias "$ALIAS"
```

预期结果：

- 生成/更新 `<repo>/.gitnexus/`
- 生成/更新 `<repo>/AGENTS.md` 和 `<repo>/CLAUDE.md`
- skills 安装路径遵循 `setup` 作用域

## 6. 验收测试（必须执行）

### 6.1 基础状态

```bash
gitnexus status
gitnexus list
```

通过标准：

- `status` 可读且状态合理（`up-to-date` 或可解释的 `stale`）
- `list` 中可看到目标 alias 与正确路径

### 6.2 Query（用用户给出的业务关键词）

> Unity 资源增强默认关闭（`unity_resources=off`）。仅在需要 Unity 资源字段时加 `--unity-resources on`。

```bash
gitnexus query "<keyword-1>" --repo "$ALIAS" --limit 5
gitnexus query "<keyword-2>" --repo "$ALIAS" --limit 5
# 如需 Unity 资源增强：
gitnexus query "<keyword-1>" --repo "$ALIAS" --limit 5 --unity-resources on
```

通过标准：

- 返回结果与目标业务链路相关
- 前排结果没有明显跨模块噪声

### 6.3 Context / Impact（用用户给出的关键符号）

```bash
gitnexus context "<symbol-1>" --repo "$ALIAS"
# 如需 Unity 资源增强：
gitnexus context "<symbol-1>" --repo "$ALIAS" --unity-resources on
gitnexus impact "<symbol-1>" --repo "$ALIAS" --depth 3
```

如果 `context` 出现同名歧义：

```bash
gitnexus context "<symbol-1>" --repo "$ALIAS" -f "<relative/file/path>"
# 或
gitnexus context --repo "$ALIAS" -u "<uid>"
```

### 6.4 Cypher 抽样

```bash
gitnexus cypher "MATCH (n) RETURN count(n) AS total_nodes" --repo "$ALIAS"
```

通过标准：

- 查询可执行
- `total_nodes > 0`

## 7. 交付模板（agent 输出）

```markdown
- CLI version: @veewo/gitnexus@x.y.z
- Setup scope/agent: global|project + claude|opencode|codex
- Analyze mode: scoped|full
- Repo alias: <alias>
- Manifest: .gitnexus/sync-manifest.txt（若 scoped）
- Status: PASS/FAIL
- Query: PASS/FAIL
- Context: PASS/FAIL
- Impact: PASS/FAIL
- Cypher: PASS/FAIL
- 结论: 可进入任务执行 / 需补充范围或重建索引
```

## 8. 全局注册维护（可选）

全局注册文件在 `~/.gitnexus/registry.json`，常用维护命令：

```bash
gitnexus analyze [path]      # 注册/更新
gitnexus list                # 查看（会清理失效项）
gitnexus clean --force       # 反注册当前仓库
gitnexus clean --all --force # 全量清理
```

## 9. 验收完成后的会话重启要求（必须提示用户）

当安装、`setup`、`analyze`、检索验收全部通过后，agent 必须明确提示用户：

1. 退出当前 coding agent CLI 会话
2. 在目标仓库重新启动 coding agent CLI

原因：

- MCP 配置在部分工具中只会在会话启动时加载
- 不重启会话可能导致“配置已写入但当前会话仍未连接 MCP”的假象
