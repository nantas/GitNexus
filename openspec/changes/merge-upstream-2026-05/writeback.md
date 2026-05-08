# Writeback

## 回写摘要

- change：`merge-upstream-2026-05` — 将 upstream/main 合并到 nantas-dev
- 回写结论：待合并执行后填入
- 关键结果：合并后 13 个新能力 + 10 个既有能力的融合后状态

## Capability / Spec 增量摘要

| Capability | 变更类型 | 对应 spec 文件 | 增量摘要 |
|------------|---------|---------------|---------|
| pino-structured-logging | New | `specs/pino-structured-logging/spec.md` | pino 替换 console.log，stdout/stderr 分离 |
| docker-deployment | New | `specs/docker-deployment/spec.md` | Dockerfile.cli/web + docker-compose + health endpoint |
| cobol-language-support | New | `specs/cobol-language-support/spec.md` | COBOL 文件检测 + COPY 展开 |
| kotlin-language-support | New | `specs/kotlin-language-support/spec.md` | Kotlin 解析 + null-check narrowing + extension |
| dart-language-support | New | `specs/dart-language-support/spec.md` | Dart 解析 + await/cascade/lambda 调用模式 |
| group-workspace-extractors | New | `specs/group-workspace-extractors/spec.md` | 5 语言 workspace auto-discover + contract extraction |
| grpc-thrift-contracts | New | `specs/grpc-thrift-contracts/spec.md` | .proto/.thrift 解析 + 实现匹配 |
| cross-repo-impact-analysis | New | `specs/cross-repo-impact-analysis/spec.md` | @repo MCP routing + group impact |
| wal-corruption-recovery | New | `specs/wal-corruption-recovery/spec.md` | WAL quarantine + CHECKPOINT + safeClose |
| embedding-structural-chunking | New | `specs/embedding-structural-chunking/spec.md` | AST-aware chunking + HF_ENDPOINT + limit |
| scope-resolution-registry-primary | New | `specs/scope-resolution-registry-primary/spec.md` | TS/C#/Python/Go registry-primary + fork Unity 兼容 |
| security-hardening | New | `specs/security-hardening/spec.md` | Path injection/SSRF/tempfile/ReDoS/rate-limit 修复 |
| mcp-improvements | New | `specs/mcp-improvements/spec.md` | Parallel staleness + tool annotations + stdout discipline |
| analyze-cli | Modified | `specs/analyze-cli/spec.md` | scope/alias/embeddings 融合，clean 保留 config |
| ingestion-pipeline | Modified | `specs/ingestion-pipeline/spec.md` | DAG + Unity 阶段共存 |
| parse-worker | Modified | `specs/parse-worker/spec.md` | C# preproc + LanguageProvider + route extraction |
| mcp-local-backend | Modified | `specs/mcp-local-backend/spec.md` | Unity hydration + query safety 融合 |
| repo-manager | Modified | `specs/repo-manager/spec.md` | alias/GITNEXUS_HOME + Windows/path 硬化 |
| package-metadata | Modified | `specs/package-metadata/spec.md` | @veewo scope + 依赖合并 + lockfile 重建 |
| skill-install-paths | Modified | `specs/skill-install-paths/spec.md` | .agents/skills/ 路径 + shared contracts |
| unity-runtime-process | Modified | `specs/unity-runtime-process/spec.md` | 功能不变，基础设施适配 |
| rule-lab | Modified | `specs/rule-lab/spec.md` | 功能不变，基础设施适配 |
| benchmark-system | Modified | `specs/benchmark-system/spec.md` | 功能不变，基础设施适配 |

## 验证结论与证据入口

> 待合并执行后填入实际结果。

| 验证维度 | 结论 | 证据入口 |
|----------|------|---------|
| Spec-to-Implementation | 待验证 | `verification.md` § Spec-to-Implementation Coverage |
| Task-to-Evidence | 待验证 | `verification.md` § Task-to-Evidence Coverage |
| Unity benchmark gate | 待验证 | `npm run test:benchmark` 或 `u3:gates` 输出 |

## 回写目标与字段映射

| 目标页 | 同步字段/区块 | 回写内容 |
|--------|-------------|---------|
| `docs/2026-03-18-upstream-merge-feasibility-and-checklist.md` | 文末新增 § 执行结果 | 本次合并摘要：日期、commit hash、冲突数、策略偏差、验证结论 |
| `AGENTS.md` | CLI install content 索引表 | 如合并后 CLI 行为有变，更新 `CLI Setup 安装内容索引` 中的文件清单 |
| `gitnexus/README.md` | 能力表格 | 如合并后语言支持有变，更新 Supported Languages 和能力描述 |

## 回写执行结果

> 待合并执行后填入。

| 目标页 | 执行结果 | 执行时间 | 执行人 | 结果说明/链接 |
|--------|---------|---------|--------|-------------|
| `docs/2026-03-18-upstream-merge-feasibility-and-checklist.md` | 待执行 | — | — | — |
| `AGENTS.md` | 待执行 | — | — | — |
| `gitnexus/README.md` | 待执行 | — | — | — |

## 回写前置条件

- [ ] 已读取 `spec_standard_ref`（`repo://gitnexus-upstream`）
- [ ] `verification.md` 已生成且无阻塞项（编译/测试/benchmark 全部通过）
- [ ] 回写目标页已确认存在且可编辑
- [ ] capability/spec 增量摘要已核对 proposal 与 specs 一致

## 不回写的内容

- 不复制完整 `proposal.md`、`design.md`、`specs/*/spec.md`、`tasks.md` 正文
- 不回写 upstream 仓库（不在本次 change 范围内）
- 不写与本次 change 无关的历史信息
- 不回写 benchmark 报告详细数据（仅摘要结论）
