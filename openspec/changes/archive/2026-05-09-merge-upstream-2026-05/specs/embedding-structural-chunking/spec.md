# Specification Delta

## Capability 对齐（已确认）

- Capability: `embedding-structural-chunking`
- 来源: `proposal.md`
- 变更类型: `new`

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: AST-Aware Chunking
The system SHALL chunk source files for embedding using AST-aware boundaries, splitting at function/class/method declarations rather than arbitrary line breaks.

#### Scenario: Function boundary chunking
- **WHEN** a source file contains 5 methods
- **THEN** chunks SHALL be split at method boundaries, not mid-function

### Requirement: HF_ENDPOINT Configuration
The system SHALL support the `HF_ENDPOINT` environment variable to configure the HuggingFace model download endpoint, with retry, timeout, and circuit breaker when downloads fail.

#### Scenario: Custom HF endpoint
- **WHEN** `HF_ENDPOINT=https://hf-mirror.example.com` is set
- **THEN** embedding model downloads SHALL use the custom endpoint

### Requirement: Embedding Count Limit
The system SHALL support an optional limit on the number of symbols to embed via `--embeddings=<N>` flag.

#### Scenario: Limited embedding
- **WHEN** `gitnexus analyze --embeddings=1000` is run
- **THEN** at most 1000 symbols SHALL be embedded
