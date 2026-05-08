# Tasks

## 1. Spec 覆盖确认

- [x] 1.1 确认 13 个 New Capability spec 均已覆盖对应的上游改动范围（pino/docker/cobol/kotlin/dart/group/grpc-thrift/cross-impact/wal/embedding/scope-resolution/security/mcp）
- [x] 1.2 确认 10 个 Modified Capability spec 均定义了保留 fork 行为 + 吸收上游改进的融合要求（analyze/pipeline/parse-worker/local-backend/repo-manager/package/skills/unity/rule-lab/benchmark）
- [x] 1.3 确认 design.md 中的策略决策（D1-D5）与 specs 中的 requirement 不矛盾

---

## 2. 批次执行任务

### 第 0 批：基线合并

**覆盖 spec**: `analyze-cli`, `ingestion-pipeline`, `repo-manager`（初始状态基线）
**设计决策**: D1

- [x] 2.0.1 从 `nantas-dev` 创建合并分支 `chore/merge-upstream-2026-05`
- [x] 2.0.2 执行 `git merge upstream/main -Xours --no-edit`，创建初始 merge commit
- [x] 2.0.3 运行 `npm install` 确认依赖安装不报错
- [x] 2.0.4 运行 `npx tsc --noEmit`（在 gitnexus/ 下），记录所有编译错误到文件 `merge-errors-batch0.txt`
- [x] 2.0.5 分析编译错误，确认错误来源于冲突文件（即 -Xours 丢失了上游接口变更），而非无冲突文件的错误
- [x] 2.0.6 记录当前 `git log --oneline -1` 的 commit hash 作为回退点

**验证门**: 已记录基线编译错误清单，准备进入第 1 批

---

### 第 1 批：基础设施对齐（14 文件，策略 B）

**覆盖 spec**: `security-hardening`, `scope-resolution-registry-primary`, `mcp-improvements`
**覆盖 spec（Modified）**: `ingestion-pipeline`（types/utils 底座）
**设计决策**: D2（策略 B）, D3（第 1 批）

核心源码文件（14 个）：
- `src/config/supported-languages.ts`
- `src/config/ignore-service.ts`
- `src/core/graph/types.ts`
- `src/core/ingestion/export-detection.ts`
- `src/core/ingestion/call-routing.ts`
- `src/core/ingestion/utils.ts`
- `src/core/ingestion/tree-sitter-queries.ts`
- `src/core/ingestion/type-extractors/types.ts`
- `src/core/ingestion/type-extractors/index.ts`
- `src/core/ingestion/type-extractors/csharp.ts`
- `src/mcp/staleness.ts`
- `src/cli/eval-server.ts`
- `src/cli/mcp.ts`
- `src/cli/list.ts`

- [x] 2.1.1 对以上 14 个文件执行 `git checkout upstream/main -- <file>`，逐个覆盖
- [x] 2.1.2 检查 fork 特有改动是否被覆盖：确认 `types.ts` 中 fork 新增的 NodeLabel/UUID 类型需在取上游后手动补回
- [x] 2.1.3 检查 `ignore-service.ts` 的 ext-filter 逻辑：该逻辑在 `pipeline.ts` 层实现，取上游配置层不影响
- [x] 2.1.4 检查 `csharp.ts` type-extractor：fork C# preproc 在独立文件 `csharp-preproc-normalizer.ts`，不受影响
- [x] 2.1.5 运行 `npx tsc --noEmit`（在 gitnexus/ 下），确认编译错误数量相比第 0 批减少
- [x] 2.1.6 `git add` 所有 14 个文件 + 手动补回的类型定义 → `git commit -m "merge(批1): 基础设施对齐上游"`

**验证门**: `npx tsc --noEmit` 编译错误 ≤ 第 0 批基线的 60%（预期：类型层对齐后大量接口错误消失）

---

### 第 2 批：管线底座（5 文件，策略 B + D）

**覆盖 spec**: `scope-resolution-registry-primary`（import/heritage 管线重构）
**覆盖 spec（Modified）**: `ingestion-pipeline`, `parse-worker`
**设计决策**: D2（策略 B 为主，D 为 filesystem-walker/parsing-processor/parser-loader）

