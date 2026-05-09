# Design

## Context

`nantas-dev` 分叉自 `upstream/main`（共同祖先 `fb5270c`），双方独立演进 **1077 个 commits**。3 月 18 日的初次可行性分析确认了基本可行性，此后双方继续各自发展，分叉深度从 34 个重叠文件扩大到 81 个。

当前 fork 侧建设了大量 Unity runtime process 基础设施（hydration、parity、lazy overlay、Cypher workflow、rule-lab），这些代码深度嵌入在共享的基础设施文件中（pipeline、parse-worker、local-backend、analyze）。直接 `git merge` 将在这些文件上产生不可自动解决的语义冲突。

因此采用**分批逐文件合并**策略：先以 `-Xours` 做基线合并吸收无冲突改动，再分 6 批逐文件决策处理 81 个冲突文件。

## Goals / Non-Goals

**Goals:**

- 吸收 upstream/main 的全部无冲突改动（安全修复、语言支持、Docker、Group、日志系统等）
- 对 81 个冲突文件逐一做出明确的策略决策并执行
- 完整保留 fork 的核心能力：Unity runtime process、rule-lab、benchmark、C# preproc、analyze options 简化
- 合并后通过编译、核心测试、Unity benchmark gate

**Non-Goals:**

- 不修改 upstream 的业务逻辑
- 不将 fork 改动回馈 upstream
- 不发布新版本包
- 不在本次 change 中新增任何功能
- 不对 upstream 的架构决策做二次判断

## Decisions

### D1: 合并策略 — `git merge -Xours` 基线 + 逐文件修正

**决策**：使用 `git merge upstream/main -Xours` 创建初始 merge commit，自动解决所有冲突保留 fork 版本，然后分批将上游改动 port 回冲突文件。

**理由**：
- 1810 个 upstream 独有文件中有 ~1729 个无冲突，`-Xours` 可一键吸收
- 81 个冲突文件的 fork 改动是精心构建的 Unity 基础设施，不能简单丢弃
- 分批修正允许每批独立验证（编译、测试），降低风险

**替代方案**：
- `git merge upstream/main`（纯手动）：全部 81 个文件一次性用冲突标记解决，缺少分批验证的中间状态，回退成本高
- `git cherry-pick` 逐 commit：575 个 upstream commits 有复杂依赖链，无法独立拣选

### D2: 文件策略矩阵

对 81 个冲突文件，使用四种策略：

| 策略 | 含义 | 适用条件 |
|------|------|---------|
| A (fork-only) | 保留 fork 版本 | fork 改动 >200 行且上游改动 <50 行，或 fork 完全定制的文件 |
| B (upstream-only) | 取上游版本 | fork 改动 <30 行，上游改动 >200 行，fork 改动可安全丢弃 |
| C (manual-merge) | 手工融合双方 | 双方改动均 >200 行，语义深度交织 |
| D (fork+port) | 保留 fork 为主 + port 上游片段 | fork 改动 >100 行且上游有安全修复或关键接口变更 |

**理由**：一刀切的策略（全部 ours 或全部 theirs）在 81 个文件上不可行。fork 在 `local-backend.ts` 有 2549 行定制、在 `analyze.ts` 有 369 行定制，而这些文件上游也分别改了 3933 行和 927 行。

### D3: 6 批执行顺序

按依赖层级排序，上层改动依赖下层接口稳定：

1. **基础设施对齐**（14 文件，策略 B）：类型定义、配置、简单工具函数 — 上游重写远多于 fork，取上游为后续提供稳定底座
2. **管线底座**（5 文件，策略 B+D）：import/heritage/parsing 管线 — 取上游为主，保留 fork scope/ext-filter
3. **数据库 + 进程**（7 文件，策略 B+D+C）：schema、adapter、call-processor、type-env — `call-processor.ts` 首次引入 C 策略
4. **CLI 入口**（7 文件，策略 A+D+C）：analyze、setup、clean、index — fork 深度定制的入口点
5. **MCP + 存储核心**（8 文件，策略 C+D）：local-backend、tools、pipeline、parse-worker — 最高风险区
6. **测试 + 元数据**（剩余文件）：测试、package.json、文档 — 收尾

