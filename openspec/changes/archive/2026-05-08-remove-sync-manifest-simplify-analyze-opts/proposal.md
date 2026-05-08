# Proposal

## 问题定义

1. **sync-manifest 机制过于复杂**：`sync-manifest.txt` 作为独立配置文件引入了三层参数优先级（CLI > manifest directive > meta.json），加上 drift guard（`enforceSyncManifestConsistency`）的 ask/update/keep/error 策略，导致非 TTY 环境下频繁报错，Agent 也经常混用参数触发 drift guard。
2. **`csharpDefineCsproj` 未持久化**：用户首次传入 `--csharp-define-csproj` 后，下次 analyze 必须重新手动传入，因为该字段不在 `StoredAnalyzeOptions` / `RepoMeta.analyzeOptions` 中。
3. **配置文件分散**：scope rules、extensions、repoAlias、embeddings 分散在 sync-manifest.txt 的 directive 和 meta.json 中，增加理解和维护成本。

## 范围边界

**In scope:**
- 移除 `sync-manifest.ts`、`sync-manifest.test.ts`、`scope-manifest-config.ts` 三个文件
- 移除 CLI 参数 `--sync-manifest-policy`、`--scope-manifest`、`--scope-prefix`
- 简化 `resolveEffectiveAnalyzeOptions` 为两层优先级（CLI > stored）
- 将 `csharpDefineCsproj` 持久化到 `meta.json.analyzeOptions`
- 新增 `validateStoredOptions()` 校验函数
- 更新 `clean.ts`（移除 `sync-manifest.txt` 保留逻辑）
- 更新 benchmark 子命令（移除 `--scope-manifest` / `--scope-prefix`）
- 更新文档（SKILL.md、INSTALL-GUIDE.md、AGENTS.md、CHANGELOG.md）

**Out of scope:**
- 不修改 pipeline 内部逻辑
- 不修改 MCP server / query 层
- 不修改 `analyze_rules` 相关逻辑

## Capabilities

### New Capabilities
- `stored-options-validation`: 复用 meta.json.analyzeOptions 前的字段合法性校验（格式、文件存在性），校验失败的字段回退到默认值并输出 warn

### Modified Capabilities
- `analyze-options-resolution`: 参数优先级从三层（CLI > manifest > stored）简化为两层（CLI > stored），移除 sync-manifest 文件依赖和 drift guard 机制
- `analyze-csproj-persistence`: `--csharp-define-csproj` 参数持久化到 meta.json.analyzeOptions，复用时自动恢复
- `analyze-cli-interface`: 移除 `--sync-manifest-policy`、`--scope-manifest`、`--scope-prefix` 三个 CLI 参数，同步清理 benchmark 子命令中的同系列参数
- `clean-command-config-preserve`: 移除 clean 命令对 `sync-manifest.txt` 的特殊保留逻辑

## Capabilities 待确认项

- [x] 能力清单已与用户确认

## Impact

- **Breaking change**: 已有 `sync-manifest.txt` 的仓库将不再被 auto-load，依赖该文件的用户需在首次 analyze 时通过 CLI 参数重新指定 scope/extensions 等选项（之后会持久化到 meta.json）
- **Benchmark 命令**: 使用 `--scope-manifest` / `--scope-prefix` 的 benchmark 脚本需更新为 `--extensions` / 直接参数
- **Agent workflow**: SKILL.md 中 Path A/Path B 的区分不再需要，Agent 执行 analyze 更简单

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 项目页：`analyze-options.ts`、`analyze.ts`、`index.ts`、`repo-manager.ts`、`clean.ts`
  - 回写目标：`gitnexus-cli.md`（skill 源文件）、`SKILL.md`（已安装 skill）、`INSTALL-GUIDE.md`、`AGENTS.md`、`CHANGELOG.md`