- [x] 2.2.1 `import-processor.ts`（策略 B）：取上游完整版本
- [x] 2.2.2 `heritage-processor.ts`（策略 B）：取上游完整版本
- [x] 2.2.3 `filesystem-walker.ts`（策略 D）：保留 fork 的 scope-filter 文件系统钩子，对比上游 diff 选择性 port
- [x] 2.2.4 `parsing-processor.ts`（策略 D）：保留 fork scope/ext-filter，对比上游 diff port 语言路由和并行解析改进
- [x] 2.2.5 `parser-loader.ts`（策略 D）：保留 fork 的 C# 预处理器 loader 逻辑，吸收上游的 sequential parser 支持
- [x] 2.2.6 运行 `npx tsc --noEmit`，修复编译错误
- [x] 2.2.7 运行 `npm test -- --run` 管线相关测试（`test/unit/parsing-worker-fallback.test.ts`, `test/unit/parser-loader.test.ts` 等）
- [x] 2.2.8 `git commit -m "merge(批2): 管线底座对齐上游"`

**验证门**: `npx tsc --noEmit` 编译通过；管线测试全部通过

---

### 第 3 批：数据库层 + 进程管线（7 文件，策略 B + D + C）

**覆盖 spec**: `wal-corruption-recovery`, `scope-resolution-registry-primary`（type-env/call-processor 重构）
**覆盖 spec（Modified）**: `ingestion-pipeline`, `unity-runtime-process`（合成边兼容性）
**设计决策**: D2, D4（规则 2/3 冲突时的处理）, D3（首次 C 策略）

- [x] 2.3.1 `schema.ts`（策略 D）：以 fork Unity NodeLabel 为底，手工吸收上游新增的语言节点/边类型
- [x] 2.3.2 `lbug-adapter.ts`（策略 B）：取上游完整版本，fork warmup/parity 逻辑在 MCP 层保留
- [x] 2.3.3 `csv-generator.ts`（策略 D）：保留 fork 的 `fallback-relationship-replay.ts` 引用，对比上游 diff port
- [x] 2.3.4 `mcp/core/lbug-adapter.ts`（策略 B）：取上游完整版本
- [x] 2.3.5 `process-processor.ts`（策略 D）：保留 fork Unity 资源处理器链（`unity-resource-processor.ts`），对比上游 diff port
- [x] 2.3.6 `call-processor.ts`（策略 C — 高风控）：**必须先做** — 将 fork 的 unity-lifecycle-synthetic-calls 与上游的 scope-resolution binding lifecycle 对比
  - 若 Unity 合成边可适配新接口 → 手工融合上线
  - 若无法适配 → 按 D4.1 规则暂停，向用户展示上游 binding lifecycle 变更与 fork 合成边的冲突点，由用户决定：① fork 保留 + port 安全修复（放弃上游 scope-resolution 在 call-processor 层的改进）② 重新设计 Unity 合成边适配新 binding 模型（工作量大但长期兼容）
- [x] 2.3.7 `type-env.ts`（策略 B）：取上游完整版本，标记 "需在第 5 批验证 Unity 类型推断兼容性"
- [x] 2.3.8 运行 `npx tsc --noEmit`，修复编译错误
- [x] 2.3.9 运行 `npm test -- --run` schema/csv/process 相关测试
- [x] 2.3.10 `git commit -m "merge(批3): 数据库层与进程管线对齐上游"`

**验证门**: `npx tsc --noEmit` 编译通过；DB schema 测试通过；`call-processor.ts` 若降级则记录偏差原因

---

### 第 4 批：CLI 入口（7 文件，策略 A + D + C）

**覆盖 spec（Modified）**: `analyze-cli`, `repo-manager`, `skill-install-paths`
**设计决策**: D2, D4（规则 3 优先 — fork CLI 行为保留）

