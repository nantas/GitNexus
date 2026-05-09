# Specification Delta

## Capability 对齐（已确认）

- Capability: `parse-worker`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: 全选进行

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: LanguageProvider Dispatch
The system SHALL use LanguageProvider with compile-time exhaustive dispatch tables for routing files to language-specific parsers and extractors.

#### Scenario: Multi-language file routing
- **WHEN** a repo contains `.ts`, `.py`, `.cs`, `.kt` files
- **THEN** each file SHALL be routed to its correct LanguageProvider without fallback ambiguity

### Requirement: C# Preprocessor Integration
The system SHALL apply C# conditional compilation preprocessing (`#if/#else/#endif` normalization) via `csharp-preproc-normalizer.ts` before tree-sitter parsing, when a csproj file is configured.

#### Scenario: C# conditional compilation
- **WHEN** a `.cs` file contains `#if UNITY_EDITOR ... #endif` and a csproj is configured
- **THEN** the preprocessor SHALL normalize the file to a single branch before parsing

### Requirement: Route Extraction Output
The system SHALL output route extraction results as part of the parse result payload, including HTTP method, path, and handler function IDs.

#### Scenario: Express route extraction
- **WHEN** a TypeScript file defines `app.get('/users', handler)`
- **THEN** the parse result SHALL include `{ method: 'GET', path: '/users', handlerId: 'handler' }`

### Requirement: Sequential Parser Fallback
The system SHALL support sequential parser fallback for languages that cannot be parsed with tree-sitter, logging skipped languages without failing the overall analysis.

#### Scenario: Missing parser
- **WHEN** a language parser is not available on the current platform
- **THEN** files for that language SHALL be skipped with a warning log, and analysis SHALL continue

### Requirement: Worker Recovery
The system SHALL recover from parse worker stalls by restarting the worker thread, with a configurable timeout.

#### Scenario: Parse timeout
- **WHEN** a file takes longer than the parse timeout to process
- **THEN** the worker SHALL be restarted and the file SHALL be skipped
