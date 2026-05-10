# Design

## Context

`gitnexus analyze --extensions .cs` 的扩展名过滤功能在 `chore/merge-upstream-2026-05` 合并过程中断裂。断裂链路如下：

1. **CLI 解析层 (`cli/analyze-options.ts`)**：`--extensions` 正确解析为 `EffectiveAnalyzeOptions.includeExtensions` ✅
2. **Orchestrator 接口 (`core/run-analyze.ts`)**：`AnalyzeOptions` 接口缺少 `includeExtensions` 字段 ❌
3. **Pipeline 桥接 (`core/run-analyze.ts:283`)**：未传递 `includeExtensions` 到 `runPipelineFromRepo()` ❌
4. **Scan 阶段 (`pipeline-phases/scan.ts`)**：未读取 `ctx.options?.includeExtensions` ❌
5. **文件扫描器 (`filesystem-walker.ts`)**：`walkRepositoryPaths()` 的 `glob('**/*')` 不做扩展名过滤 ❌

Spec 定义的五个 requirement 覆盖：CLI→pipeline 完整传递链、scan 阶段过滤、`--reuse-options` 持久化、空列表/undefined 向后兼容、以及单元测试验证。

## Goals / Non-Goals

**Goals:**
- 修复 `--extensions` 从 CLI 到 pipeline scan 阶段的完整传递链
- 在 `walkRepositoryPaths()` 的 glob 结果阶段（batch stat 之前）进行扩展名过滤
- 确保 `--reuse-options` 能正确回读并应用之前存储的 `includeExtensions`
- 为 `walkRepositoryPaths()` 添加单元测试覆盖扩展名过滤逻辑

**Non-Goals:**
- 接入 `applyUnityRuntimeBindingRules`（根因报告中提到的另一 P0 断裂，但独立问题）
- 优化 pipeline 其他阶段的性能
- 修改 Unity 资源文件扫描（`walkUnityResourcePaths`）不受扩展名过滤影响
- scope-resolution 与 legacy DAG 的产出边对比验证（P1 独立项）

## Decisions

### D1: 过滤位置 — `walkRepositoryPaths()` 内

在 `walkRepositoryPaths()` 的 glob 结果与 batch stat 循环之间插入过滤。理由：
- **最早过滤点**：避免对排除文件执行 `fs.stat()` I/O 操作
- **单一职责**：文件发现 + 过滤集中在 walker 函数中，scan phase 不增加额外逻辑
- **可测试性**：`walkRepositoryPaths` 已有单元测试 infra，新增测试简单

### D2: 过滤方式 — `endsWith()` 前缀匹配

使用 `Array.filter()` + `endsWith()` 匹配。理由：
- 扩展名格式统一为 `.cs`、`.ts`、`.csx` 等（不带 `*` 通配符）
- CLI 解析层已做验证：`parseExtensionList()` 确保每个值以 `.` 开头
- 无需正则或 glob pattern 匹配，`endsWith()` 语义直接、性能好

### D3: 空列表语义 — 无过滤

`includeExtensions: []`（空列表）等同于 `undefined`（不指定）—— 不应用任何过滤。理由：
- `resolveEffectiveAnalyzeOptions()` 在无 `--extensions` 且无可复用存储时返回 `[]`
- 若空列表触发过滤（排除全部文件），会导致 scan 输出为空、下游全部静默跳过
- 保持 `[]` = `undefined` = "不过滤" 语义，最小化行为变更风险

### D4: 接口兼容 — 全部可选

所有新增字段均为 `?:` 可选参数。`PipelineOptions.includeExtensions` 接口已存在但从未被填充，无需接口变更。`AnalyzeOptions`（`run-analyze.ts`）新增字段也为可选。调用链中 `undefined` 的默认传播路径与当前行为完全一致。

## Risks / Migration

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| 已有 `meta.json` 无 `includeExtensions` 字段 | 一定 | 低 — 回读时 `stored?.includeExtensions` 为 `undefined`，退化成 `[]` | 验证 `undefined` 路径行为与当前一致 |
| `walkRepositoryPaths` 的调用方未传第三个参数 | 低 | 无 — `includeExtensions` 为可选参数，`undefined` 时跳过过滤 | 测试确认现有调用方行为不变 |
| 过滤后 `scannedFiles` 长度为 0（用户误传不存在的扩展名） | 低 | pipeline 解析全部跳过，产出空图 | CLI 应有警告（当前 `--extensions` 预期与 `cluster`/`process` 输出范围不符时自然体现）；本 change 不额外添加校验 |
| 第三方扩展/测试框架直接调用 `walkRepositoryPaths` | 低 | 新增可选参数不破坏签名兼容性 | TypeScript 编译器会捕获传参不匹配 |