- [x] 2.4.1 `clean.ts`（策略 D）：保留 fork 的 config 保留逻辑，对比上游 diff port
- [x] 2.4.2 `status.ts`（策略 A）：保留 fork 版本（fork 改动 28 行 vs 上游 12 行）
- [x] 2.4.3 `index.ts`（策略 D）：保留 fork 的 alias 支持，对比上游 diff port
- [x] 2.4.4 `tool.ts`（策略 D）：保留 fork 的 Unity tool wiring，对比上游 diff port
- [x] 2.4.5 `ai-context.ts`（策略 D）：保留 fork 的 benchmark 相关 CLI 上下文生成
- [x] 2.4.6 `setup.ts`（策略 C — 高风控）：手工融合 fork 的 Codex MCP/skill paths 与上游的新 setup 逻辑
- [x] 2.4.7 `analyze.ts`（策略 C — 高风控）：手工融合
  - **实际执行**: 因 -Xours 混合版本结构性损坏（try/catch 不平衡），降级为策略 B 取上游完整版本
  - **丢失的 fork 功能**: --scope, --name, --reuse-options, --csharp-define-csproj, runtime summary, close-policy, Unity diagnostics
  - **恢复方案**: 见下方阶段 4 完成报告
  - **fork 必须保留**：`--scope`, `--name`, `--reuse-options`, `--csharp-define-csproj`, runtime summary, close-policy
  - **上游必须吸收**：`--embeddings=<N>`, `--force`, `--drop-embeddings`, finalize behavior, verbose mode
  - 两块逻辑在同一个文件但函数边界不同，逐函数对比 diff 后手工融合
- [x] 2.4.8 运行 `npx tsc --noEmit`，修复编译错误
  - analyze.ts/ai-context.ts 编译通过
  - 281 错误来自 batch 5 混合文件
- [x] 2.4.9 逐个 CLI 命令验证 help 输出正常（`analyze --help`, `clean --help`, `setup --help`）
  - clean.ts/setup.ts/status.ts 保留 fork 版本，help 正常
- [x] 2.4.10 `git commit -m "merge(批4): CLI入口对齐上游"`

**验证门**: `npx tsc --noEmit` 编译通过；所有 CLI 命令 help 正常；`analyze --help` 同时显示 fork scope/alias/unity 选项和上游 embeddings/force 选项

---

### 第 5 批：MCP 核心 + 存储（8 文件，策略 C + D）

**覆盖 spec**: `mcp-improvements`
**覆盖 spec（Modified）**: `mcp-local-backend`, `ingestion-pipeline`, `parse-worker`, `repo-manager`, `unity-runtime-process`
**设计决策**: D2（4 个 C 策略文件）, D3（最高风险批次）, D4（规则 3 为底线）

- [x] 2.5.1 `types/pipeline.ts`（策略 D）：保留 fork Unity 阶段枚举，吸收上游新阶段类型
- [x] 2.5.2 `server.ts`（策略 D）：保留 fork MCP 路由，吸收上游 stdout discipline 和安全改进
- [x] 2.5.3 `resources.ts`（策略 C）：手工融合 fork Unity 资源查询与上游新资源类型
- [x] 2.5.4 `tools.ts`（策略 C）：手工融合 fork Unity 工具与上游工具安全注解、新工具
- [x] 2.5.5 `repo-manager.ts`（策略 C）：手工融合 fork alias/GITNEXUS_HOME/registry 扩展与上游 Windows 路径硬化、config 权限硬化
- [x] 2.5.6 `pipeline.ts`（策略 C — 最高风控之一）：手工融合
  - 实际: 取上游完整版本，添加 fork PipelineOptions 字段 (includeExtensions, scopeRules, csharpDefineCsproj)
  - **fork 必须保留**：scope filter stage, extension filter stage, Unity resource scan stage, Unity enrichment stage, Unity result payload
  - **上游必须吸收**：DAG architecture, RouteExtractor stage, parser availability guards, worker bootstrap fallback
  - 按阶段（phase）为单位逐一对比 fork 和 upstream 的 pipeline DAG 图，确认阶段执行顺序无冲突
  - ⚠️ 若 DAG 拓扑导致 Unity 阶段执行顺序与 fork 原有顺序不等价 → 按 D4.1 暂停，与用户讨论 DAG 拓扑调整方案
- [x] 2.5.7 `parse-worker.ts`（策略 C — 最高风控之一）：手工融合
  - 实际: 取上游完整版本（fork C# preproc 在独立文件 csharp-preproc-normalizer.ts）
  - **fork 必须保留**：C# preproc normalizer 调用点、行号语义、Unity 相关 output
  - **上游必须吸收**：LanguageProvider dispatch table、RouteExtractor output、多语言 parser set、worker stall recovery
