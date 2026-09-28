# GitNexus Agent 安装与索引验收通用指南(任意仓库)

本指南面向"任何 coding agent",目标是在**任意 Git 仓库**完成以下闭环:

1. 全局安装 `@veewo/gitnexus` CLI
2. 执行 `gitnexus setup`(按用户选择 `global/project` + `--agent`)
3. 根据 `.gitnexusrc` 和旧索引覆盖记录确认索引范围
4. 执行 `gitnexus analyze` 构建索引
5. 完成检索测试验收(`query/context/impact/cypher`)

## 版本与执行策略(必须遵守)

- **首次安装阶段**:如果 release prompt 指定了版本号(例如 `@veewo/gitnexus@<VERSION>`),必须先安装这个指定版本;**此时不能先读取旧的 `~/.gitnexus/config.json` 作为版本源**
- `setup` 完成后,`~/.gitnexus/config.json` 才是 npx 版本源的单一事实来源
- 整个会话只能有一个 CLI 版本源,禁止混用本地 `gitnexus` / 固定 `npx` 包版本 / `latest`
- 若用户在 prompt 指定版本,必须先用该版本完成安装/启动,再通过 `setup --cli-version` 或 `setup --cli-spec` 写入 `~/.gitnexus/config.json`
- 整个流程统一复用 `$GN`,不要在中途手写新的 npx 包版本
- `setup` 支持写入版本源:`--cli-version <version>` 或 `--cli-spec <packageSpec>`

```bash
BOOTSTRAP_CLI_SPEC="@veewo/gitnexus@<VERSION>"   # 由 release prompt 显式提供

# 第一次安装/切到指定版本:先以 prompt 指定版本为准
npm uninstall -g gitnexus
npm install -g "$BOOTSTRAP_CLI_SPEC"

GN="gitnexus"
```

## 一句话指令模板(给任意 agent)

把下面这句话直接发给 agent(URL 指向本文件的 raw 地址):

```text
严格按照 https://raw.githubusercontent.com/nantas/GitNexus/refs/heads/nantas-dev/INSTALL-GUIDE.md 在当前仓库完成 GitNexus 首次安装、project 级 setup、索引构建和检索验收;先安装本次发布版本 @veewo/gitnexus@<VERSION>,再执行 setup 写入 config.json,不要简化步骤,也不要绕过文档里的 scope 和 C# define 要求。
```

如果目标仓库已安装 GitNexus 且有 INSTALL-GUIDE 本地副本,可改为本地路径(替换为实际绝对路径):

```text
严格按照 <INSTALL-GUIDE.md 的绝对路径> 在当前仓库完成 GitNexus 首次安装、project 级 setup、索引构建和检索验收;先安装本次发布版本 @veewo/gitnexus@<VERSION>,再执行 setup 写入 config.json,不要简化步骤,也不要绕过文档里的 scope 和 C# define 要求。
```

> **注意**:不要使用 `/path/to/repo/INSTALL-GUIDE.md` 占位路径。必须替换为实际路径或直接使用上方 URL 版本。

## 0. 执行前必须确认(先检查,再确认)

在执行命令前,先确认这 3 项:

1. `setup` 作用域:`global` 或 `project`
2. 目标 agent:`claude` / `opencode` / `codex`
3. 索引范围决策:
   - 先检查仓库根目录 `.gitnexusrc`;它是后续 analyze 的配置来源。项目级 `setup` 可在确认计划后生成它
   - 若文件缺失,查看 `.gitnexus/gitnexus.json`(或旧版 `meta.json`)的 `indexCoverage` 和可能存在的旧 `analyzeOptions`,作为上次范围的线索
   - 向用户复述并确认目标 scope、extensions、仓库名与 C# 项目;若无可靠旧记录,确认全量或指定范围
   - 项目级 setup 展示迁移计划并确认后创建 `.gitnexusrc`;索引元数据本身不会自动成为下次 analyze 的默认选项
4. 验收输入:至少 2-3 个业务关键词,以及 1-2 个关键符号名(用于 `context/impact`)

## 1. 安装与版本确认

先区分两个阶段:

- **阶段 A:首次安装 / 按 release prompt 切换到指定版本**
  - 版本号来自当前 release prompt,例如 `@veewo/gitnexus@1.5.0`
  - 这一步**不要先读** `~/.gitnexus/config.json`
- **阶段 B:`setup` 完成之后**
  - 才允许把 `~/.gitnexus/config.json` 当作后续 npx fallback 的版本源

### 1.1 首次安装或切换到 release 指定版本

在任意仓库内可执行:

```bash
BOOTSTRAP_CLI_SPEC="@veewo/gitnexus@<VERSION>"

npm uninstall -g gitnexus
npm install -g "$BOOTSTRAP_CLI_SPEC"

which gitnexus
gitnexus --version
npm view @veewo/gitnexus version --registry=https://registry.npmjs.org
GN="gitnexus"
```

通过标准:

- `gitnexus --version` 等于本次 release prompt 指定版本
- `which gitnexus` 指向当前有效的全局安装路径

### 1.2 setup 完成后,如何从 config 恢复会话版本源