**理由**：编译依赖决定顺序。第 1 批的类型定义必须在后续批次消费之前对齐。第 5 批的 MCP 核心依赖第 1-4 批的所有接口。

### D4: 冲突解决优先级规则

遇到语义冲突时，按以下优先级决策：

1. **安全性优先**：上游安全修复（路径注入、tempfile、速率限制）无条件采纳
2. **编译通过优先**：接口签名以实际消费方为准，不保留孤立代码

当 1-2 无法覆盖所有情况时（即安全修复已采纳、编译可通过，但在 fork 功能保留 vs 上游改进吸收之间存在实质性功能设计分歧），**暂停执行并引入用户决策**。

#### D4.1: 用户决策升级条件（必须暂停）

在以下任一情况下，禁止自主决策，必须停下来与用户讨论确认：

- **功能等价不可达成**：上游架构变更导致 fork 功能无法通过纯接口适配保留，需要重新设计 fork 侧的功能实现方式
- **行为语义冲突**：同一个函数/模块在 fork 和 upstream 中有语义上互斥的实现，无法通过 if-else 或配置开关共存
- **性能与功能取舍**：上游改进（如 scope resolution）带来了性能提升，但可能改变 Unity 合成边的生成时序或数量，存在不确定性
- **策略矩阵外的文件**：某个冲突文件的改动量或语义复杂度超过设计预期的 A/B/C/D 策略覆盖范围，需要重新评估策略

#### D4.2: 用户决策流程

1. 准备上下文：冲突文件 diff 摘要 + fork 功能说明 + 上游改动意图
2. 向用户清晰描述两个互斥方向及其影响
3. 用户做出选择后，记录决策到该批次的 commit message 和 verification.md 偏差记录中
4. 继续执行

#### D4.3: 可自主决策的情况（无需暂停）

- 安全修复（无条件采纳上游）
- 纯编译适配（接口签名变更，内部逻辑不变）
- 上游新增代码路径与 fork 代码路径无交集（各自独立函数/文件）
- 上游删除了 fork 未修改的文件（直接接受删除）

### D5: 验证门设计

每批完成后设硬性验证门：

| 批次 | 验证门 | 不通过时的处理 |
|------|--------|---------------|
| 第 1 批 | `npx tsc --noEmit` | 回退该批，逐文件排查编译错误 |
| 第 2 批 | tsc + 管线测试 | 回退，检查接口适配是否正确 |
| 第 3 批 | tsc + schema 测试 | `call-processor.ts` 失败时降级为 D 策略（fork+port） |
| 第 4 批 | tsc + CLI help | 逐个 CLI 命令验证 |
| 第 5 批 | 全量 tsc + 核心测试 | 失败时逐文件回退到 D 策略 |
| 第 6 批 | `npm test` 全绿 | 修复测试回归后再继续 |

## Risks / Migration

### 高风险项

| 风险 | 文件 | 缓解措施 |
|------|------|---------|
| `call-processor.ts` 上游 3554 行重写，fork Unity 合成边无法适配 | `src/core/ingestion/call-processor.ts` | 预留第 3 批降级路径：保留 fork 版本 + port 上游安全修复 |
| `local-backend.ts` 双方合计 6482 行改动，手工融合极易遗漏 | `src/mcp/local/local-backend.ts` | 独立文件 diff 审查 + 按函数块对比 port |
| `type-env.ts` registry-primary 重构破坏 Unity 类型推断 | `src/core/ingestion/type-env.ts` | 第 3 批后运行 Unity 类型推断专项测试 |
| 上游删除 `gitnexus-web/` 下 WASM 和嵌入管线文件 | `gitnexus-web/` | 确认 fork 未修改这些文件，直接接受上游删除 |
| package.json 依赖冲突导致 `npm install` 失败 | `gitnexus/package.json` | 手工合并依赖列表，lockfile 重建 |

### 回退策略

- 每批独立提交，失败时 `git reset --hard HEAD~1` 回到上一批
- 全局回退：删除 `chore/merge-upstream-2026-05` 分支，重新评估
- 不可回退点：第 0 批 merge commit 之后（已在分支历史中），后续只能 forward-fix
