# Design

## Context

E2E profiling on `Assets/NEON/Code/Game` (3046 C# files) revealed `populateCsharpNamespaceSiblings` takes **29.3s** in the `finalize` stage — 75% of finalize, 38% of total runtime.

Root cause: `ParsedFile.Scope` carries `kind: 'Namespace'` but NOT the namespace **name string**. `populateCsharpNamespaceSiblings` calls `deriveCsharpFileStructure` which calls `getCsharpParser().parse()` for every file. 3046 × ~10ms = 30s.

The scope extraction phase (`emitCsharpScopeCaptures`, running in worker threads) already visits namespace declaration nodes via tree-sitter queries. The namespace name is available in the `name:` child field of the AST node, but is not captured into `ParsedFile`.

**References:**
- E2E profile: `docs/plans/2026-05-11-neonnew-e2e-profile.md`
- Spec: `specs/namespace-names-in-parsed-file/spec.md`
- Spec: `specs/namespace-siblings-perf/spec.md`
- Current code: `src/core/ingestion/languages/csharp/namespace-siblings.ts`

## Goals / Non-Goals

**Goals:**
1. Add `namespaceNames?: readonly string[]` to `ParsedFile` interface (in `gitnexus-shared`)
2. Capture namespace name strings during C# scope extraction in worker threads
3. `deriveCsharpFileStructure` uses `parsedFile.namespaceNames` to skip tree-sitter re-parse
4. `namespaceSiblings` sub-stage < 1s for 3046 files
5. Backward compatible: `undefined` namespaceNames does not break anything

**Non-Goals:**
1. Extend `Scope` interface with a `name` field (higher blast radius)
2. Optimize `using static` path extraction (minor occurrence)
3. Pre-compute namespace siblings in the worker (architectural overreach for this change)
4. Eliminate all tree-sitter parses from finalize (only the 3046-file bulk re-parse)

## Decisions

### D1: Add `namespaceNames` to `ParsedFile`, not to `Scope`

`ParsedFile` is a per-file artifact serialized over IPC. Adding a flat `string[]` is minimal and backward-compatible. Adding a `name` field to `Scope` would require changing the shared `Scope` interface used by all languages.

**Trade-off**: The namespace name lives at file level, not scope level. For multi-namespace files (rare in C#), all names are listed. `populateCsharpNamespaceSiblings` iterates them linearly anyway.

### D2: Capture Names in `emitCsharpScopeCaptures` via the Existing Scope Query

The C# scope query already captures `@scope.module` for namespace declarations. The capture includes the namespace node's `name:` child, but only the node's range is used for scope construction. We add an extraction of the name text from the `@scope.module` capture's `name` child.

**Implementation**: In `emitCsharpScopeCaptures`, after building module/namespace scopes, iterate namespace scope captures and read `capture.node.childForFieldName('name')?.text`.

### D3: Bridge via `extractParsedFile` → `ParsedFile.namespaceNames`

`extractParsedFile` in `scope-extractor-bridge.ts` is the glue between `emitCsharpScopeCaptures` and `ParsedFile`. We add a `resultNamespaceNames` output parameter (or return field) from the scope extractor, and map it to `ParsedFile.namespaceNames`.

### D4: `deriveCsharpFileStructure` Priority Order

1. If `parsedFile.namespaceNames` is non-empty → use it directly (fast path)
2. If `parsedFile.namespaceNames` is undefined AND file content available → fallback to tree-sitter AST walk (preserves existing behavior for non-worker or non-C# cases)
3. If no content and no namespaceNames → return global namespace (existing fallback)

**`using static` paths still require AST walk**. However, if `namespaceNames` is available and no `using static` paths are present in the file, we can skip the AST walk entirely. The `using static` check requires scanning the AST, so we keep the existing `extractFileStructureWithFallback` but only call it when either:
- `namespaceNames` is unavailable, OR
- The file is known to have `using static` directives (we don't know this without scanning, so we'd scan anyway — but in practice `using static` is rare)

**Optimization**: When `namespaceNames` is available from ParsedFile, check if the file's `parsedImports` contains any `using static` imports. The `ParsedImport` already has `kind: 'using-static'` (or similar). If no `using static` imports exist, skip the AST walk entirely.

### D5: `using static` Detection via ParsedFile.parsedImports

`parsedImports` already has `kind` field for each import. For C#, `using static X.Y.Z;` produces a `ParsedImport` with `kind === 'using-static'`. We check `parsedFile.parsedImports.some(i => i.kind === 'using-static')` — if none, we can skip the AST walk.

**This closes the gap**: With `namespaceNames` from ParsedFile and `using static` detection from `parsedImports`, we NEVER need to call tree-sitter in `deriveCsharpFileStructure` for any file that went through the worker pool.

### D6: ParseWorkerResult Stays Unchanged

The `ParseWorkerResult` already carries `parsedFiles: ParsedFile[]`. Since `ParsedFile` is extended, worker IPC serialization automatically picks up `namespaceNames`. No changes needed to `ParseWorkerResult`.

## Risks / Migration

| Risk | Mitigation |
|------|------------|
| Namespace name extraction in scope extractor misses some edge cases (e.g., preprocessor-guarded declarations) | Same edge cases exist in the tree-sitter AST walk in `extractFileStructureWithFallback` — both paths use the same tree-sitter grammar, so behavior is equivalent |
| `using static` detection via `parsedImports` misses some `using static` forms | `emitCsharpScopeCaptures` already produces `ParsedImport` with `kind: 'using-static'` — verified against existing integration tests |
| Non-C# languages produce empty `namespaceNames` arrays unnecessarily | Field is optional (`undefined` by default). Only C# scope extractor populates it |
| `ParsedFile` interface change breaks downstream consumers | Field is optional; any consumer that ignores unknown fields is fine. TS type-checking still passes because optional fields are non-breaking |
| Regression: verify that `namespaceSiblings` duration drops to < 1s | Gate in `specs/namespace-siblings-perf/spec.md` — measure before/after on 3046 file benchmark |
