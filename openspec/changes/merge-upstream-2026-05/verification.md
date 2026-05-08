# Verification

## 验证结论

> ⚠️ 以下为**预期验证计划**，验证结论将在合并执行后填入实际结果。

| 验证维度 | 状态 | 说明 |
|----------|------|------|
| 编译通过（`npx tsc --noEmit`） | 待验证 | 执行第 0-6 批后确认零错误 |
| 全量测试（`npm test`） | 待验证 | 执行第 6 批后确认 |
| Unity benchmark gate | 待验证 | benchmark-unity / u3:gates 通过 |
| 策略偏差记录 | 待验证 | call-processor.ts / local-backend.ts 若降级需记录 |

## Spec-to-Implementation Coverage

### New Capabilities

| Capability | Spec 路径 | 对应任务 | 验证方式 |
|------------|-----------|---------|---------|
| pino-structured-logging | `specs/pino-structured-logging/spec.md` | 第 5 批（server.ts, local-backend.ts） | 日志输出到 stderr，stdout 仅 JSON-RPC |
| docker-deployment | `specs/docker-deployment/spec.md` | 第 6 批（文件吸收） | Dockerfile.cli/web 存在且可构建 |
| cobol-language-support | `specs/cobol-language-support/spec.md` | 第 1 批（utils/config） | 测试文件 `test/unit/cobol-preprocessor.test.ts` 通过 |
| kotlin-language-support | `specs/kotlin-language-support/spec.md` | 第 1 批（config/utils） | 测试 `resolvers/kotlin.test.ts` 通过 |
| dart-language-support | `specs/dart-language-support/spec.md` | 第 1 批（config/utils） | 测试 `resolvers/dart.test.ts` 通过 |
| group-workspace-extractors | `specs/group-workspace-extractors/spec.md` | 第 1-2 批 | 测试 `group/` 目录下测试通过 |
| grpc-thrift-contracts | `specs/grpc-thrift-contracts/spec.md` | 第 1 批 | 测试 `grpc-extractor.test.ts`, `thrift-extractor.test.ts` 通过 |
| cross-repo-impact-analysis | `specs/cross-repo-impact-analysis/spec.md` | 第 5 批（tools/resources） | `group/group-impact.test.ts` 通过 |
| wal-corruption-recovery | `specs/wal-corruption-recovery/spec.md` | 第 3 批（lbug-adapter） | `test/unit/lbug-checkpoint.test.ts` 等通过 |
| embedding-structural-chunking | `specs/embedding-structural-chunking/spec.md` | 第 1 批 | `test/unit/embedding-chunking.test.ts` 通过 |
| scope-resolution-registry-primary | `specs/scope-resolution-registry-primary/spec.md` | 第 2-3 批（import/heritage/type-env） | scope-resolution 目录下测试通过 |
| security-hardening | `specs/security-hardening/spec.md` | 全部批次（安全修复分散在各文件） | `test/unit/security.test.ts`, `test/unit/rate-limit.test.ts` 等通过 |
| mcp-improvements | `specs/mcp-improvements/spec.md` | 第 5 批（server/tools/staleness） | MCP 集成测试通过，工具注解存在 |

### Modified Capabilities

| Capability | Spec 路径 | 对应任务 | 验证方式 |
|------------|-----------|---------|---------|
| analyze-cli | `specs/analyze-cli/spec.md` | 第 4 批 2.4.7 | `--help` 输出含 scope/alias/embeddings |
| ingestion-pipeline | `specs/ingestion-pipeline/spec.md` | 第 5 批 2.5.6 | Unity analyze 产出 pipeline profile 含 Unity 阶段 |
| parse-worker | `specs/parse-worker/spec.md` | 第 5 批 2.5.7 | C# preproc 调用正确，LanguageProvider dispatch 不崩溃 |
| mcp-local-backend | `specs/mcp-local-backend/spec.md` | 第 5 批 2.5.8 | Unity context 查询返回 resourceBindings + derivedProcesses |
| repo-manager | `specs/repo-manager/spec.md` | 第 5 批 2.5.5 | alias 注册/GITNEXUS_HOME 可用 |
| package-metadata | `specs/package-metadata/spec.md` | 第 6 批 2.6B | `npm install` 成功，lockfile 一致 |
| skill-install-paths | `specs/skill-install-paths/spec.md` | 第 6 批 2.6C.5 | setup 安装路径为 `.agents/skills/gitnexus/` |
| unity-runtime-process | `specs/unity-runtime-process/spec.md` | 全部批次（适配） | benchmark gate 通过 |
| rule-lab | `specs/rule-lab/spec.md` | 全部批次（适配） | `rule-lab compile` 成功 |
| benchmark-system | `specs/benchmark-system/spec.md` | 全部批次（适配） | benchmark CLI 可执行 |

## Task-to-Evidence Coverage

| 批次 | 关键任务 ID | 证据类型 | 预期证据 |
|------|-----------|---------|---------|
| 第 0 批 | 2.0.4 | 编译错误日志 | `merge-errors-batch0.txt` |
| 第 1 批 | 2.1.5 | tsc 输出 | 错误数 ≤ 基线 60% |
| 第 2 批 | 2.2.7 | 测试结果 | 管线测试全部通过 |
| 第 3 批 | 2.3.6 | 决策记录 | call-processor.ts 策略（C 成功 或 降级 D + 原因） |
| 第 3 批 | 2.3.9 | 测试结果 | schema/csv/process 测试通过 |
| 第 4 批 | 2.4.9 | CLI 输出截图 | 所有 CLI help 正常 |
| 第 5 批 | 2.5.10 | 测试结果 | 核心测试全部通过 |
| 第 6 批 | 2.6D.2 | 测试结果 | `npm test` 全量通过 |
| 第 6 批 | 2.6D.3 | benchmark 报告 | Unity gate 通过 |

## 关键证据入口

| 证据类型 | 证据路径/链接 | 对应 requirement/task |
|----------|--------------|----------------------|
| 基线编译错误 | `merge-errors-batch0.txt`（仓库根目录） | 2.0.4 |
| 第 5 批核心测试输出 | CI/test runner 输出 | 2.5.10 |
| Unity benchmark 报告 | `npm run test:benchmark` 或 `u3:gates` 输出 | `unity-runtime-process` spec Requirement: Regression Gate |
| call-processor 策略偏差 | tasks.md 2.3.6 执行后注释 | `call-processor` Modified Capability |
| local-backend 融合提交 | `git diff HEAD~1 -- gitnexus/src/mcp/local/local-backend.ts` | `mcp-local-backend` spec 全部 requirements |

## 缺口与阻塞项

- 验证结论将在**实际合并执行后**填入
- 若 `call-processor.ts` 降级为策略 D（fork+port），需在偏差记录中明确原因和对 Unity 合成边的影响
- 若 `local-backend.ts` 融合后 Unity context 查询出现回归，需在 verification 中标记为阻塞项并提交修复 PR
- 上游某些测试（如 Kotlin test fixtures）可能因 tree-sitter 二进制不兼容而在特定平台失败 — 此类失败不计入验证阻塞
