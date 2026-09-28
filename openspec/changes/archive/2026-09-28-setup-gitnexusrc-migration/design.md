# Design

## Context

本设计实现 [setup-repository-analyze-config 规范](specs/setup-repository-analyze-config/spec.md)。当前 `setup.ts` 仅安装 MCP/skill 并保存全局 CLI 版本信息；`analyze-config.ts` 从仓库根目录读取 `.gitnexusrc`。v1.5.9 曾把 `analyzeOptions` 写入索引元数据，新版索引的 `indexCoverage` 只记录上次实际扫描范围。迁移要把可证明的历史选择转换为用户确认的未来默认值。

现有 `--scope` 表示 setup 的安装范围，不能复用为分析路径。`gitnexus.json` 与 `meta.json` 由索引写入流程拥有，setup 不应修改。已有 `loadMeta` 在主文件损坏时返回 `null`，不足以区分“无索引”和“主文件损坏”；迁移计划需要保留这个错误状态。

## Goals / Non-Goals

**Goals:**

- 让项目级 setup 能创建、迁移并展示 `.gitnexusrc`，保持 [规范](specs/setup-repository-analyze-config/spec.md) 所定的交互和非交互结果。
- 每个候选字段有来源和冲突状态；不把缺失数组解释为全量，不把运行时收据解释成数据库版本。
- 在写 MCP/skill 前解决显式请求的输入错误；最终 rc 创建不能覆盖已有文件。

**Non-Goals:**

- 不改 `analyze` 的选项合并顺序，不恢复自动复用 `meta.json.analyzeOptions`。
- 不执行索引重建、FTS 修复、数据库升级或元数据回写。
- 不将 `.gitnexusrc` 扩展为 YAML、全局配置或隐式的 `package.json` 字段。
- 不在本次 change 清理现存的历史 OpenSpec 中关于旧版 analyze 的过期描述；当前行为以源码和本 change 规范为准。

## Decisions

### 1. 用一个迁移模块承载计划与写入

新建 `gitnexus/src/cli/setup-analyze-config.ts`，对 `setup.ts` 只暴露两项操作：生成只读计划、按已确认计划创建文件。计划包含仓库根路径、状态、候选 JSON、逐字段来源、冲突、缺口、旧索引时间与元数据路径。交互文案留在 `setup.ts`。这种接口让脚本路径和交互路径共用同一套迁移规则，测试可通过临时仓库直接验证计划和写入。

### 2. 先预检，再执行现有 setup

`index.ts` 注册 `--rc-mode`、`--accept-rc`、`--rc-scope`、`--rc-extensions`、`--rc-name`、`--rc-csharp-define-csproj`。在 `setupCommand` 解析 agent/scope 后、写全局配置或 MCP 文件前运行 rc 预检。显式 `create`/`migrate` 的来源缺失、冲突、无确认、非法 rc 或非法组合都在此处失败。默认非交互 `auto` 的缺失 rc 只形成 `pending` 结果，允许原有 editor setup 继续。用户在 TTY 拒绝 rc 创建时，状态为 `skipped`，其他 setup 项照常执行。

已有 rc 的 `auto` 只校验并报告 `preserved`；`create`/`migrate` 遇到已有文件即失败。`skip` 不读 rc。全局和 `--coding-agent` 路由无需触碰仓库配置；显式仓库 rc 模式在进入那条路由前报使用错误。

### 3. 元数据读取保留“损坏”与“缺失”的区别

迁移读取器使用现有 storage resolver 找到当前仓库索引位置，并沿用 `repo-manager.ts` 的主文件优先语义。它返回明确的 `absent`、`valid`、`invalid` 状态：主文件确实不存在才尝试 mirror；主文件无法读取/解析时返回 `invalid`，不从 mirror 恢复。与现有 `loadMeta` 的宽松 `null` 结果分开实现详细诊断，同时复用共享路径、文件名常量和仓库归属判定。元数据可能包含大量 `fileHashes`，不能套用针对小型 `.gitnexusrc` 的 1 MiB 控制文件上限。

迁移前比对元数据 `repoPath` 和目标 Git root 的规范路径。分支索引优先按当前 checkout 定位；若活动分支与 flat slot 都有收据且选区不同，记录冲突，不按时间戳自动挑选。现有 `.gitnexusrc` 仍为唯一未来默认值，所有分支共用。

### 4. 逐字段映射并复用 rc 校验

`scopeRules`/`includeExtensions` 优先取 `indexCoverage`，字段缺失时才看 `analyzeOptions`。若两处都有不同值，计划采用覆盖收据作为建议值，但标记未解决冲突，确认前不可写。空数组是明确的全量选择，字段缺失是未知。旧 `repoAlias → name`；`csharpDefineCsproj`、`embeddings` 直接映射；`aiContext: false → skipAgentsMd: true`；可精确换算的非默认 `maxFileSizeBytes → maxFileSize` 为候选。其余状态字段不转成配置。

把 `analyze-config.ts` 的 JSON 解析和标准化逻辑整理为可复用的纯函数，供迁移模块验证拟写入内容；保持 analyze 当前行为。校验 C# 项目路径的存在性和安全性，无法通过时保留警告与待决字段，不静默删除或猜测替代路径。生成稳定顺序的扁平 JSON 和结尾换行。

### 5. 确认和不可覆盖创建

TTY 路径先展示完整计划，再逐项解决未定的路径、扩展名和冲突，最后确认拟写入 JSON。非 TTY `auto` 不读 stdin；显式 `create` 要求路径和扩展名两个选择，`migrate` 要求完整无冲突的旧候选，两者都要求 `--accept-rc`。

写入前再次确认目标根路径和配置有效。先在目标目录写并同步临时文件，再以不可覆盖方式安装为 `.gitnexusrc`；目标已存在时失败并清除临时文件，不覆盖它。实现须兼顾当前支持的平台并用并发创建测试验证。写入成功后再按正常 setup 输出汇总；若其他独立安装步骤失败，逐项报告，不把多文件操作宣称为事务。

### 6. 结果文案和后续动作

结果只有 `created`、`preserved`、`pending`、`skipped`、`failed`。`created` 显示确认后的 scope/extensions 和 `gitnexus analyze` 下一步；`pending` 给出填足缺项的显式 setup 命令；`skipped` 不称已安装分析范围。schema/runner 收据只作状态提示，不写“LadybugDB 数据库版本已升级”。这对应规范的 `setup-result-and-rebuild-boundary`。

## Risks / Migration

- **全量扩张：** 缺失字段必须留在计划的待决列表；非 TTY 默认路径不生成 rc。用旧 v1.5.9 与新 coverage fixtures 验证。
- **错误来源：** 复制来的元数据、损坏主文件、分支选区不一致都不能自动写 rc；错误中指出来源文件与可执行的下一步。
- **已有用户配置：** `auto` 不改已有 rc 的任何字节；非正常文件类型按当前控制文件规则报错；并发创建不覆盖。
- **兼容旧自动化：** 非 TTY 的普通 `setup --scope project` 保留 MCP/skill 行为，新增醒目的 `pending` 状态。显式模式在配置预检不通过时提前非零退出。
- **后续 analyze：** 新 rc 可能让现有索引因有效分析输入变化而重建；setup 只提示影响，不在本命令中支付重建成本。