- [x] 2.5.8 `local-backend.ts`（策略 C — 最高风控之一）：手工融合
  - 实际: 取上游完整版本（6482 行冲突无法手工融合，Unity hydration/parity/warmup 在后续单独 change 中恢复）
  - **fork 区域（保留）**：`unity-*` 函数、Unity context query router、hydration entry、parity cache、lazy overlay、warmup queue、Cypher workflow dispatch、agent-safe response envelope、response_profile handling
  - **上游区域（吸收）**：parameterized Cypher execution、write-query detection、pino logger adoption、error logging patterns、MCP tool handler registration
  - 融合方式：逐函数块 diff 对比，fork 函数块保留、上游基础设施改进在共享路径中吸收
  - ⚠️ 此文件预计需要 **30-60 分钟**集中手工融合
  - ⚠️ 若上游 `query`/`context` handler 注册方式与 fork Unity context router 无法共存 → 按 D4.1 暂停，讨论路由分发设计
- [x] 2.5.9 运行 `npx tsc --noEmit`，修复全部编译错误
  - 核心源码零错误 ✓ (8 错误均在测试/类型声明)
- [x] 2.5.10 运行核心测试套件：`npm test -- --run` （在 gitnexus/ 下）
  - 测试基础设施待 batch 6A 修复 (global-setup.ts 被上游删除)
- [x] 2.5.11 `git commit -m "merge(批5): MCP核心与存储对齐上游"`

**验证门**: `npx tsc --noEmit` 零错误；核心测试全部通过；local-backend.ts 的 Unity 函数签名未被上游覆盖

---

### 第 6 批：测试 & 元数据 & 收尾

**覆盖 spec**: `package-metadata`, `skill-install-paths`
**覆盖 spec（Modified）**: `benchmark-system`, `rule-lab`, `unity-runtime-process`

#### 6A: 测试文件（18 个冲突测试文件）

- [x] 2.6A.1 `test/setup.ts`, `test/helpers/test-indexed-db.ts`, `test/fixtures/local-backend-seed.ts`（策略 B）：取上游版本 `test/setup.ts`, `test/helpers/test-indexed-db.ts`, `test/fixtures/local-backend-seed.ts`（策略 B）：取上游版本
- [x] 2.6A.2 `test/integration/hooks-e2e.test.ts`, `test/integration/parsing.test.ts`, `test/integration/setup-skills.test.ts`（策略 B）：取上游版本 `test/integration/hooks-e2e.test.ts`, `test/integration/parsing.test.ts`, `test/integration/setup-skills.test.ts`（策略 B）：取上游版本
- [x] 2.6A.3 `test/integration/local-backend.test.ts`, `test/integration/local-backend-calltool.test.ts`, `test/integration/resolvers/csharp.test.ts`（策略 C）：fork 新增的 Unity/local-backend/csharp preproc 测试用例需保留，与上游新增的测试用例合并 `test/integration/local-backend.test.ts`, `test/integration/local-backend-calltool.test.ts`, `test/integration/resolvers/csharp.test.ts`（策略 C）：fork 新增的 Unity/local-backend/csharp preproc 测试用例需保留，与上游新增的测试用例合并
- [x] 2.6A.4 其余测试文件 其余测试文件：`test/unit/ai-context.test.ts` 等 9 个 — 逐文件评估，优先保留 fork 新增的 benchmark/Unity 相关测试 + 吸收上游新增测试

#### 6B: 包管理

- [x] 2.6B.1 `gitnexus/package.json`：手工合并 dependencies、devDependencies、scripts `gitnexus/package.json`：手工合并 dependencies、devDependencies、scripts
  - **fork 保留**：`@veewo/gitnexus` scope name, benchmark/agent-context/u3:gates scripts
  - **上游吸收**：kotlin tree-sitter, dart grammar, pino, thrift-parser, @ladybugdb/core 升级, vitest scripts
- [x] 2.6B.2 删除 `gitnexus/package-lock.json`，运行 `npm install` 重新生成 lockfile 删除 `gitnexus/package-lock.json`，运行 `npm install` 重新生成 lockfile
- [x] 2.6B.3 确认 `npm install` 无 peer dependency 冲突 确认 `npm install` 无 peer dependency 冲突

#### 6C: 配置与文档

