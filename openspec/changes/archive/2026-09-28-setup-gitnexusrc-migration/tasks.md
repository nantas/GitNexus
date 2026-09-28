# Tasks

规范真源：[setup-repository-analyze-config/spec.md](specs/setup-repository-analyze-config/spec.md)。每项完成时在对应测试或 CLI 输出中保留可定位证据。

## 1. Spec 覆盖与实现准备

- [x] 1.1 对照 spec 的七个 Requirement 与当前 `setup.ts`、`index.ts`、`analyze-config.ts`、`repo-meta.ts`，列出实际可复用接口及必须新增的读取状态；完成标准：实现没有第二套 rc 键值校验规则。
- [x] 1.2 确认当前存储 resolver、flat/branch metadata 路径和 `repoPath` 归属规则；用临时仓库 fixture 证明主文件损坏与主文件缺失可被区分。

## 2. 核心实现任务

- [x] 2.1 在 `gitnexus/src/cli/index.ts` 注册 `--rc-mode`、`--accept-rc` 和 `--rc-*` 选择项，并在 `setup.ts` 拒绝 global/`--coding-agent` 与显式 rc 创建模式的非法组合；验证 `project-setup-rc-modes` 的三个 Scenario 和 CLI help。
- [x] 2.2 将 `analyze-config.ts` 的 JSON 解析/规范化提取为迁移可复用的校验入口，维持现有 analyze 测试通过；验证非法键、类型、名称与路径的报错一致。
- [x] 2.3 实现只读元数据读取状态和目标仓归属检查：主文件优先、仅明确缺失时回退 mirror、损坏/异仓报错、活动分支与 flat 选区冲突；用 `metadata-source-integrity` 四组 fixture 验证不改元数据。
- [x] 2.4 实现 `setup-analyze-config.ts` 的计划生成：覆盖记录/旧选项优先级、逐字段来源、冲突、空数组与缺失字段区别、受支持的旧字段映射和可选文件大小换算；用 v1.5.9 与 coverage-only fixtures 验证 `rc-plan-before-write`、`supported-legacy-option-mapping`。
- [x] 2.5 实现项目 setup 的 TTY 确认与非 TTY `pending`/显式模式预检；验证新仓必须选择 paths/extensions、非 TTY 不读 stdin、显式输入不完整时在任何 MCP/skill 写入前非零退出。
- [x] 2.6 实现不可覆盖的 `.gitnexusrc` 创建和已有文件校验/保留；用重复 setup、损坏 rc、符号/硬链接、并发创建及中断写入测试验证 `rc-validation-and-preservation`。
- [x] 2.7 在 setup 摘要中输出 `created|preserved|pending|skipped|failed`、已知选区和准确的下一步；验证没有调用 analyze/clean、没有数据库或元数据写入，并且 `pending` 不声称已安装分析范围。

## 3. 收敛与验证准备

- [x] 3.1 更新 `docs/gitnexus-config-files.md`、`INSTALL-GUIDE.md`、CLI help 和安装源 `gitnexus/skills/gitnexus-cli.md`；同步 `.agents/skills/gitnexus/gitnexus-cli/SKILL.md`，检查根 `AGENTS.md` 所列其他 setup 安装文件是否需要同步。完成标准：示例均区分安装 `--scope` 与 `--rc-scope`，不再说 setup 不会生成 rc。
- [x] 3.2 在临时 Git 仓库执行 TTY 新建、非 TTY pending、显式 legacy migration 和二次 setup 的端到端验收；记录命令、退出码、输出摘要、rc 内容及元数据前后哈希。
- [x] 3.3 使用 Node 24 执行定向 CLI/config 测试和 package build，各命令设置 10–30 分钟超时；首次失败时记录完整原始输出并遵守根 `AGENTS.md` 的不自动重试规则。
- [x] 3.4 整理 spec Scenario 到测试/输出的证据映射，包括全量扩张、主文件损坏、分支冲突、已有 rc 和无副作用五类守门场景，供 verification 使用。

## 4. 验证与回写收敛

- [x] 4.1 基于真实实现和 3.2–3.4 的证据生成或更新 `verification.md`，逐项覆盖本 change spec 与任务；未通过场景标为 fail/blocked，不宣称完成。
- [x] 4.2 基于 verification 结论生成或更新 `writeback.md`，列出 `binding.md` 的目标、摘要字段、前置授权与标准页规则；不把完整 spec/design/tasks 复制到项目页。
- [x] 4.3 在获得跨仓写入授权并确认目标页权限后，按 `writeback.md` 回写进度页，记录可审计链接、时间、执行人和结果；无法回写时保留 pending/blocked 状态。
