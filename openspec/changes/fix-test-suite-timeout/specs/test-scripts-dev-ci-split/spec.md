# Specification Delta

## Capability 对齐（已确认）

- Capability: `test-scripts-dev-ci-split`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `new`
- 用户确认摘要: 已确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## ADDED Requirements

### Requirement: npm-test-default-pool-only
The `npm test` script SHALL run only the default vitest pool (`--project default`), completing on a developer machine in under 60 seconds.

#### Scenario: developer runs npm test
- **WHEN** a developer runs `npm test` in the `gitnexus/` directory
- **THEN** vitest SHALL execute only the `default` pool (unit tests + non-integration tests)
- **THEN** the full run SHALL complete within 60 seconds (including import/setup/tests/transform)
- **THEN** test failure exits with non-zero code

### Requirement: npm-run-test-all-full-suite
A new script `test:all` SHALL run the full vitest suite across all pools (`default`, `lbug-db`, `cli-e2e`), serving as the CI quality gate.

#### Scenario: CI runs npm run test:all
- **WHEN** CI runs `npm run test:all`
- **THEN** vitest SHALL execute all three pools: default, lbug-db, and cli-e2e
- **THEN** test failure exits with non-zero code

### Requirement: backward-compatible-script
The change SHALL be backward compatible: existing CI configuration referencing `npm test` SHALL continue to work (same exit code behavior on failure).

#### Scenario: CI pipeline compatibility
- **WHEN** existing CI workflow runs `npm test`
- **THEN** it SHALL execute the default pool only (not the old full suite)
- **THEN** CI MUST be updated to use `npm run test:all` if it needs the full suite
