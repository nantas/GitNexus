# Verification

规范真源：[setup-repository-analyze-config/spec.md](specs/setup-repository-analyze-config/spec.md)。

## 实现接口与状态

- `analyze-config.ts` 导出原有 `parseAnalyzeConfig`，setup 候选和 analyze 实际读取使用同一键值规范化与报错规则。
- `setup-analyze-config.ts` 使用 `getStoragePath`、`branchSlug` 和 `getCurrentBranch` 定位 flat/活动分支元数据；新增 `absent|valid|invalid` 只读状态，保留主文件损坏与主文件缺失的区别。
- `setup.ts` 在全局 CLI 配置、MCP、skill 写入前完成 rc 预检；rc 创建使用同目录临时文件、`sync`、原子硬链接安装和清理。

## Scenario 证据映射

`evidence_map[]`：下表每一行是一条证据记录；`evidence_ref` 为本仓可解析路径，`external_ref` 为对应的跨仓证据文件引用。所有 `verification_result` 均为 `pass`。

| scenario_key | evidence_ref | external_ref | verification_result |
| --- | --- | --- | --- |
| project-default-auto | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| global-setup-does-not-select-a-repository | `gitnexus/src/cli/setup.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup.test.ts` | pass |
| explicit-repository-mode-requires-project-scope | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| new-repository-needs-selection | `openspec/changes/archive/2026-09-28-setup-gitnexusrc-migration/verification.md` | `//repo://gitnexus/openspec/changes/archive/2026-09-28-setup-gitnexusrc-migration/verification.md` | pass |
| coverage-and-legacy-conflict | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| missing-primary-uses-legacy-mirror | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| corrupt-primary-does-not-fall-back | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| copied-or-divergent-index-is-not-migrated-silently | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| v159-legacy-options | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| coverage-only-receipt | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| missing-array-is-not-full-selection | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| noninteractive-auto-remains-pending | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| explicit-scripted-scoped-create | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| incomplete-explicit-request-fails-early | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| repeated-setup-preserves-existing-rc | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| invalid-existing-rc-fails-before-writes | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| concurrent-creator-wins | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |
| confirmed-migration-has-next-step | `openspec/changes/archive/2026-09-28-setup-gitnexusrc-migration/verification.md` | `//repo://gitnexus/openspec/changes/archive/2026-09-28-setup-gitnexusrc-migration/verification.md` | pass |
| skipped-or-pending-is-not-ready | `gitnexus/src/cli/setup-analyze-config.test.ts` | `//repo://gitnexus/gitnexus/src/cli/setup-analyze-config.test.ts` | pass |

| Requirement | Scenario | 证据 | 状态 |
| --- | --- | --- | --- |
| project-setup-rc-modes | project-default-auto | `setup-analyze-config.test.ts` 非 TTY pending、现有 `setup.test.ts` 项目 MCP 安装 | pass |
| project-setup-rc-modes | global-setup-does-not-select-a-repository | 现有 `setup.test.ts` global；新 `coding-agent route rejects...` | pass |
| project-setup-rc-modes | explicit-repository-mode-requires-project-scope | `global explicit rc request...`、`coding-agent route rejects...`；CLI help 列出全部 rc 选项 | pass |
| rc-plan-before-write | new-repository-needs-selection | TTY 临时仓库交互输入 `Assets/` 与 `.cs` 后确认；非 TTY pending 测试 | pass |
| rc-plan-before-write | coverage-and-legacy-conflict | `coverage wins but disagreement...` | pass |
| metadata-source-integrity | missing-primary-uses-legacy-mirror | `missing primary uses mirror...` | pass |
| metadata-source-integrity | corrupt-primary-does-not-fall-back | 同上；mirror 前后字节一致 | pass |
| metadata-source-integrity | copied-or-divergent-index-is-not-migrated-silently | `foreign ownership and divergent branch...` | pass |
| supported-legacy-option-mapping | v159-legacy-options | `scripted legacy migration...`，逐字段断言 | pass |
| supported-legacy-option-mapping | coverage-only-receipt | `coverage-only receipt retains...` | pass |
| supported-legacy-option-mapping | missing-array-is-not-full-selection | `unknown selection remains pending...` | pass |
| interactive-and-scripted-creation | noninteractive-auto-remains-pending | `CLI non-TTY auto stays pending...`、端到端 pending | pass |
| interactive-and-scripted-creation | explicit-scripted-scoped-create | `CLI non-TTY auto...` 中的显式 create | pass |
| interactive-and-scripted-creation | incomplete-explicit-request-fails-early | `global explicit...`、`unknown selection...` | pass |
| rc-validation-and-preservation | repeated-setup-preserves-existing-rc | `CLI non-TTY auto...`、端到端二次 setup 哈希 | pass |
| rc-validation-and-preservation | invalid-existing-rc-fails-before-writes | `invalid or linked rc...` | pass |
| rc-validation-and-preservation | concurrent-creator-wins | `no-overwrite creation...`、`interrupted install cleans staging...` | pass |
| setup-result-and-rebuild-boundary | confirmed-migration-has-next-step | `scripted legacy migration...`、CLI 摘要；元数据哈希一致、无 lbug | pass |
| setup-result-and-rebuild-boundary | skipped-or-pending-is-not-ready | `skip leaves an invalid rc unread...`、非 TTY pending 摘要 | pass |

## 执行记录

- Node 24 `npm run build`：通过，1200 秒超时包装器。
- Node 24 `node --test dist/cli/setup-analyze-config.test.js dist/cli/setup.test.js dist/cli/analyze-options.test.js`：30/30 通过，1200 秒超时包装器。首轮 20/21 的失败由无提交 fixture 引起；用户授权后修正并重跑通过。
- 临时仓库端到端：TTY auto 创建 exit 0、rc `{"scopeRules":["Assets/"],"includeExtensions":[".cs"]}`；非 TTY auto pending exit 0、rc 缺失；显式 legacy migrate exit 0、rc `{"scopeRules":["Assets/"],"includeExtensions":[".cs"],"name":"legacy"}`；二次 setup preserved exit 0。
- 上述四次命令均在隔离的临时 Git 仓库和 HOME 下执行：`node dist/cli/index.js setup --scope project --agent opencode`（TTY、非 TTY、二次 setup）及 `node dist/cli/index.js setup --scope project --agent opencode --rc-mode migrate --accept-rc`。TTY 输入依次为 `Assets/`、`.cs`、`y`；所有进程 exit 0。
- 元数据 `gitnexus.json` 与 `meta.json` 迁移前后 SHA-256 均为 `9b47d0d62df70bd8f54331ddcab6768541ae9e8e8da49cd093af7fea02aba58f`。二次 setup 前后 rc SHA-256 均为 `3afbe82b9e0b6d6d39fe1cbabf80f79c615713900f043fdf752842253faf0495`。
- `git diff --check`：通过。`openspec validate setup-gitnexusrc-migration --strict`：通过。

## 结论

规范场景与实现验证为 **pass**。用户于 2026-09-28 授权的 OrbitOS 治理回写已完成：进度页与项目主页均记录同一 handoff ID，详见 [writeback.md](writeback.md)。本段执行记录形成时实现工作树尚未提交；后续已提交实现、同步主规格并归档此 change。
