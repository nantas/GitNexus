# Proposal

## 问题定义

`nantas-dev` 分支自与 `upstream/main` 分叉以来，双方各自独立演进 **1077 个 commits**（fork 502 + upstream 575）。分叉时间跨度大，双方在 **81 个核心文件**上同时进行了修改：

- **Fork 侧** 建设了 Unity runtime process、rule-lab、benchmark、C# 预处理器、analyze options 简化等能力（851 个独有文件）
- **Upstream 侧** 新增了多语言支持（Kotlin/COBOL/Dart）、Docker 部署、Group 功能、安全加固、scope resolution 重构、pino 日志等能力（1810 个独有文件）

直接 `git merge upstream/main` 将产生 **40-50+ 个冲突**，且核心管线文件（pipeline、local-backend、call-processor、parse-worker）的语义冲突无法通过冲突标记自动解决。

因此需要：以**逐文件分批合并**策略，系统性吸收 upstream 改进，同时完整保留 fork 的核心能力（Unity runtime process、rule-lab、benchmark）。

## 范围边界

### 在范围内

- 将 `upstream/main`（HEAD `1d46200c`）合并到 `nantas-dev`
- 逐文件解决 81 个重叠文件的冲突
- 吸收 upstream 的安全修复、WAL 恢复、语言支持、Docker、Group、scope resolution 等
- 保留 fork 的 Unity runtime process、rule-lab、benchmark、C# preproc、analyze options 简化
- 合并后通过编译、核心测试、Unity benchmark gate

### 不在范围内

- 从零实现 upstream 的任何新功能
- 修改 upstream 的代码逻辑
- 回写 upstream 仓库
- 合并 upstream 的非 `main` 分支
- 后续的 `@veewo/gitnexus` 包发布

## Capabilities

### New Capabilities

- `pino-structured-logging`: 从上游吸收 pino 结构化日志系统，替代 fork 的 console.log 日志
- `docker-deployment`: 从上游吸收 Docker 构建与部署支持（docker-compose、Dockerfile.cli/web、health endpoint）
- `cobol-language-support`: 从上游吸收 COBOL 语言解析与索引支持
- `kotlin-language-support`: 从上游吸收 Kotlin 语言解析与索引支持
- `dart-language-support`: 从上游吸收 Dart 语言解析与索引支持（vendor tree-sitter-dart）
- `group-workspace-extractors`: 从上游吸收 Group workspace extractors（Node/Python/Go/Java/Elixir）
- `grpc-thrift-contracts`: 从上游吸收 gRPC 和 Thrift 协议契约提取
- `cross-repo-impact-analysis`: 从上游吸收跨仓库影响分析（@repo MCP routing + group resources）
- `wal-corruption-recovery`: 从上游吸收 WAL 损坏隔离与恢复机制
- `embedding-structural-chunking`: 从上游吸收 AST-aware 结构化分块与 HF_ENDPOINT 配置
- `scope-resolution-registry-primary`: 从上游吸收 TypeScript/C#/Python/Go 的 registry-primary scope resolution 管线
- `security-hardening`: 从上游吸收 URL/Regex/路径注入修复、tempfile 安全化、速率限制、MCP 工具安全注解
- `mcp-improvements`: 从上游吸收并行 staleness check、import-closure、stdout discipline、工具安全注解

### Modified Capabilities

- `analyze-cli`: fork 的 scoped-analyze/alias/reuse-options 与 upstream 的 finalize/embeddings 融合
- `ingestion-pipeline`: fork 的 Unity 阶段/scope-filter 与 upstream 的 DAG 重构/RouteExtractor 融合
- `parse-worker`: fork 的 C# preproc 与 upstream 的 LanguageProvider/RouteExtractor 融合
- `mcp-local-backend`: fork 的 Unity hydration/lazy/parity/warmup 与 upstream 的 Cypher 参数化/query 安全融合
- `repo-manager`: fork 的 alias/GITNEXUS_HOME 与 upstream 的 Windows 路径硬化融合
- `package-metadata`: 双方 package.json/package-lock.json 依赖的合并与 lockfile 重建
- `skill-install-paths`: fork 的 `.agents/skills/` 路径与上游的 skill 内容更新融合
- `unity-runtime-process`: 基础设施变更后的兼容性适配（功能本身不变）
- `rule-lab`: 基础设施变更后的兼容性适配（功能本身不变）
- `benchmark-system`: 基础设施变更后的兼容性适配（功能本身不变）

## Capabilities 待确认项

- [ ] 能力清单已与用户确认

## Impact

### 正面影响

- **安全基线大幅提升**：吸收 upstream 的 15+ 安全修复
- **语言支持扩展**：新增 Kotlin、COBOL、Dart，scope resolution 多语言增强
- **运维能力增强**：Docker 部署、WAL 恢复、pino 结构化日志
- **分析能力增强**：scope resolution registry-primary、cross-repo impact、embedding 分块
- **代码质量提升**：吸收上游 CI/CD 全面重写中的测试和 tooling 改进

### 风险

- 81 个重叠文件的合并工作量巨大，预计需要 3-5 天集中处理
- `call-processor.ts`（upstream 3554 行改动）和 `local-backend.ts`（fork 2549 + upstream 3933 行）是最高风险融合点
- 合并后 Unity benchmark gate 可能出现回归，需预留调试时间
- 上游删除了 `gitnexus-web/` 下大量文件（迁移到统一管线），可能与 fork 的 web 改动冲突

### 受影响方

- **所有 nantas-dev 下游消费者**：合并后需重新 build 和测试
- **Unity runtime process 用户**：功能不变但内部管线有变，需要重新验证
- **Benchmark 运行者**：基础设施变更后需重新校准

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 标准页：`repo://gitnexus-upstream`
  - 项目页：`docs/2026-03-18-upstream-merge-feasibility-and-checklist.md`（前次分析）
  - 回写目标：前次 merge 文档、AGENTS.md、gitnexus/README.md
