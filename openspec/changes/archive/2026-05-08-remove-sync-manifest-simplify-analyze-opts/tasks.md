# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 确认每个 capability spec 的实现范围与边界
- [x] 1.2 确认依赖前置条件与外部协作项

## 2. 核心实现任务

### 2.1 类型扩展 (`repo-manager.ts`)

- [x] 2.1.1 在 `RepoMeta.analyzeOptions` 中新增 `csharpDefineCsproj?: string` 字段
  - Spec: `analyze-csproj-persistence` → csproj-written-to-meta-json
  - 文件: `gitnexus/src/storage/repo-manager.ts`

### 2.2 `analyze-options.ts` 重构

- [x] 2.2.1 移除 `scopeManifest` / `scopePrefix` 相关接口字段和函数参数（`AnalyzeScopeOptions`、`ResolveAnalyzeOptionsInput`、`resolveAnalyzeScopeRules`、`resolveEffectiveAnalyzeOptions`）
  - Spec: `analyze-options-resolution` → effective-options-resolution
  - 文件: `gitnexus/src/cli/analyze-options.ts`

- [x] 2.2.2 移除 `parseScopeManifestConfig` import 及所有 manifest 读取逻辑（`readScopeManifestConfig`、manifestConfig 相关分支）
  - Spec: `analyze-options-resolution` → REMOVED sync-manifest-auto-load, manifest-directive-precedence
  - 文件: `gitnexus/src/cli/analyze-options.ts`

- [x] 2.2.3 在 `StoredAnalyzeOptions` 和 `EffectiveAnalyzeOptions` 中新增 `csharpDefineCsproj?: string`
  - Spec: `analyze-csproj-persistence` → csproj-option-persistence
  - 文件: `gitnexus/src/cli/analyze-options.ts`

- [x] 2.2.4 简化 `resolveEffectiveAnalyzeOptions` 为 CLI > stored 两层优先级（移除 manifest 中间层），对 `csharpDefineCsproj` 同样适用
  - Spec: `analyze-options-resolution` → cli-override-wins-over-stored, reuse-false-ignores-stored
  - 文件: `gitnexus/src/cli/analyze-options.ts`

- [x] 2.2.5 新增 `validateStoredOptions(stored, repoPath)` 异步函数
  - 校验规则: repoAlias 正则、includeExtensions 格式、scopeRules 非空、csharpDefineCsproj 文件存在性
  - 失败时 console.warn 并回退到默认值
  - Spec: `stored-options-validation` → 所有 scenario
  - 文件: `gitnexus/src/cli/analyze-options.ts`

### 2.3 `analyze.ts` 修改

- [x] 2.3.1 移除 `syncManifestPolicy` / `scopeManifest` / `scopePrefix` 从 `AnalyzeOptions` 接口
  - Spec: `analyze-cli-interface` → analyze-command-options
  - 文件: `gitnexus/src/cli/analyze.ts`

- [x] 2.3.2 移除 `enforceSyncManifestConsistency` / `resolveScopeManifestForAnalyze` 调用和 sync-manifest import
  - Spec: `analyze-options-resolution` → REMOVED sync-manifest-drift-guard
  - 文件: `gitnexus/src/cli/analyze.ts`

- [x] 2.3.3 更新 `analyzeCommand` 中 effective options 解析：调用 `validateStoredOptions` 后再传给 `resolveEffectiveAnalyzeOptions`
  - Spec: `analyze-options-resolution` → stored-validated-before-use
  - 文件: `gitnexus/src/cli/analyze.ts`

- [x] 2.3.4 从 effectiveOptions 中取 `csharpDefineCsproj` 传给 `buildPipelineRunOptionsForAnalyze`
  - Spec: `analyze-csproj-persistence` → csproj-reused-from-meta-json, csproj-cli-override-stored
  - 文件: `gitnexus/src/cli/analyze.ts`

- [x] 2.3.5 meta.json 写入时包含 `csharpDefineCsproj`
  - Spec: `analyze-csproj-persistence` → csproj-written-to-meta-json
  - 文件: `gitnexus/src/cli/analyze.ts`

