# Proposal

## 问题定义

当前 `gitnexus setup --scope project` 安装 MCP 接线和 skills，但不会生成仓库根目录的 `.gitnexusrc`。旧版索引可能在 `.gitnexus/gitnexus.json` 或 `.gitnexus/meta.json` 中留有 `analyzeOptions`；新版 `analyze` 不再把该字段当作默认配置。升级后直接重建，可能把原本受限的索引范围扩成全仓，增加耗时并改变检索覆盖面。

需要让项目级 setup 在用户确认后创建可长期维护的 `.gitnexusrc`，并能从旧索引元数据提取可证明的配置候选。迁移结果应让用户看到字段来源、冲突和缺口，而不是把上次运行状态直接视为未来意图。

## 范围边界

- 项目级 setup：识别已有 rc，或在缺失时生成新配置、提供旧元数据迁移预览；交互式确认后写入。非交互运行需显式选择模式和足够的范围参数才能写入。
- 迁移只读取属于当前仓库的主元数据文件；仅当 `gitnexus.json` 明确不存在时才读 `meta.json`。以 `indexCoverage` 表达上次实际的 scope/extensions，并使用旧 `analyzeOptions` 补充可验证选项。
- rc 写入须通过当前 analyze 配置校验，保持已有 rc 字节不变，采用不可覆盖的创建方式。setup 结果须报告 `created`、`preserved`、`pending`、`skipped` 或 `failed` 及后续分析命令。
- 全局 setup 和 `--coding-agent` 路径不创建仓库 rc。setup 不运行 `analyze`、`clean`，不打开或修复 LadybugDB，不改写索引元数据。
- 本 change 不包含此前独立处理的 FTS 错误判定修复。`runnerIdentity` 与 `schemaFingerprint` 仅用于说明索引状态，不被表述为数据库文件版本。

## Capabilities

### New Capabilities

- `setup-repository-analyze-config`: 项目级 setup 能安全创建 `.gitnexusrc`，并在用户确认后从旧索引元数据迁移可证明的分析选项。

### Modified Capabilities

无。本次不改变 `analyze` 的选项优先级或索引写入行为；现有相关规范若描述旧版复用语义，作为后续规范清理问题单独处理。

## Capabilities 待确认项

- [x] 能力 ID 与边界已按用户确认的完整方案确定；本 change 只新增 `setup-repository-analyze-config`。

## Impact

- CLI 入口与 setup 编排：`gitnexus/src/cli/index.ts`、`gitnexus/src/cli/setup.ts`。
- 新迁移模块需复用 `gitnexus/src/cli/analyze-config.ts` 的校验规则，以及 `gitnexus/src/storage/repo-meta.ts` 的主文件优先读取语义；不得复制一套放宽的 rc 解析器。
- 现有项目级 setup 的自动化调用将看到新的 `Analysis config: pending` 提示；没有 TTY 时不得出现阻塞式提问，也不得擅自生成全量配置。
- 测试和文档：setup/config 定向测试、CLI help、`docs/gitnexus-config-files.md`、`INSTALL-GUIDE.md`、安装源 `gitnexus/skills/gitnexus-cli.md` 及其仓内副本。
- 风险重点：范围意外扩大、主元数据损坏后的错误回退、已有 rc 覆盖、分支索引范围不一致。规范场景和验收任务将逐一覆盖。

## 关联绑定

- 关联 binding：`binding.md`。
- 标准页：`repo://orbitos/99_系统/Harness/OrbitOS_Spec_Standard/OrbitOS_Spec_Standard_v0.3.md`。
- 项目页：`repo://orbitos/20_项目/GitNexus 开发/Project_GitNexus.md`。
- 回写目标：`repo://orbitos/20_项目/GitNexus 开发/Project_GitNexus_Progress.md`。