仅在 `setup` 已经把目标版本写入 `~/.gitnexus/config.json` 之后,才使用下面这段逻辑:

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

通过标准:

- `setup` 后写入的 `cliPackageSpec` / `cliVersion` 与本次 release 指定版本一致
- 后续 session 不会再回退到旧的 rc 版本

## 2. Setup(严格按 agent 选择执行)

`setup` 必须传 `--agent <claude|opencode|codex>`。
若用户在 prompt 指定版本,必须同时传 `--cli-version` 或 `--cli-spec`,确保 MCP 配置与当前会话一致。

**首次在仓库内接入时,默认推荐 `--scope project`。**
原因:首次接入最常见的目标是让当前仓库马上可用,并把 `.mcp.json` / `.codex/config.toml` / `opencode.json`、repo-local skills 和 AI context 文件一并落到仓库里,减少"全局已装好但当前仓库未接线"的误判。

### 2.1 Global 示例

```bash
$GN setup --agent claude --cli-spec "$GITNEXUS_CLI_SPEC"
$GN setup --agent opencode --cli-spec "$GITNEXUS_CLI_SPEC"
$GN setup --agent codex --cli-spec "$GITNEXUS_CLI_SPEC"
```

### 2.2 Project 示例(在目标 repo 根目录)

```bash
$GN setup --scope project --agent claude --cli-spec "$GITNEXUS_CLI_SPEC"
$GN setup --scope project --agent opencode --cli-spec "$GITNEXUS_CLI_SPEC"
$GN setup --scope project --agent codex --cli-spec "$GITNEXUS_CLI_SPEC"
```

### 2.3 预期改动

- `global + claude`:提示 `claude mcp add ...`,并安装全局 skills(Claude hooks 仅在该模式处理)
- `global + opencode`:写 `~/.config/opencode/opencode.json`(存在旧文件时兼容 `config.json`)+ 全局 skills
- `global + codex`:执行 `codex mcp add ...` + 全局 skills
- `project + claude`:写 `<repo>/.mcp.json` + 项目 skills
- `project + opencode`:写 `<repo>/opencode.json` + 项目 skills
- `project + codex`:写 `<repo>/.codex/config.toml` + 项目 skills

> **提交策略建议**:`setup` 和 `analyze` 会修改/生成多个文件(`.mcp.json`、`AGENTS.md`、`CLAUDE.md`、`.agents/skills/` 等)。建议将这些工具变更单独提交(如 `chore: gitnexus setup + analyze`),与业务代码改动分开,方便 review 和回滚。

## 3. 进入目标仓库并确认 alias 策略

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
```

推荐 alias 长期模式(同一 repo + 同一 scope 长期复用),例如:

```bash
ALIAS="$(basename "$REPO_ROOT")-core"
```

## 4. Scope 决策与 analyze 选项

执行顺序(必须遵守):

1. 先检查仓库根目录 `.gitnexusrc`。若存在,检查其中的 `scopeRules`、`includeExtensions`、`name` 和 `csharpDefineCsproj` 是否仍符合目标范围。
2. 若缺失,读取 `.gitnexus/gitnexus.json`(或旧版 `.gitnexus/meta.json`)中的 `indexCoverage`。旧 `analyzeOptions` 若存在,也只作为历史线索,不是下次运行的默认值。
3. 向用户确认目标范围。没有可靠旧记录时,必须询问全量还是指定 scope,禁止默认全量执行。
4. 将确认后的长期配置写入 `.gitnexusrc`,然后运行 analyze。CLI 显式选项会覆盖该配置。

项目级 `setup` 默认使用 `--rc-mode auto`。有 TTY 时展示计划、询问缺失的路径和扩展名并确认创建；非交互调用显示 `Analysis config: pending`，不会写入缺失的 rc。脚本可用 `--rc-mode migrate --accept-rc` 接受完整且无冲突的旧索引计划，或用 `--rc-mode create --rc-scope Assets/,Packages/ --rc-extensions .cs,.meta --accept-rc` 明确新范围；两个选择都可填 `all` 表示全量。`--scope project` 选择安装位置，`--rc-scope` 选择分析路径。`clean --force` 保留配置和旧元数据,但删除索引数据;清理前仍须确认重建范围。

```bash
if [ -f .gitnexusrc ]; then
  echo "Found repository analyze defaults in .gitnexusrc"
else
  echo "No .gitnexusrc; inspect old index coverage and confirm scope before analyze."
fi
```

**analyze 选项规则:**

- 长期选项写在 `.gitnexusrc`;仅一次性使用的 CLI 选项不会自动成为下次默认值
- `gitnexus.json` / `meta.json` 记录索引状态与上次覆盖范围,不提供 analyze 默认选项
- 变更 scope、extensions 或 C# define 配置会触发重建

### 4.1 Unity 项目首次接入(推荐做法)

如果当前仓库是 Unity 项目,首次接入时推荐指定 scope 和 extensions:

```bash
$GN analyze --force \
  --extensions ".cs,.meta" \
  --scope "Assets/,Packages/" \
  --repo-alias "<repo-alias>" \
  --csharp-define-csproj <path-to-Assembly-CSharp.csproj>
