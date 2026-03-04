# GitNexus 自定义模块匹配规则设计（Phase 4 MVP）

**日期**: 2026-03-04  
**状态**: 设计确认（待进入实现计划）  
**关联主文档**: `2026-03-04-custom-module-definition-design.md` 第 9 节

## 1. 目标与边界

1. 本文定义 `.gitnexus/modules.json` 的匹配语法与决策语义。  
2. 目标优先级：**可解释性优先**（每个符号归属可追溯）。  
3. 本文仅覆盖规则匹配与冲突决策，不修改 `Process` 检测算法。  
4. `mixed` 模式下未命中规则的符号，仅回退现有 `auto` 社区，不引入二次扩散。

## 2. 交互与产出模型（Skill 驱动）

1. 用户通过内置 skill 进行自然语言交互，不要求学习复杂子命令。  
2. skill 负责把用户意图转成规则草案并写入草稿文件。  
3. 草稿路径：`.gitnexus/modules.draft.json`（必须支持中断恢复）。  
4. 用户确认后生成正式配置：`.gitnexus/modules.json`。

## 3. 配置结构（MVP v1）

```json
{
  "version": 1,
  "mode": "mixed",
  "modules": [
    {
      "name": "Battle",
      "defaultPriority": 100,
      "rules": [
        {
          "id": "battle-core-symbols",
          "priority": 120,
          "when": {
            "all": [
              { "field": "symbol.name", "op": "contains", "value": "Battle" }
            ]
          }
        }
      ]
    }
  ]
}
```

### 3.1 字段约束

1. `version`：必填，MVP 固定 `1`。  
2. `mode`：`auto | mixed`，默认 `mixed`。  
3. `modules[]`：至少 1 项。  
4. `modules[].name`：必填，唯一。  
5. `modules[].defaultPriority`：必填，数字。  
6. `modules[].rules[]`：可为空（允许空模块，输出 warning）。  
7. `rules[].id`：必填，全局唯一。  
8. `rules[].priority`：可选；缺省时回退 `defaultPriority`。  
9. `rules[].when`：至少包含 `all` 或 `any` 之一。

## 4. 匹配对象与操作符（MVP）

### 4.1 `field` 支持矩阵

1. `symbol.name`  
2. `symbol.kind`  
3. `symbol.fqn`（缺失时回退 `symbol.name`）  
4. `file.path`

### 4.2 `op` 支持矩阵

1. `eq`（精确匹配）  
2. `contains`  
3. `regex`  
4. `in`（`value` 为数组）

### 4.3 组合语义

1. `all`：全部条件命中才算命中。  
2. `any`：任一条件命中即算命中。  
3. 同时存在 `all` 与 `any` 时：先过 `all`，再判断 `any`；两者都满足才命中。

## 5. 冲突决策与确定性

对单个符号，若命中多个模块规则，按以下顺序决策：

1. 比较 `effectivePriority = rule.priority ?? module.defaultPriority`，高者胜。  
2. 同优先级时比较 `specificityScore`（`eq=4`，`in=3`，`regex=2`，`contains=1`；总分高者胜）。  
3. 仍同分时按规则声明顺序（先声明者胜）。  
4. 仍同分时按模块名字典序（稳定兜底）。  
5. 若无规则命中，回退 `auto` 社区归属。

## 6. 可解释性与审计字段

每个符号最终归属必须可追溯，至少包含：

1. `assignmentSource`: `config-rule | auto-fallback`  
2. `moduleName`  
3. `matchedRuleId`（fallback 为空）  
4. `resolvedBy`: `priority | specificity | rule-order | module-lexicographic | fallback-auto`

## 7. 候选模块生成约束（供 skill 交互使用）

1. 先询问用户预期模块量级 `targetModuleCount`。  
2. 候选数量收敛到 `target ± 20%`。  
3. 体量平衡约束：最大候选文件数 / 最小候选文件数默认不超过 `6x`。  
4. 路径深度为弱信号，主信号为跨符号耦合（CALLS/EXTENDS/IMPLEMENTS）与语义线索。  
5. 用户可输入候选外的新模块名；skill 必须进入意图解析并引导绑定（候选/符号/路径任一锚点）。

## 8. 非法配置与失败策略

`mixed` 模式下，以下任一情况必须失败并输出定位信息：

1. 缺失 `version` 或 `modules`。  
2. 模块名重复。  
3. `defaultPriority` 非数字。  
4. 规则 `id` 重复。  
5. `field/op/value` 类型不匹配。  
6. `regex` 编译失败。  
7. `when` 同时缺失 `all` 和 `any`。

配置缺失时：

1. `mixed + 缺配置文件`：允许回退 `auto`，并输出一次性提示日志。  
2. `auto`：完全忽略配置文件。

## 9. 最小样例集（门禁项）

### 9.1 正向样例

1. 规则命中符号并覆盖 auto 社区归属。  
2. 未命中符号回退 auto。

### 9.2 冲突样例

1. 两模块命中同一符号，按 `effectivePriority` 决胜。  
2. 同优先级再按 `specificityScore` 决胜。

### 9.3 非法样例

1. 重复 `rules[].id`。  
2. 非法 `regex`。  
3. `when` 缺失组合条件。

## 10. 完成标准（执行前硬门禁）

以下全部满足后，才允许进入实现：

1. 语法可被机器校验（schema + 语义校验）。  
2. 冲突决策可预测且有测试覆盖。  
3. 正向/冲突/非法样例均通过或按预期失败。  
4. 与主文档 `auto/mixed` 语义一致。  
5. 关键输出（`query/impact/clusters/processes`）模块归属一致。

