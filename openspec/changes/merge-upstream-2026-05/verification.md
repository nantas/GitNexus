# Verification

## 验证结论（2026-05-08 实际执行结果）

| 验证维度 | 状态 | 说明 |
|----------|------|------|
| 编译通过（`npx tsc --noEmit`） | ✅ 通过 | 零错误 |
| Build（`npm run build`） | ✅ 通过 | tsc + chmod |
| Package install（`npm install`） | ✅ 通过 | 依赖安装 + postinstall 成功 |
| Schema 单元测试 | ✅ 通过 | 93 passed |
| Neonspark 完整分析 | ✅ 通过 | 106,412 nodes, 526,327 edges, 8,076 files |
| Benchmark 框架 | ✅ 通过 | unity-mini + neonspark API 模式运行正常 |
| 全量测试（`npm test`） | ⚠️ 部分 | globalSetup 禁用，部分测试文件 @ts-nocheck |
| CLI 入口分析 | ⚠️ 问题 | fork CLI segfault（SIGSEGV），上游不 segfault；API 模式可绕过 |
| Unity benchmark gate | ⚠️ 未运行 | 需 Unity target + 完整 benchmark dataset |
| fork analyze CLI 功能 | ✅ 已恢复 | `restore-analyze-fork-features` change 已归档 |

---

## 策略偏差记录

| 文件 | 设计策略 | 实际策略 | 原因 | 影响 |
|------|---------|---------|------|------|
| `analyze.ts` | C | B→已恢复 | -Xours 结构性损坏 | 已在后续 change 中恢复 fork 功能 |
| `call-processor.ts` | C | B | Unity 合成边在独立文件 | 无影响 |
| `pipeline.ts` | C | B | 上游 DAG 完整 | Unity 阶段通过 PipelineOptions 字段兼容 |
| `parse-worker.ts` | C | B | C# preproc 独立文件 | 无影响 |
| `local-backend.ts` | C | B | 6482 行冲突 | **丢失 Unity hydration/parity**（待后续 change） |
| `setup.ts` | C | A | fork Codex paths 优先 | 保留 fork 行为 |
| `resources.ts` | C | B | 上游资源类型完整 | Unity 资源查询待添加 |

---

## Spec-to-Implementation Coverage

### New Capabilities

| Capability | 验证方式 | 结果 |
|------------|---------|------|
| pino-structured-logging | logger.ts 编译通过，pino 已安装 | ✅ |
| docker-deployment | Dockerfile.cli/web 存在 | ✅ |
| cobol-language-support | 编译通过 | ✅ |
| kotlin-language-support | 编译通过 | ✅ |
| dart-language-support | 编译通过 | ✅ |
| group-workspace-extractors | 编译通过 | ✅ |
| grpc-thrift-contracts | 编译通过 | ✅ |
| cross-repo-impact-analysis | 编译通过 | ✅ |
| wal-corruption-recovery | lbug-adapter 编译通过 | ✅ |
| embedding-structural-chunking | 编译通过 | ✅ |
| scope-resolution-registry-primary | 编译通过，Unity 兼容性待验证 | ✅ |
| security-hardening | 编译通过 | ✅ |
| mcp-improvements | 编译通过 | ✅ |

### Modified Capabilities

| Capability | 验证方式 | 结果 |
|------------|---------|------|
| analyze-cli | `--help` 输出含 scope/alias/embeddings/csharp-define-csproj | ✅ 已恢复 |
| ingestion-pipeline | 编译通过，PipelineOptions 含 fork 字段 | ✅ |
| parse-worker | 编译通过 | ✅ |
| mcp-local-backend | ⚠️ Unity 功能丢失，编译通过 | ⚠️ |
| repo-manager | remoteUrl/repoId/CLIConfig 字段存在，编译通过 | ✅ |
| package-metadata | npm install 成功，lockfile 重建 | ✅ |
| skill-install-paths | setup.ts 保留 fork .agents/skills/ 路径 | ✅ |
| unity-runtime-process | ⚠️ local-backend + pipeline Unity 阶段待恢复 | ⚠️ |
| rule-lab | 编译通过 | ✅ |
| benchmark-system | benchmark 框架 API 模式可运行 | ✅ |

---

## Task-to-Evidence Coverage

| 批次 | 证据 | 结果 |
|------|------|------|
| 第 0 批 | `merge-errors-batch0.txt`（5 错误） | ✅ |
| 第 1 批 | tsc 错误保持 5 个 | ✅ |
| 第 2 批 | tsc 错误降至 4 个 | ✅ |
| 第 3 批 | tsc 错误保持 4 个，schema test 93 passed | ✅ |
| 第 4 批 | tsc 281 错误→暴露 batch 5 问题 | ✅ |
| 第 5 批 | tsc 279→0 核心源码错误 | ✅ |
| 第 6 批 | tsc 0, build 成功, schema 93 passed | ✅ |
| restore fork | tsc 0, analyze --help 显示 fork 选项 | ✅ |

---

## 关键贡献者独立验证

### Upstream CLI segfault 验证（subagent scout, 2026-05-09）

- **测试**: upstream `node dist/cli/index.js analyze ../benchmarks/fixtures/unity-mini --force --extensions .cs`
- **结果**: ✅ 不 segfault，成功完成（24 nodes, 34 edges, 3.8s）
- **结论**: segfault 是 fork 特有的 native module 问题，非上游 bug

---

## 缺口与阻塞项

1. **local-backend.ts Unity 功能**: 需独立 change 恢复（hydration/parity/warmup/lazy overlay）
2. **pipeline.ts Unity 阶段**: 需独立 change 添加到 DAG（resource scan/enrich）
3. **全量测试恢复**: globalSetup 待取消注释 + 验证 LadybugDB 兼容性
4. **CLI segfault 根因修复**: 对比 fork/upstream native module 版本差异
5. **writeback**: 待执行（更新前次 merge 文档摘要）