```

说明:

- `--extensions ".cs,.meta"` 用于启用 Unity 资源边所需的 C# 与 `.meta` 解析
- `--scope "Assets/,Packages/"` 限制索引范围到 Unity 项目目录,跳过 `Library/`、`Temp/`、`obj/`
- `--repo-alias` 建议一并传入,减少后续命令重复传参
- `--csharp-define-csproj` 用于加载 `DefineConstants` 做条件编译归一化
- 将这些长期选项写入 `.gitnexusrc` 后,后续才可只用 `$GN analyze --force`

## 5. 执行 Analyze

### 5.1 使用仓库配置(推荐)

```bash
$GN analyze --force
```

以上命令读取 `.gitnexusrc`,不会复用 `meta.json.analyzeOptions`。如需临时覆盖特定选项,显式传入即可:

```bash
$GN analyze --force --repo-alias "$ALIAS"
```

### 5.1.1 Unity 首次构建索引(推荐命令)

```bash
$GN analyze --force \
  --extensions ".cs,.meta" \
  --scope "Assets/,Packages/" \
  --repo-alias "$ALIAS" \
  --csharp-define-csproj <path-to-Assembly-CSharp.csproj>
```

规则:

- Unity 项目推荐传入 `--extensions ".cs,.meta"`、`--scope "Assets/,Packages/"` 和 `--repo-alias`
- `--csharp-define-csproj` 用于加载 `DefineConstants` 做条件编译归一化
- 后续 rebuild 只需 `$GN analyze --force` 的前提是已把长期选项写入 `.gitnexusrc`

### 5.2 Full(全量)

```bash
$GN analyze --force --repo-alias "$ALIAS"
```

预期结果:

- 生成/更新 `<repo>/.gitnexus/`
- 生成/更新 `<repo>/AGENTS.md` 和 `<repo>/CLAUDE.md`
- skills 安装路径遵循 `setup` 作用域

## 6. 验收测试(必须执行)

> **验收以 CLI 为准**:CLI 直接读取最新索引,MCP 可能使用会话缓存。如果 CLI 验收通过但 MCP 结果不一致,先完成 CLI 验收,然后按第 9 节重启会话后再做 MCP 验收。

### 6.1 基础状态

```bash
$GN status
$GN list
```

通过标准:

- `status` 可读且状态合理(`up-to-date` 或可解释的 `stale`)
- `list` 中可看到目标 alias 与正确路径

### 6.2 Query(用用户给出的业务关键词)

> Unity 资源增强默认关闭(`unity_resources=off`)。仅在需要 Unity 资源字段时加 `--unity-resources on`。

```bash
$GN query "<keyword-1>" --repo "$ALIAS" --limit 5
$GN query "<keyword-2>" --repo "$ALIAS" --limit 5
# 如需 Unity 资源增强:
$GN query "<keyword-1>" --repo "$ALIAS" --limit 5 --unity-resources on
```

通过标准:

- 返回结果与目标业务链路相关
- 前排结果没有明显跨模块噪声

### 6.3 Context / Impact(用用户给出的关键符号)

```bash
$GN context "<symbol-1>" --repo "$ALIAS"
# 如需 Unity 资源增强:
$GN context "<symbol-1>" --repo "$ALIAS" --unity-resources on
$GN impact "<symbol-1>" --repo "$ALIAS" --depth 3
```

如果 `context` 出现同名歧义:

```bash
$GN context "<symbol-1>" --repo "$ALIAS" -f "<relative/file/path>"
# 或
$GN context --repo "$ALIAS" -u "<uid>"
```

### 6.4 Cypher 抽样

```bash
$GN cypher "MATCH (n) RETURN count(n) AS total_nodes" --repo "$ALIAS"
```

通过标准:

- 查询可执行
- `total_nodes > 0`

## 7. 交付模板(agent 输出)

```markdown
- CLI version: @veewo/gitnexus@x.y.z
- Setup scope/agent: global|project + claude|opencode|codex
- Analyze mode: scoped|full
- Repo alias: <alias>
- Analyze defaults: .gitnexusrc（确认 scope / extensions / name / csharpDefineCsproj）
- Status: PASS/FAIL
- Query: PASS/FAIL
- Context: PASS/FAIL
- Impact: PASS/FAIL
- Cypher: PASS/FAIL
- 结论: 可进入任务执行 / 需补充范围或重建索引
```

## 8. 全局注册维护(可选)

全局注册文件在 `~/.gitnexus/registry.json`,常用维护命令:

```bash
$GN analyze [path]      # 注册/更新
$GN list                # 查看(会清理失效项)
$GN clean --force       # 反注册当前仓库
$GN clean --all --force # 全量清理
```

## 9. 验收完成后的会话重启要求(必须提示用户)

当安装、`setup`、`analyze`、检索验收全部通过后,agent 必须明确提示用户:

1. 退出当前 coding agent CLI 会话
2. 在目标仓库重新启动 coding agent CLI

原因:

- MCP 配置在部分工具中只会在会话启动时加载
- 不重启会话可能导致"配置已写入但当前会话仍未连接 MCP"的假象
