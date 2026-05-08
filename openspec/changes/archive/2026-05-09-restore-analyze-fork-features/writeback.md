# Writeback

## 回写目标与结论

| 目标文件 | 变更内容 | 状态 |
|----------|---------|------|
| `AGENTS.md` | 无需变更。analyze CLI 参数变化已在 `gitnexus/README.md` 中体现，AGENTS.md 的维护规则未涉及新增参数的具体描述。 | ✅ 已确认 |
| `gitnexus/README.md` | 在 CLI Commands 段落补充恢复的 fork 选项：`--name`、`--scope`、`--csharp-define-csproj`、`--reuse-options`（通过 `--no-reuse-options` 的反向语义）。 | ✅ 已更新 |
| `openspec/changes/merge-upstream-2026-05/verification.md` | 在偏差记录中补充：第 4 批 `analyze-cli` 恢复过程中发现的 `unityRuleBindingResult` 类型不匹配、fallbackStats 未填充、废弃测试删除等偏差。 | ✅ 已更新 |

## 具体回写内容

### gitnexus/README.md

在 `gitnexus analyze` CLI 示例块中补充恢复的选项：

```
gitnexus analyze --name my-lib           # Register repo under a custom alias
gitnexus analyze --scope src/core        # Restrict analysis to a subdirectory (repeatable)
gitnexus analyze --csharp-define-csproj Assembly-CSharp.csproj  # Load C# conditional-compilation defines
gitnexus analyze --reuse-options         # Reuse stored options from meta.json (default true; --no-reuse-options to disable)
```

### merge-upstream-2026-05/verification.md

在 "缺口与阻塞项" 后追加偏差记录：

```markdown
### restore-analyze-fork-features 偏差记录

- `types/pipeline.ts` 中 `unityRuleBindingResult` 的类型定义与实际运行时值不匹配，已在恢复 change 中修正为 `UnityRuntimeBindingResult`。
- `loadGraphToLbug` 不返回 fallback insert stats，因此 `DiagnosticsContext.fallbackWarnings` / `fallbackStats` 暂未填充，接口已预留。
- 废弃的 `test/unit/analyze-pipeline-options.test.ts`（依赖已移除的 `buildPipelineRunOptionsForAnalyze`）已在恢复过程中删除。
- `analyze.ts` 新增 `loadMeta` 导入导致两个单元测试需要补充 mock，已在恢复过程中修复。
```