- [x] 2.3.6 简化 `hasCliOverrides` 检测逻辑（移除 scopeManifest / scopePrefix 分支，新增 csharpDefineCsproj 检测）
  - 文件: `gitnexus/src/cli/analyze.ts`

### 2.4 CLI 参数清理 (`index.ts`)

- [x] 2.4.1 `analyze` 命令移除 `--sync-manifest-policy`、`--scope-manifest`、`--scope-prefix` 选项
  - Spec: `analyze-cli-interface` → analyze-command-options
  - 文件: `gitnexus/src/cli/index.ts`

- [x] 2.4.2 `benchmark-unity`、`benchmark-agent-context`、`benchmark-agent-safe-query-context` 移除 `--scope-manifest`、`--scope-prefix` 选项
  - Spec: `analyze-cli-interface` → benchmark-rejects-removed-options
  - 文件: `gitnexus/src/cli/index.ts`

### 2.5 benchmark 子命令内部清理

- [x] 2.5.1 移除 benchmark 命令 options 接口和透传中的 `scopeManifest` / `scopePrefix`
  - 文件: `gitnexus/src/cli/benchmark-unity.ts`、`benchmark-agent-context.ts`、`benchmark-agent-safe-query-context.ts`

### 2.6 `clean.ts` 简化

- [x] 2.6.1 移除 `PRESERVE_FILES` Set 和逐条保留逻辑，恢复为 `fs.rm(storagePath, { recursive: true, force: true })`
  - Spec: `clean-command-config-preserve` → clean-removes-all-contents
  - 文件: `gitnexus/src/cli/clean.ts`

### 2.7 测试更新

- [x] 2.7.1 删除 `sync-manifest.test.ts`、`sync-manifest.ts`、`scope-manifest-config.ts`

- [x] 2.7.2 新建 `test/unit/analyze-options.test.ts`：移除 manifest 相关用例，新增 validateStoredOptions 用例（6 个场景）和 resolveEffectiveAnalyzeOptions 用例（4 个场景）
  - 移除: `resolveAnalyzeScopeRules` manifest 测试、manifest directive 测试、CLI > manifest > stored 优先级测试、unknown directive 测试、`parseScopeManifestConfig` 测试
  - 新增: validateStoredOptions 场景（valid-pass、invalid-alias、invalid-ext、csproj-missing、empty-rules）、csharpDefineCsproj 复用场景
  - Spec: `stored-options-validation` 全部 scenario、`analyze-csproj-persistence` 复用 scenario
  - 文件: `gitnexus/test/unit/` 或 `gitnexus/src/cli/analyze-options.test.ts`

- [x] 2.7.3 新建 `test/unit/analyze-pipeline-options.test.ts`：新增 buildPipelineRunOptionsForAnalyze csharpDefineCsproj 透传用例
  - 文件: `gitnexus/src/cli/analyze.test.ts`

- [x] 2.7.4 更新 `repo-manager-alias.test.ts` 中 analyzeOptions 对象（如涉及）
  - 文件: `gitnexus/src/cli/repo-manager-alias.test.ts`

### 2.8 构建验证

- [x] 2.8.1 运行 `npx tsc --noEmit` 确认无编译错误
- [x] 2.8.2 运行 `npm test` 确认所有测试通过（1 个 pre-existing 失败：`scoped-cli-commands.test.ts` 中 JSON 格式化断言与多行 `.mcp.json` 不匹配，与本次 change 无关）

## 3. 收敛与验证准备

- [x] 3.1 整理需要进入 verification 的证据与检查点
- [x] 3.2 标记需要进入 writeback 的摘要与状态变更

## 4. 验证与回写收敛

- [x] 4.1 基于真实实现结果生成或更新 verification.md（覆盖 spec-to-implementation 与 task-to-evidence）
- [x] 4.2 基于 verification.md 结论生成或更新 writeback.md（目标、字段映射、前置条件）
- [x] 4.3 执行 writeback.md 中定义的回写目标，并记录可审计证据（链接、时间、执行人、结果）
