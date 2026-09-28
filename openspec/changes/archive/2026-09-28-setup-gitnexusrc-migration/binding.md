# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `repo://orbitos/99_系统/Harness/OrbitOS_Spec_Standard/OrbitOS_Spec_Standard_v0.3.md`
- `project_page_ref`: `repo://orbitos/20_项目/GitNexus 开发/Project_GitNexus.md`
- `additional_context_refs`: `repo://gitnexus/docs/plans/2026-09-28-setup-gitnexusrc-migration.md`

## Source of Truth

- 行为规范真源：本 change 的 `specs/<capability-id>/spec.md`。
- 项目页面只承担上下文输入、治理展示与结果回写，不替代 spec delta 作为实现或验证依据。
- 本仓源码和测试是实现事实；上方方案文档是设计输入，不覆盖本 change 的规范。

## 回写目标

- `writeback_targets`: `repo://orbitos/20_项目/GitNexus 开发/Project_GitNexus_Progress.md`
- `writeback_owner`: `repo://gitnexus` 的本 change 执行者；跨仓写入须在执行阶段单独取得授权并使用相应工作流。
- `writeback_timing`: 实现与验证完成、结论得到确认后；当前 propose 阶段不写外部项目页面。

## 同步约束

- 页面与 spec 不一致时，以本 change 的 `specs/` 为准。
- 回写只同步结论、状态、摘要与本 change 链接，不复制整份 spec、design 或 tasks。
- 回写前读取 `spec_standard_ref` 并遵循其当时的回写规则；项目进度页承载明细，项目主页保留稳定入口。
- 未取得跨仓写入授权或目标不可写时，保留本仓验证结论并报告未完成回写，不擅自修改 OrbitOS 仓库。

## 待确认项

- [x] 标准页引用：项目主页固定为上述 v0.3 页面。
- [x] 项目页引用及进度页落位：已从项目主页确认。
- [x] 执行阶段的跨仓回写授权与权限：用户于 2026-09-28 明确同意回写；`repo-registry` 解析、目标页与标准页读取及写入均完成。
- [x] 验证完成后的异常处理：目标页与 v0.3 标准可解析；已按进度页落位与主页摘要规则回写，并修正一次错误 CLI 参数表述。
