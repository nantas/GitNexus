# Proposal

## 问题定义

`merge-upstream-2026-05` change 执行了 7 个批次的合并，吸收了 13 个新能力和 10 个既有能力的融合。合并后剩余以下问题，阻塞 change 的最终收敛：

**测试回归（5 个文件，14 个用例）：**

| 测试文件 | 失败数 | 根因 |
|----------|--------|------|
| `test/unit/skip-git-cli.test.ts` | 4 | `--skip-git` 和 `--skip-agents-md` CLI 执行直接报错 |
| `test/unit/tool-direct-cli.test.ts` | 5 | `detectChangesCommand` 函数从 `src/cli/tool.ts` 完全移除 |
| `test/unit/cli-index-help.test.ts` | 2 | `detect-changes` 和 `wiki` help 输出与预期不符 |
| `test/unit/eval-formatters.test.ts` | 1 | `formatContextResult` 不再输出 `method_projected` 等 evidence_mode 字段 |
| `test/unit/scoped-cli-commands.test.ts` | 2 | MCP manifest 和 guidance 文本中缺失 `resolveAnalyzeNpxCommand` / `"args": ["mcp"]` |

**文档收尾：**

- `merge-upstream-2026-05` task 4.3 writeback 未执行：需将合并结论同步到 `gitnexus/README.md`（能力表格）、`AGENTS.md`、前次 merge 文档

## 范围边界

### 在范围内

- 修复上述 5 个测试文件的 14 个回归用例
- 执行 `merge-upstream-2026-05` 的 writeback task 4.3
- 确保 `npm test` 中这些测试全部通过
- 确保 `npx tsc --noEmit` 零编译错误

### 不在范围内

- 不处理 `restore-local-backend-unity-features` 交付缺口（由独立 change `complete-restore-local-backend-coverage` 处理）
- 不修改上游源代码逻辑
- 不从零实现上游删除的 CLI 功能（仅恢复 fork 用户可见行为的兼容性）
- 不新增测试用例

## Capabilities

### Modified Capabilities

- `analyze-cli`: 恢复 `--skip-git` 和 `--skip-agents-md` CLI 旗标的正确行为，确保非 git 目录 index 场景可用
- `cli-tool-direct-dispatch`: 恢复或适配 `detectChangesCommand` 的 CLI 直接工具调用功能
- `eval-server-formatters`: 适配 `formatContextResult` 以包含上游移除的 `evidence_mode` 字段
- `cli-help-surface`: 对齐 `detect-changes` 和 `wiki` 命令的 help 文本与当前实现
- `mcp-setup-config`: 更新 MCP manifest 生成和 guidance 文本以匹配当前 setup 结构

## Capabilities 待确认项

- [x] 能力清单已确认：5 个 Modified Capability 均对应明确的测试回归

## Impact

### 正面影响

- `merge-upstream-2026-05` 实现完整收敛（69/69 任务 + 零测试回归）
- CLI 功能完整性恢复：`--skip-git` 非 git 目录 index 场景可正常工作
- 开发者可直接运行 `npm test` 获得全部通过（排除 restore-local-backend 范围内的已知失败）

### 风险

- `detectChangesCommand` 移除是上游的有意设计决策，恢复可能产生维护负担。备选方案：废弃该测试并更新 CLI 调用方式为 MCP 工具路由
- `scoped-cli-commands.test.ts` 的预期依赖 setup.ts 的内部结构，上游对 setup/MCP 配置生成有显著重构

### 受影响方

- 使用 `gitnexus analyze --skip-git` 的用户
- 依赖 `gitnexus tool detect-changes` 直接 CLI 调用的用户
- merge-upstream-2026-05 change 的生命周期（需要此 change 完成后才能关闭）

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：
  - 标准页：`repo://gitnexus`
  - 项目页：`openspec/changes/merge-upstream-2026-05/tasks.md`
  - 回写目标：merge-upstream-2026-05 tasks/verification/writeback、AGENTS.md、README.md