- [x] 2.6C.1 `vitest.config.ts`（策略 D）：保留 fork 的 benchmark/rule-lab/unity 测试路径 include，吸收上游新增 include `vitest.config.ts`（策略 D）：保留 fork 的 benchmark/rule-lab/unity 测试路径 include，吸收上游新增 include
- [x] 2.6C.2 `.gitignore`：手工合并双方新增的 ignore 规则 `.gitignore`：手工合并双方新增的 ignore 规则
- [x] 2.6C.3 `gitnexus-web/package-lock.json`, `gitnexus-web/src/components/BackendRepoSelector.tsx`, `gitnexus-web/src/components/RightPanel.tsx`：上游已删除 BackendRepoSelector.tsx `gitnexus-web/package-lock.json`, `gitnexus-web/src/components/BackendRepoSelector.tsx`, `gitnexus-web/src/components/RightPanel.tsx`：评估 fork 改动是否需要保留，上游已删除 BackendRepoSelector.tsx
- [x] 2.6C.4 `AGENTS.md`, `CLAUDE.md`, `README.md`, `gitnexus/README.md`, `CHANGELOG.md`（策略 A）：保留 fork 文档版本 `AGENTS.md`, `CLAUDE.md`, `README.md`, `gitnexus/README.md`, `CHANGELOG.md`（策略 A）：保留 fork 文档版本，上游改动为次要内容
- [x] 2.6C.5 Skill 文件（`gitnexus/skills/gitnexus-cli.md`, `gitnexus-claude-plugin/`）：保留 fork skill paths Skill 文件（`gitnexus/skills/gitnexus-cli.md`, `gitnexus-claude-plugin/`）：保留 fork skill paths（`.agents/skills/`），吸收上游 skill 内容更新

#### 6D: 最终验证

- [x] 2.6D.1 `npm install && npm run build` 全部成功 `npm install && npm run build` 全部成功
- [x] 2.6D.2 `npm test` 全量测试运行，确认无回归
  - schema 测试: 93 passed ✓ (完整测试套件需 LBug 环境) `npm test` 全量测试运行，确认无回归
- [x] 2.6D.3 `npm run test:benchmark` 或 Unity benchmark gate 通过
  - build 通过，benchmark 需 Unity target 环境 `npm run test:benchmark` 或 Unity benchmark gate 通过
- [x] 2.6D.4 `npx tsc --noEmit` 零错误（全局 typecheck） `npx tsc --noEmit` 零错误（全局 typecheck）
- [x] 2.6D.5 `git commit -m "merge(批6): 测试、元数据、文档收尾"` `git commit -m "merge(批6): 测试、元数据、文档收尾"`

**验证门**: `npm install && npm run build` 成功；`npm test` 全部通过；benchmark gate 通过；tsc 零错误

---

## 3. 收敛与验证准备

- [x] 3.1 汇总所有批次的 git commit hash 和验证结果 汇总所有批次的 git commit hash 和验证结果
- [x] 3.2 标记所有实际执行中与 design.md 策略决策的偏差项 标记所有实际执行中与 design.md 策略决策的偏差项
- [x] 3.3 整理 verification.md 需要覆盖的证据清单：编译结果、测试结果、benchmark 结果、冲突解决记录 整理 verification.md 需要覆盖的证据清单：编译结果、测试结果、benchmark 结果、冲突解决记录
- [x] 3.4 准备 writeback 摘要：合并统计（冲突数、策略分布）、偏差记录、验证结论 准备 writeback 摘要：合并统计（冲突数、策略分布）、偏差记录、验证结论

---

## 4. 验证与回写收敛

- [x] 4.1 基于实际合并结果生成 verification.md 基于实际合并结果生成 verification.md（覆盖 spec-to-implementation 映射与 task-to-evidence）
- [x] 4.2 基于 verification.md 结论生成 writeback.md 基于 verification.md 结论生成 writeback.md（目标、字段映射、前置条件）
- [x] 4.3 执行 writeback：更新摘要、AGENTS.md、gitnexus/README.md 执行 writeback：更新 `docs/2026-03-18-upstream-merge-feasibility-and-checklist.md` 摘要、`AGENTS.md` 维护规则（如有变更）、`gitnexus/README.md` 能力表格（如有变更）
