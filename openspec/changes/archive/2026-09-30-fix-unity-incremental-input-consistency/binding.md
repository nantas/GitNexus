# Binding

## 标准与项目页面绑定

- `spec_standard_ref`: `repo://orbitos/99_系统/Harness/OrbitOS_Spec_Standard/OrbitOS_Spec_Standard_v0.3.md`
- `project_page_ref`: `repo://orbitos/20_项目/GitNexus 开发/Project_GitNexus.md`
- `additional_context_refs`: `repo://gitnexus/docs/plans/2026-09-29-unity-incremental-input-consistency-design.md`、`repo://gitnexus/docs/reports/2026-09-29-neonnew-cached-rebuild-benchmark.md`、`repo://gitnexus/UNITY_RESOURCE_BINDING.md`、`repo://gitnexus/docs/unity-runtime-process-source-of-truth.md`。
- 治理引用沿用已归档 optimize-unity-resource-access 的 binding；本轮未重新核验外部页面，不继承旧 change 的回写授权。

## Source of Truth

- 行为规范真源：本 change 的 `specs/unity-incremental-input-consistency/spec.md`。
- 项目页面只承担上下文输入、治理展示与结果回写，不替代 spec delta 作为实现与验证依据。
- 已确认设计是输入；本仓源码、测试和采样是实现证据。本 change 的 design 包含完整决策，实施不依赖被 gitignore 忽略的设计报告。

## 回写目标

- `writeback_targets`: `[]`（2026-09-30 用户明确取消外部回写；此前目标仅作为历史治理上下文保留）
- `writeback_owner`: 本 change 执行者。
- `writeback_timing`: 不执行；2026-09-30 用户要求归档提交且无需外部回写。

## 同步约束

- 页面与 spec 不一致时，以本 change 的 `specs/` 为准。
- 回写只同步结论、状态、摘要与链接，不复制整份 spec/design/tasks。
- 引用无法解析或无写入权限时，保留本仓结论并记录外部回写未完成；不擅自写入其他仓库。

## 待确认项

- [x] 用户已确认正确性修复＋无变化快路径，Unity 真实变化暂用全量安全写入。
- [x] 治理引用来源已核对为本仓归档 binding。
- [x] 2026-09-30 用户明确取消外部回写；无需读取或修改外部治理仓，不作为归档遗留任务。
