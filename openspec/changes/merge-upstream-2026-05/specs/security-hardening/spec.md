# Specification Delta

## Capability 对齐（已确认）

- Capability: `security-hardening`
- 来源: `proposal.md`
- 变更类型: `new`
- 用户确认摘要: 全选进行

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: Path Injection Prevention
The system SHALL validate and sanitize all file paths received via API and CLI parameters, rejecting path traversal attempts.

#### Scenario: Path traversal via API
- **WHEN** an API request includes `../` in a file path parameter
- **THEN** the request SHALL be rejected with a 400-level error

### Requirement: Git URL Validation
The system SHALL validate git clone URLs against IPv4-compatible IPv6 and NAT64 SSRF bypass patterns.

#### Scenario: SSRF bypass attempt
- **WHEN** a git clone URL contains an IPv4-compatible IPv6 address targeting internal networks
- **THEN** the URL SHALL be rejected

### Requirement: Tempfile Security
The system SHALL use `crypto.randomBytes` for temporary file names instead of predictable patterns.

#### Scenario: Tempfile creation
- **WHEN** the system creates a temporary file
- **THEN** the file name SHALL be derived from cryptographically random bytes

### Requirement: Rate Limiting
The system SHALL enforce per-route rate limiting on `/api/analyze`, `/api/embed`, and other FS-touching endpoints.

#### Scenario: Rate limit enforcement
- **WHEN** a client exceeds the rate limit for `/api/analyze`
- **THEN** subsequent requests SHALL receive 429 Too Many Requests

### Requirement: ReDoS Prevention
The system SHALL guard against Regular Expression Denial of Service in COBOL preprocessor, Rust workspace extraction, and cross-impact analysis paths.

#### Scenario: Malicious input
- **WHEN** a crafted input triggers exponential backtracking in a regex
- **THEN** the operation SHALL timeout or fail gracefully without blocking the process
