# Design

## Context

`unityScanPhase` 当前通过 `allPaths.filter(ext in UNITY_EXTENSIONS)` 决定是否调用 `processUnityResources()`。但 `processUnityResources()` 内部通过 `buildUnityScanContext()` 执行独立的 `glob('**/*.cs')` + `glob('**/*.meta')` — 完全不依赖 `allPaths`。当 `--extensions .cs` 排除了 `.meta/.prefab/.unity/.asset` 后，activation gate 永远返回 false，Unity 资源绑定和 lifecycle 合成边全部丢失。

从 `fix-extensions-param-pipeline` 修复后，用户可以使用 `--extensions .cs` 来大幅减少主 pipeline 的扫描/解析开销，但这个门让该优化与 Unity 项目完全不兼容。

## Goals / Non-Goals

**Goals:**
- 使 `unityScanPhase` 在仅有 `.cs` 文件（无 `.meta/.prefab/.unity/.asset`）时仍能激活
- 从 `UNITY_EXTENSIONS` 中移除 `.meta`
- 在 gitnexus-cli skill 中补充 Unity 项目 `--extensions` 最佳实践

**Non-Goals:**
- 修改 `processUnityResources()` 内部实现
- 修改 `buildUnityScanContext()` 的 glob 逻辑
- 移除 `UNITY_EXTENSIONS` 原有的基于扩展名的快速激活路径
- 修改 Unity lifecycle 注入（`applyUnityLifecycleSyntheticCalls`）的独立激活逻辑

## Decisions

### D1: 双条件激活门

保留 `allPaths` 扩展名检查作为 fast path，新增 C# Class 节点检查作为 fallback：

```typescript
// 快速路径：allPaths 中有 Unity 资源扩展名
const unityFiles = allPaths.filter(p => UNITY_EXTENSIONS.has(ext));
const hasUnityExtensions = unityFiles.length > 0;

// Fallback：图中已有 C# Class 节点（来自 parse 阶段）
const hasCsClasses = hasUnityExtensions ? true : 
  [...ctx.graph.iterNodes()].some(
    n => n.label === 'Class' && String(n.properties.filePath || '').endsWith('.cs')
  );

if (!hasCsClasses) {
  return { hasUnityFiles: false };
}
```

**理由**：
- 保留现有扩展名快速路径（`.prefab/.unity/.asset` 在 `allPaths` 中时直接激活）
- C# Class 检查仅在 fast path 失败时执行（零额外开销的常见路径）
- `Class` 节点的 `filePath` 已由 parse 阶段正确填充
- 非 Unity 项目（无 C# Class 节点）仍然正确跳过

### D2: 移除 `.meta` 但不移除扩展名快速路径

从 `UNITY_EXTENSIONS` 中移除 `.meta`：

```typescript
const UNITY_EXTENSIONS = new Set(['.prefab', '.unity', '.asset', '.uxml', '.uss']);
```

**理由**：
- `.meta` 不产出 Unity 图边，只是 GUID 元数据
- `meta-index.ts` 独立 glob + 读取 `.meta` 文件，不经过 `allPaths`
- 保留 `.prefab/.unity/.asset/.uxml/.uss` 作为资源扩展名快速路径

### D3: CLI skill 增加 Unity 专题段落

在 `gitnexus-cli.md` 的 analyze 章节 `--extensions` 标志后添加 `**Unity 项目推荐**` 段落：

```markdown
**Unity 项目推荐:**
`--extensions .cs` + `--csharp-define-csproj <path>`
- Unity 资源绑定和 lifecycle 合成边由内部 Unity Scan 阶段自动加载，无需 `.meta/.prefab/.unity/.asset`
- 纳入 `.meta` 会建立 ~15x 的图节点且对绑定无益
```

### D4: 不改变 graph.iterNodes() 性能特征

`ctx.graph.iterNodes()` 返回迭代器，`.some()` 在找到第一个匹配后立即退出（短路求值）。对于有大量 C# Class 节点的项目（如 neonspark），第一个 Class 节点通常在前几个节点中。非 Unity 项目（无 Class 节点）需要遍历全部节点，但此场景下该检查作为 fallback 仅在 `allPaths` 无 Unity 扩展名时执行。

## Risks / Migration

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| 非 Unity C# 项目误激活 | 低 | `processUnityResources()` 执行但无效果（没有 `.meta/.prefab` 文件可匹配） | `buildUnityScanContext` 内部在没有匹配文件时返回空结果，写入开销极小（零边产出） |
| `.meta` 从 UNITY_EXTENSIONS 移出导致 `unityFileCount` 变化 | 低 | 报告的数字变小（不再计数 `.meta`），但这是更准确的语义 | 文档注释说明 `.meta` 已被独立处理 |
| CLI skill 回写内容与实际命令不一致 | 低 | 用户按文档操作但 CLI 参数格式有误 | 所有 skill 回写内容基于实际 `analyze --help` 输出验证 |
