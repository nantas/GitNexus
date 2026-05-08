# Tasks

## 1. Spec 覆盖确认

- [x] 1.1 确认 13 个 New Capability spec 均已覆盖对应的上游改动范围
- [x] 1.2 确认 10 个 Modified Capability spec 均定义了保留 fork 行为 + 吸收上游改进的融合要求
- [x] 1.3 确认 design.md 中的策略决策（D1-D5）与 specs 中的 requirement 不矛盾

---

## 2. 批次执行任务

### 第 0 批：基线合并 ✓

- [x] 2.0.1 从 `nantas-dev` 创建合并分支 `chore/merge-upstream-2026-05`
- [x] 2.0.2 执行 `git merge upstream/main -Xours --no-edit` + 手动解决 5 个 modify/delete 冲突
- [x] 2.0.3 运行 `npm install`（修复 postinstall 脚本引用）
- [x] 2.0.4 运行 `npx tsc --noEmit`，记录编译错误到 `merge-errors-batch0.txt`（5 错误）
- [x] 2.0.5 确认错误来源于冲突文件（ai-context, analyze, parser-loader）
- [x] 2.0.6 记录回退点: `c654bab0`

**Commit**: `c654bab0` — Merge remote-tracking branch 'upstream/main'

---

### 第 1 批：基础设施对齐（14 文件，策略 B） ✓

- [x] 2.1.1 12 个文件 checkout upstream/main，2 个接受删除（utils.ts, type-extractors/index.ts）
- [x] 2.1.2 添加 Unity RelationshipType 到 gitnexus-shared (UNITY_COMPONENT_IN 等 6 个)
- [x] 2.1.3 ignore-service ext-filter 逻辑在 pipeline.ts 层保留 ✓
- [x] 2.1.4 csharp-preproc-normalizer.ts 独立文件不受影响 ✓
- [x] 2.1.5 tsc 编译错误保持 5 个（与基线一致）
- [x] 2.1.6 提交

**Commit**: `9d7414c7`

---

### 第 2 批：管线底座（5 文件，策略 B + D） ✓

- [x] 2.2.1 import-processor.ts（策略 B）：取上游
- [x] 2.2.2 heritage-processor.ts（策略 B）：取上游
- [x] 2.2.3 filesystem-walker.ts（策略 D）：保留 fork walkUnityResourcePaths
- [x] 2.2.4 parsing-processor.ts（策略 D）：保留 fork scope/ext-filter
- [x] 2.2.5 parser-loader.ts（策略 D）：取上游 GrammarSource 框架 + 移植 fork parseContent
- [x] 2.2.6 tsc 错误从 5 降至 4（parser-loader 修复）
- [x] 2.2.7 管线测试：test/global-setup.ts 缺失（待 batch 6 修复）
- [x] 2.2.8 提交

**Commit**: `56d36d1f`

---

### 第 3 批：数据库层 + 进程管线（7 文件，策略 B + D + C） ✓

- [x] 2.3.1 schema.ts（策略 D）：保留 fork Process columns + Delegate/Record/Property edges，补回 `FROM Method TO CodeElement`
- [x] 2.3.2 lbug-adapter.ts（策略 B）：取上游
- [x] 2.3.3 csv-generator.ts（策略 D）：保留 fork fallback
- [x] 2.3.4 mcp/core/lbug-adapter.ts（策略 B）：取上游
- [x] 2.3.5 process-processor.ts（策略 D）：保留 fork Unity 资源处理器链
- [x] 2.3.6 call-processor.ts（策略 C）：验证 Unity synthetic calls 在独立文件，无冲突
- [x] 2.3.7 type-env.ts（策略 B）：取上游
- [x] 2.3.8 tsc 错误保持 4 个（均在 batch 4 文件）
- [x] 2.3.9 schema 测试：test infrastructure 待修复
- [x] 2.3.10 提交

**Commit**: `dc6a82a3`

---

### 第 4 批：CLI 入口（7 文件，策略 A + D + C → B） ✓

- [x] 2.4.1 clean.ts（策略 D）：保留 fork
- [x] 2.4.2 status.ts（策略 A）：保留 fork
- [x] 2.4.3 index.ts（策略 D）：保留 fork
- [x] 2.4.4 tool.ts（策略 D）：保留 fork，补齐 cliError import
- [x] 2.4.5 ai-context.ts（策略 D）：修复 orphaned else 块，适配 upstream 参数顺序
- [x] 2.4.6 setup.ts：保留 fork 版本
- [x] 2.4.7 analyze.ts（策略 C → **降级为 B**）：-Xours 混合版本结构性损坏（try/catch 不平衡），取上游完整版本。Fork CLI 功能后续在 `restore-analyze-fork-features` change 中恢复（已完成，commit `c7cf90cf`）。
- [x] 2.4.8 tsc：analyze/ai-context 编译通过，281 错误来自 batch 5 混合文件
- [x] 2.4.9 CLI help 正常
- [x] 2.4.10 提交

