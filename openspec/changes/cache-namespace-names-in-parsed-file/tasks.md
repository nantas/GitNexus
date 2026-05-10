# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 确认每个 capability spec 的实现范围与边界
  - `namespace-names-in-parsed-file`: 扩展 ParsedFile 接口、scope extractor 捕获名称、bridge 传递
  - `namespace-siblings-perf`: deriveCsharpFileStructure 优先使用 parsedFile.namespaceNames
- [x] 1.2 确认依赖前置条件与外部协作项
  - `gitnexus-shared` 类型定义为本 change 唯一的外部接口变更
  - 前置 change `perf-scope-resolution-bridge` 已完成（preExtractedParsedFiles 管线就绪）

## 2. 核心实现任务

### 2.1 扩展 `ParsedFile` 接口

- [ ] 2.1.1 在 `gitnexus-shared/src/scope-resolution/parsed-file.ts` 的 `ParsedFile` 接口中添加 `namespaceNames?: readonly string[]`
  - 字段为可选，默认 `undefined`
  - **验证**: `npx tsc --noEmit` 通过

### 2.2 Scope extractor 捕获命名空间名称

- [ ] 2.2.1 在 `emitCsharpScopeCaptures` 中，遍历 namespace 类 captures，从 `@scope.module` 的 `name:` 子节点提取文本
  - 文件：`src/core/ingestion/languages/csharp/scope.ts`（或实际所在文件）
  - 提取逻辑：`capture.node.childForFieldName('name')?.text`
  - 处理 `namespace_declaration` 和 `file_scoped_namespace_declaration` 两种节点
  - **验证**: 单元测试覆盖含命名空间声明的 C# 文件

- [ ] 2.2.2 通过 `extractParsedFile` bridge 将命名空间名称列表传递到 `ParsedFile.namespaceNames`
  - 文件：`src/core/ingestion/scope-extractor-bridge.ts`
  - 在 extractParsedFile 的输出中添加 namespaceNames 字段
  - **验证**: 集成测试验证解析后的 ParsedFile 包含正确 namespaceNames

- [ ] 2.2.3 在 `ParseWorkerResult` 中确认 namespaceNames 随 `parsedFiles` 正确序列化/反序列化
  - `ParseWorkerResult.parsedFiles` 已包含 ParsedFile[]，自动携带新字段
  - **验证**: 使用 worker pool 的 C# 测试通过（`TEST_WORKER_THRESHOLD=1`）

### 2.3 优化 `deriveCsharpFileStructure`

- [ ] 2.3.1 修改 `deriveCsharpFileStructure` 优先使用 `parsedFile.namespaceNames`
  - 文件：`src/core/ingestion/languages/csharp/namespace-siblings.ts`
  - 当 `parsedFile.namespaceNames` 非空时，跳过 `extractFileStructureWithFallback` 调用
  - 同时检查 `parsedFile.parsedImports` 是否有 `using static` 导入：
    - 如果有 → 仍需完整 AST walk（现有路径）
    - 如果没有 → 完全跳过 tree-sitter，返回 `{ namespaces, usingStaticPaths: [] }`
  - **验证**: 3046 文件 benchmark 中 namespaceSiblings < 1s

### 2.4 单元测试

- [ ] 2.4.1 为 `emitCsharpScopeCaptures` 的命名空间名称提取添加单元测试
  - 测试文件含 `namespace Foo.Bar { }` → namespaceNames = `['Foo.Bar']`
  - 测试文件含 `namespace Foo.Bar;`（file-scoped）→ namespaceNames = `['Foo.Bar']`
  - 测试文件含多 namespace → namespaceNames = `['A', 'B']`
  - 测试无命名空间文件 → namespaceNames = undefined

- [ ] 2.4.2 为 `deriveCsharpFileStructure` 的 namespaceNames 优先路径添加单元测试
  - 测试 `parsedFile.namespaceNames` 存在时跳过 tree-sitter
  - 测试 fallback 到 tree-sitter 路径正确
  - 测试 `using static` 时仍走完整 AST walk

### 2.5 集成测试

- [ ] 2.5.1 在现有 C# 集成测试套件中确认 edge 数量无回归
  - 执行 `npm test`（default pool，含 18 个 C# 测试）
  - 执行 `npm run test:all`（含 worker pool 路径）
  - **验证**: 所有测试通过，edge count 不变

## 3. 收敛与验证准备

- [ ] 3.1 收集 benchmark 证据
  - 修改前：namespaceSiblings = 29,333ms (3046 files)
  - 修改后：namespaceSiblings < 1,000ms (3046 files)
  - 记录到 `verification.md`

- [ ] 3.2 标记回写目标
  - `docs/plans/2026-05-11-neonnew-e2e-profile.md`: 更新最终测量结论

## 4. 验证与回写收敛

- [ ] 4.1 生成 `verification.md`（覆盖 spec-to-implementation 与 task-to-evidence）
- [ ] 4.2 生成 `writeback.md`（目标、字段映射、前置条件）
- [ ] 4.3 执行回写：更新 `docs/plans/2026-05-11-neonnew-e2e-profile.md` 测量结论
