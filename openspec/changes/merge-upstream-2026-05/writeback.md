# Writeback

## 回写摘要

- **change**: `merge-upstream-2026-05` — 将 upstream/main (HEAD `1d46200c`) 合并到 nantas-dev
- **执行日期**: 2026-05-08
- **分支**: `chore/merge-upstream-2026-05`
- **基线 commit**: `c654bab0` (merge upstream/main -Xours)
- **最终 commit**: `067700a0` (依赖修复 + LocalBackend Unity 功能恢复 + 测试修复)
- **关键结果**: 合并完成，13 个新能力吸收，7/10 既有能力完整融合，3 个既有能力（local-backend, unity-runtime-process, benchmark-system）部分融合待后续恢复

---

## 合并统计

| 指标 | 值 |
|------|-----|
| 批次 | 7（0-6） |
| 处理文件数 | ~81 个冲突文件 + ~1800 个无冲突文件 |
| 策略分布 | A: 4, B: 52, C→B: 7, D: 18 |
| 编译结果 | 零错误 |
| 测试结果 | schema 93 passed, calltool-dispatch 69/69 ✅, tools 25/25 ✅, resources 38/38 ✅, bridge-db + group-cli +18 ✅ |
| 分析验证 | neonspark 106K nodes, 526K edges |
| CLI segfault | ✅ LadybugDB 0.16.1 升级后修复 |

---

## Capability 融合状态

| Capability | 变更类型 | 状态 |
|------------|---------|------|
| pino-structured-logging | New | ✅ 完全吸收 |
| docker-deployment | New | ✅ 完全吸收 |
| cobol-language-support | New | ✅ 完全吸收 |
| kotlin-language-support | New | ✅ 完全吸收 |
| dart-language-support | New | ✅ 完全吸收 |
| group-workspace-extractors | New | ✅ 完全吸收 |
| grpc-thrift-contracts | New | ✅ 完全吸收 |
| cross-repo-impact-analysis | New | ✅ 完全吸收 |
| wal-corruption-recovery | New | ✅ 完全吸收 |
| embedding-structural-chunking | New | ✅ 完全吸收 |
| scope-resolution-registry-primary | New | ✅ 完全吸收 |
| security-hardening | New | ✅ 完全吸收 |
| mcp-improvements | New | ✅ 完全吸收 |
| analyze-cli | Modified | ✅ 完整融合（fork 功能已恢复） |
| ingestion-pipeline | Modified | ✅ 完整融合（含 PipelineOptions 兼容） |
| parse-worker | Modified | ✅ 完整融合 |
| repo-manager | Modified | ✅ 完整融合 |
| package-metadata | Modified | ✅ 完整融合（2026-05-09 追加修复：9 个降级依赖同步上游版本） |
| skill-install-paths | Modified | ✅ 完整融合 |
| rule-lab | Modified | ✅ 编译兼容 |
| mcp-local-backend | Modified | ✅ adapter 注入恢复（attachUnityContext + enrichWithUnityEvidence） |
| unity-runtime-process | Modified | ✅ local-backend + pipeline Unity 阶段均已恢复 |
| benchmark-system | Modified | ✅ API 模式稳定（绕过 LadybugDB 8GB 堆 segfault），neonspark 106K nodes 验证通过 |

---

## 策略偏差记录

| 文件 | 设计 | 实际 | 原因 | 后续 |
|------|------|------|------|------|
| analyze.ts | C | B | -Xours 结构性损坏 | ✅ fork 功能已在 restore-analyze-fork-features 恢复 |
| call-processor.ts | C | B | Unity 合成边在独立文件 | 无需后续 |
| pipeline.ts | C | B | 上游 DAG 完整 | ⚠️ Unity 阶段待添加到 DAG |
| parse-worker.ts | C | B | C# preproc 独立文件 | 无需后续 |
| local-backend.ts | C→B→✅D | 6482 行冲突 → adapter 模式 | ✅ adapter 注入完成 |
| setup.ts | C | A | fork Codex paths 优先 | ✅ 已保留 |
| resources.ts | C→B→✅D | 上游资源类型完整 + fork 适配 | ✅ derived-process + lifecycle 已添加 |
| tools.ts | C→B→✅D | 上游工具注解完整 + fork 适配 | ✅ rule_lab_* + unity_ui_trace 已添加 |

---

## 已知问题（明天继续上下文）

1. ✅ ~~**CLI segfault (SIGSEGV)**~~: **已修复**（2026-05-09）。根因是 `@ladybugdb/core` 在合并 batch 6 中被从 ^0.16.1 降级为 ^0.15.1。升级到 0.16.1 后 `gitnexus analyze` 在 unity-mini 上正常完成。
2. ✅ **local-backend.ts Unity 功能**: adapter 模式恢复完成
3. ✅ **pipeline.ts Unity 阶段**: DAG phases 已注册
4. ✅ **calltool-dispatch 18 failures**: 全部修复（69/69 passed）
5. ⚠️ **全量测试**: globalSetup 已取消注释，11 个文件 34 个回归待修复（fork 被删函数）
6. **benchmark npm scripts**: `--scope-manifest` 已替换为 `--scope` flags，`analyze-runner.ts` 改为 API 模式。

---

## 回写目标

| 目标页 | 同步内容 | 状态 |
|--------|---------|------|
| `docs/2026-03-18-upstream-merge-feasibility-and-checklist.md` | 文末新增 § 2026-05-08/09 执行结果（commit hash、策略偏差、验证结论） | ✅ 已执行（含 Unity 功能恢复记录） |
| `AGENTS.md` | CLI Setup 安装内容索引（已有变更） | ✅ 已更新（v1.8.0 — 依赖冲突指南 + Unity 指南） |
| `gitnexus/README.md` | 能力表格（语言支持、CLI 命令） | ⬜ 待评估 |

---

## 回写前置条件

- [x] 已读取 `spec_standard_ref`（`repo://gitnexus-upstream`）
- [x] `verification.md` 已更新为实际结果
- [ ] 回写目标页已确认存在且可编辑
- [x] capability/spec 增量摘要已核对 proposal 与 specs 一致

## 不回写的内容

- 不复制完整 proposal/design/specs/tasks 正文
- 不回写 upstream 仓库
- 不写与本次 change 无关的历史信息
- 不回写 benchmark 详细数据（仅摘要结论）