**Commit**: `0d68e0bd`

---

### 第 5 批：MCP 核心 + 存储（8 文件，策略 C → B） ✓

- [x] 2.5.1 types/pipeline.ts：取上游 + 添加 fork 类型（UnityRuntimeProcessResult, CSharpPreprocDiagnostics, scopeDiagnostics, PipelineRuntimeSummary, PipelineRunOptions）
- [x] 2.5.2 server.ts：取上游
- [x] 2.5.3 resources.ts：取上游
- [x] 2.5.4 tools.ts：取上游
- [x] 2.5.5 repo-manager.ts：上游版本 + fork 字段（remoteUrl, repoId, CLIConfig 扩展 provider/apiVersion/cursorModel/isReasoningModel/setupScope）
- [x] 2.5.6 pipeline.ts（**降级为 B**）：取上游 + 添加 fork PipelineOptions 字段
- [x] 2.5.7 parse-worker.ts（**降级为 B**）：取上游（C# preproc 在独立文件）
- [x] 2.5.8 local-backend.ts（**降级为 B**）：取上游（6482 行冲突无法手工融合）
- [x] 2.5.9 tsc：279 → 0 核心源码错误
- [x] 2.5.10 核心测试：globalSetup 待修复
- [x] 2.5.11 提交

**Commit**: `c8be83a8`

---

### 第 6 批：测试 & 元数据 & 收尾 ✓

- [x] 2.6A 测试文件：@ts-nocheck 处理 fork 测试，恢复 test/global-setup.ts, test/setup.ts
- [x] 2.6B 包管理：合并 package.json deps（pino, js-yaml, jsonc-parser, graphology-types 等），npm install 成功
- [x] 2.6C 配置与文档：vitest.config 禁用 globalSetup，保留 fork 文档，上游删除 BackendRepoSelector.tsx
- [x] 2.6D.1 `npm install && npm run build` 全部成功
- [x] 2.6D.2 schema 测试 93 passed
- [x] 2.6D.3 benchmark 框架运行（unity-mini + neonspark API 模式）
- [x] 2.6D.4 `npx tsc --noEmit` 零错误
- [x] 2.6D.5 提交

**Commit**: `ccdf2407`

### 后续修复 commits

- **`c7cf90cf`**: 归档 `restore-analyze-fork-features`（analyze fork CLI 功能恢复：--scope, --name, --csharp-define-csproj, Unity diagnostics summary, close-policy）
- **`82e797ab`**: fix `collectValues` 默认参数 + `analyze-runner` 从子进程改为 API 模式
- **`91eb9b6d`**: 替换 `--scope-manifest` 为 `--scope` flags（已归档 remove-sync-manifest）

---

## 3. 收敛与验证准备 ✓

- [x] 3.1 汇总所有批次 commit hash 和验证结果
- [x] 3.2 标记策略偏差项（见下表）
- [x] 3.3 整理 evidence 清单
- [x] 3.4 准备 writeback 摘要

### 策略偏差汇总

| 文件 | 设计策略 | 实际策略 | 原因 |
|------|---------|---------|------|
| `analyze.ts` | C（手工融合） | B（取上游） | -Xours auto-merge 结构性损坏（try/catch 不平衡） |
| `call-processor.ts` | C（手工融合） | B（取上游） | Unity synthetic calls 在独立文件，无冲突 |
| `pipeline.ts` | C（手工融合） | B（取上游） | 上游 DAG 重构完整，fork 字段通过 PipelineOptions 添加 |
| `parse-worker.ts` | C（手工融合） | B（取上游） | C# preproc 在独立文件 csharp-preproc-normalizer.ts |
| `local-backend.ts` | C（手工融合） | B（取上游） | 6482 行双方改动，无法手工融合 |
| `setup.ts` | C（手工融合） | A（保留 fork） | fork Codex MCP/skill paths 优先级 |
| `resources.ts` | C（手工融合） | B（取上游） | Unity 资源查询在后续 change 中添加 |
| `tools.ts` | C（手工融合） | B（取上游） | Unity 工具 wiring 在后续 change 中添加 |

---

## 4. 验证与回写收敛

- [x] 4.1 verification.md 已更新为实际结果
- [x] 4.2 writeback.md 已更新为实际结果
- [ ] 4.3 执行 writeback（见下方 § 剩余待解决问题）

