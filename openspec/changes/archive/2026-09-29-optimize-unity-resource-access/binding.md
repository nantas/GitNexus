# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `repo://orbitos/99_系统/Harness/OrbitOS_Spec_Standard/OrbitOS_Spec_Standard_v0.3.md`
- `project_page_ref`: `repo://orbitos/20_项目/GitNexus 开发/Project_GitNexus.md`
- `additional_context_refs`: `repo://gitnexus/docs/plans/2026-09-28-unity-resource-access-design.md`、`repo://gitnexus/docs/reports/2026-09-28-neondesign-index-performance-diagnosis.md`、`repo://gitnexus/UNITY_RESOURCE_BINDING.md`、`repo://gitnexus/docs/unity-runtime-process-source-of-truth.md`。
- 治理引用沿用本仓已归档的 setup-gitnexusrc-migration binding；实施阶段已只读核验标准和外部项目页面，尚未修改；不继承该 change 的回写授权。

## Source of Truth

- 行为规范真源：本 change 的 `specs/unity-resource-access/spec.md`。
- 项目页面只承担上下文输入、治理展示与结果回写，不替代 spec delta 作为实现与验证依据。
- 已确认设计是输入；本仓源码、测试和采样是实现证据。本 change 的 design 包含完整决策，实施不依赖被 gitignore 忽略的设计报告。

## 回写目标

- `writeback_targets`: `repo://orbitos/20_项目/GitNexus 开发/Project_GitNexus_Progress.md`
- `writeback_owner`: 本 change 执行者。
- `writeback_timing`: 实现与验证完成后，读取标准并确认当次授权与目标可用性再执行；propose 阶段只写本仓规划文件。

## 同步约束

- 页面与 spec 不一致时，以本 change 的 `specs/` 为准。
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks。
- 引用无法解析或无写入权限时，保留本仓结论并记录外部回写未完成；不擅自写入其他仓库。

## 待确认项

- [x] 本地设计范围：用户已逐轮确认十项设计决策。
- [x] 治理引用来源：沿用本仓既有 binding 中的标准、项目和进度页面引用。
- [x] 已只读核验标准、项目主页和进度页，引用有效；实际回写前仍需复核目标最新内容。
- [x] 用户于 2026-09-29 明确授权本 change 回写、归档和整理提交；外部目标回写已完成。
