# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 确认 capability specs: `unity-scan-activation` 含 3 个 requirement + 5 个 scenario；`cli-skill-unity-doc` 含 1 个 requirement + 3 个 scenario
- [x] 1.2 依赖前置：`fix-extensions-param-pipeline` 已合并（`--extensions` 传递链已修复），本次 change 在此基础上叠加

## 2. 核心实现任务

### 2.1 `unity-scan.ts` — 激活门修复

- [x] 2.1.1 从 `UNITY_EXTENSIONS` Set 中移除 `.meta`
      - Spec: `unity-scan-activation` / `Requirement: meta-removed-from-unity-extensions-set` / `Scenario: meta-not-counted-as-unity-file`
      - Design: D2

- [x] 2.1.2 在 `unityScanPhase.execute()` 中添加 C# Class 节点回退激活检查
      - 保留 `allPaths` 扩展名快速路径（`hasUnityExtensions`）
      - 新增：当 `hasUnityExtensions === false` 时，检查图中是否有 `Class` 节点且 `filePath` 以 `.cs` 结尾
      - 仅当两个条件都不满足时才返回 `{ hasUnityFiles: false }`
      - Spec: `unity-scan-activation` / `Requirement: unity-scan-activates-on-csharp-classes` / `Scenario: extensions-cs-only-activates-unity-scan` + `Scenario: non-unity-project-skips` + `Scenario: extensions-cs-meta-still-activates-via-existing-gate`
      - Design: D1（双条件激活门）

- [x] 2.1.3 确保向后兼容性：无 `--extensions` 参数时行为不变
      - Spec: `unity-scan-activation` / `Requirement: backward-compatible` / `Scenario: no-extensions-flag-work-as-before`
      - Design: D1（保留扩展名快速路径）

### 2.2 `gitnexus/skills/gitnexus-cli.md` — CLI skill 文档更新

- [x] 2.2.1 在 analyze 章节 `--extensions` 标志说明后添加 `**Unity 项目推荐**` 段落
      - 推荐命令：`--extensions .cs --csharp-define-csproj <path>`
      - 说明：Unity 资源绑定和 lifecycle 合成边由内部 Unity Scan 阶段自动加载，无需 `.meta/.prefab/.unity/.asset`
      - 性能提示：纳入 `.meta` 会建立 ~15x 的图节点且对绑定无益
      - Spec: `cli-skill-unity-doc` / `Requirement: unity-project-analyze-best-practice` / `Scenario: unity-recommended-analyze-command` + `Scenario: no-meta-in-extensions-explanation`

- [x] 2.2.2 确保现有 "C# preprocessing (Unity)" 内容保持不变，新段落作为补充而非替换
      - Spec: `cli-skill-unity-doc` / `Scenario: skill-content-consistency`

## 3. 收敛与验证准备

- [x] 3.1 验证检查点清单：
      - `npm test` 全部通过（尤其是 `unity-scan` 相关测试）
      - `npx tsc --noEmit` 无类型错误
      - neonspark 仓库验证：`--extensions .cs --csharp-define-csproj <csproj>` 产出完整 UNITY_* 边和 lifecycle 合成 CALLS
      - neonspark 仓库验证：性能从 ~22min 降至 ~3–5min
      - 非 Unity 仓库验证：激活门正确跳过（无 C# Class 节点 + 无 Unity 扩展名）
- [x] 3.2 回写目标标记：
      - `gitnexus/skills/gitnexus-cli.md` — 内容已在步骤 2.2 完成，验证阶段确认一致性

## 4. 验证与回写收敛

- [x] 4.1 基于实现结果生成 `verification.md`
- [x] 4.2 基于 verification.md 生成 `writeback.md`
- [x] 4.3 执行 CLI skill 回写（如步骤 2.2 未在实现时完成）