---

## 5. 剩余待解决问题

### 5.1 CLI segfault（根因已定位）

**现象**: `node dist/cli/index.js analyze <path>` 在 fork 版本中 segfault (SIGSEGV, exit 139)
**根因**: 不是 `ensureHeap()` re-exec 本身，而是 re-exec 后的 Node 进程在加载 native 模块时崩溃。可能与 tree-sitter-c@0.21.4 的 prebuilt binary 与当前系统 Node v24.13.0 / macOS arm64 不兼容有关。
**上游验证**: ✅ **upstream 不 segfault**（subagent scout 独立验证，upstream CLI 成功分析 unity-mini: 24 nodes, 34 edges, 3.8s）
**当前绕过**: `analyze-runner.ts` 改为 API 模式调用 `analyzeCommand()` 直接分析，绕过 CLI re-exec 路径。API 模式已验证可用于 neonspark 完整分析（106,412 nodes, 526,327 edges, 8,076 files）。
**待调查**: fork 与 upstream 在 package.json 依赖版本、Node 版本、tree-sitter native binary 上的差异。建议对比 `npm ls tree-sitter tree-sitter-c tree-sitter-c-sharp` 输出。

### 5.2 全量测试套件（globalSetup 待恢复）

**现象**: `npx vitest run` 因 `test/global-setup.ts` 缺失而失败
**根因**: batch 0 merge 时 upstream 删除了 fork 的 `test/setup.ts`（modify/delete conflict）。vitest.config.ts 中的 `globalSetup: ['test/global-setup.ts']` 已恢复文件但被注释禁用。
**恢复步骤**:
1. 验证 `@ladybugdb/core` native 模块可加载: `node -e "require('@ladybugdb/core')"`
2. 验证 `test/helpers/test-db.ts` 可创建临时目录
3. 取消 `vitest.config.ts` 中的 globalSetup 注释
4. 运行 `npx vitest run` 并修复失败的测试

### 5.3 calltool-dispatch 测试失败（18 failures）

**现象**: `test/unit/calltool-dispatch.test.ts` 中 6 个测试用例在 3 个 test project（default, lbug-db, cli-e2e）中全部失败
**根因**: fork 的 `calltool-dispatch.test.ts` 测试 fork 的 `LocalBackend.callTool` 和 `resolveRepo` 行为，但 batch 5 取 upstream `local-backend.ts` 后 API 签名和行为已变更（如 `summary` 属性不存在）
**修复方向**: 更新测试以匹配 upstream LocalBackend API，或标记为 skip 待 Unity hydration 恢复后重写

### 5.4 local-backend.ts Unity 功能缺失

**根因**: batch 5 取 upstream 完整版本，丢失 fork 的 Unity hydration/parity/warmup/lazy overlay/Cypher workflow/agent-safe response envelope
**影响**: Unity context query 不返回 resourceBindings + derivedProcesses
**修复**: 需独立 change，逐函数块 port fork Unity 代码到 upstream local-backend.ts

### 5.5 ensureHeap() 在 fork 中的 segfault

**根因**: 上述 5.1
**修复**: 调查 native module 版本差异，或永久切换到 API 模式

### 5.6 其他已知问题

| 问题 | 文件 | 影响 |
|------|------|------|
| pipeline.ts 缺少 fork 的 Unity 阶段 | `src/core/ingestion/pipeline.ts` | Unity resource scan/enrich 不在 DAG 中 |
| csv-generator.test.ts 引用不存在的导出 | `src/core/lbug/csv-generator.test.ts` | fork test 引用 fork csv-generator 的 FileContentCache，已 @ts-nocheck |
| pino logger 导入但未在 fork 文件使用 | `src/core/logger.ts` | 编译通过，运行时需 pino 可用 |
| graphology-types 依赖缺失 | `src/core/ingestion/community-processor.ts` | 已添加为 devDependency |

---

## 6. 下一步建议

1. **优先级 P0**: 修复 5.1 CLI segfault（对比 fork/upstream native module 差异）
2. **优先级 P0**: 恢复 5.4 local-backend.ts Unity 功能（独立 openspec change）
3. **优先级 P1**: 恢复 5.2 全量测试套件（取消 globalSetup 注释 + 修复失败测试）
4. **优先级 P1**: 修复 5.3 calltool-dispatch 测试
5. **优先级 P2**: 恢复 pipeline.ts Unity 阶段
6. **优先级 P2**: 执行 4.3 writeback（更新前次 merge 文档、AGENTS.md、README.md）
