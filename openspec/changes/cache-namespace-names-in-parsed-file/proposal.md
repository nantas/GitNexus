# Proposal

## 问题定义

`populateCsharpNamespaceSiblings` 在 scope-resolution finalize 阶段对每个 C# 文件执行了一次额外的 tree-sitter parse 以提取命名空间名称字符串。在 3046 文件的 neonnew 测试中，这导致 **29.3 秒额外耗时**（占 finalize 阶段 75%，总耗时 38%）。

根因：`ParsedFile.Scope` 结构携带 `kind: 'Namespace'` 但不携带命名空间**名称字符串**。名称仅在 tree-sitter AST 中（`namespace_declaration name:` 字段），scope extraction 阶段在 worker 中已访问该节点但丢弃了名称数据。后续 `populateCsharpNamespaceSiblings` 只能自行重新 parse 每个文件来恢复名称。

详见 `docs/plans/2026-05-11-neonnew-e2e-profile.md`。

## 范围边界

- **包含**：`ParsedFile` 接口扩展、scope extraction 阶段捕获命名空间名称、`deriveCsharpFileStructure` 优化为无 tree-sitter AST walk
- **不包含**：`using static` 路径的优化（需 AST，但出现频率低可以保留当前路径）
- **不包含**：扩展 `Scope` 接口增加 `name` 字段（只扩展 `ParsedFile`）

## Capabilities

### New Capabilities

- `namespace-names-in-parsed-file`: 在 `ParsedFile` 上增加 `namespaceNames` 字段，scope extraction 阶段从 tree-sitter AST 提取命名空间名称并通过 IPC 传递到主进程；`deriveCsharpFileStructure` 优先使用该字段而非重新 tree-sitter parse

### Modified Capabilities

- `namespace-siblings-perf`: 修改 `populateCsharpNamespaceSiblings` 中命名空间提取的实现路径，从「全量 tree-sitter parse」改为「优先使用 parsedFile.namespaceNames，fallback 到 tree-sitter」

## Capabilities 待确认项

- [x] 能力清单已确认（单项性能优化，范围清晰）

## Impact

| 维度 | 影响 |
|------|------|
| 性能 | `namespaceSiblings` 预计从 29.3s 降至 < 100ms（3046 files） |
| 接口 | `ParsedFile` 增加可选 `namespaceNames` 字段，向后兼容 |
| IPC | 增加 `string[]` 传输，每次 IPC 增加 ~100 bytes/file 载荷 |
| 正确性 | `extractCsharpScopeCaptures` 已提取命名空间名称，与 `deriveCsharpFileStructure` 的 AST walk 语义等价 |

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 标准页：`repo://orbitos:openspec/schemas/orbitos-change-v1.yaml`
  - 项目页：`docs/plans/2026-05-11-neonnew-e2e-profile.md`
  - 回写目标：同上（更新最终测量结论）
