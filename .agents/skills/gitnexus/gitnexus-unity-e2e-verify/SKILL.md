---
name: gitnexus-unity-e2e-verify
description: "End-to-end workflow for Unity runtime process verification: build CLI from source, create analyze_rules for a target Unity repo (interactive), run analyze with full Unity synthetic edges, then verify retrieval results via MCP tools. Use when: 'verify unity runtime process', 'test unity rules on neonspark', 'run unity e2e', 'create analyze rules and test'."
---

# Unity Runtime Process E2E 验证工作流

本技能覆盖完整的 V2 规则驱动验证流程：源码构建 CLI → 交互式规则创建 → analyze 执行 → 检索验证。

## 前置条件

- 当前工作目录为 GitNexus 仓库根目录
- `gitnexus/` 子目录存在且 `npm install` 已完成
- 目标 Unity 仓库可访问（路径由用户提供）

---

## Phase 0: 构建 dist CLI

从当前仓库源码构建，确保使用最新实现（含 V2 规则驱动注入）。

```bash
cd gitnexus && npm run build
```

验证构建产物：

```bash
test -f gitnexus/dist/cli/index.js && echo "BUILD OK" || echo "BUILD FAILED"
```

定义 CLI 变量（后续步骤引用）：

```bash
GITNEXUS_CLI="node $(pwd)/gitnexus/dist/cli/index.js"
```

> 如果构建失败，检查 `npx tsc --noEmit` 的编译错误。

---

## Phase 1: 交互式规则创建

### 1.1 获取目标仓库路径

**必须询问用户**目标 Unity 仓库的绝对路径。不要假设或硬编码路径。

```
请提供目标 Unity 仓库的绝对路径（例如 /path/to/neonspark）：
```

将用户提供的路径存为变量：

```bash
TARGET_REPO="/path/provided/by/user"
```

验证路径有效：

```bash
test -d "$TARGET_REPO/Assets" && echo "Unity project detected" || echo "ERROR: not a Unity project"
```

### 1.2 收集规则线索

与用户交互，收集以下信息来构建 `analyze_rules`：

| 需要的信息 | 问用户的问题 | 示例值 |
|-----------|------------|--------|
| 场景名称 | 你想验证哪个资源→代码链路？ | weapon-powerup-gungraph |
| 资源引用字段 | 哪些序列化字段名触发资源加载？ | `gungraph\|graph` |
| 目标入口方法 | 加载的资源上哪些方法会被触发？ | `OnEnable, Awake` |
| 持有字段的类 | 哪些类持有触发加载的字段？（正则） | `PowerUp$` |
| 字段名 | 具体的序列化字段名？ | `gungraph` |
| 加载方法 | 哪些方法触发资源加载？ | `Equip` |
| 动态跳转 | 链路中是否有事件派发或回调（C# Action/SyncList/delegate）？ | `NetEventHub.OnPickUpItem → OnClientPickItUp` |
| 额外 lifecycle | 项目有自定义入口方法吗？ | `Init, Setup` |
| lifecycle 范围 | 自定义入口方法的作用范围？ | `Assets/NEON/Code/Game/Graph` |

如果用户不确定某些字段，可以通过 GitNexus MCP 工具辅助探索：

```
# 查找资源引用字段名
mcp__gitnexus__cypher: MATCH ()-[r:CodeRelation {type:'UNITY_ASSET_GUID_REF'}]->() RETURN DISTINCT r.reason LIMIT 20

# 查找挂载在资源上的类
mcp__gitnexus__cypher: MATCH (c:Class)-[r:CodeRelation {type:'UNITY_COMPONENT_INSTANCE'}]->(f:File) WHERE f.filePath CONTAINS '.asset' RETURN c.name, f.filePath LIMIT 20

# 查找特定类的方法
mcp__gitnexus__context: name=WeaponPowerUp
```

### 1.3 创建规则 YAML

确保目标仓库的规则目录存在：

```bash
mkdir -p "$TARGET_REPO/.gitnexus/rules/approved"
```

根据收集的线索，生成规则文件。模板：

```yaml
id: unity.<scenario-name>.v2
version: 2.0.0
family: analyze_rules
description: >-
  （可选）描述该规则覆盖的业务场景和调用链背景，
  包括动态跳转的机制说明（事件派发/回调绑定等）。
trigger_family: <scenario-name>
resource_types:
  - asset
host_base_type:
  - MonoBehaviour
  - ScriptableObject

match:
  trigger_tokens:
    - <token1>
    - <token2>
  host_base_type:
    - MonoBehaviour
    - ScriptableObject
  resource_types:
    - asset

resource_bindings:
  # 类型 A：资源 GUID 引用链触发目标资源上组件的生命周期回调
  - kind: asset_ref_loads_components
    ref_field_pattern: "<field_pattern>"
    target_entry_points:
      - OnEnable
      - Awake

  # 类型 B：类的特定方法触发其序列化字段引用的资源加载
  - kind: method_triggers_field_load
    host_class_pattern: "<class_pattern>"
    field_name: "<field_name>"
    loader_methods:
      - <method_name>

  # 类型 C（可选）：方法触发场景加载，场景中组件 lifecycle 被触发
  - kind: method_triggers_scene_load
    host_class_pattern: "<class_pattern>"
    loader_methods:
      - <method_name>
    scene_name: "<scene_name>"           # 匹配 .unity 文件名（不含扩展名）
    target_entry_points:
      - Awake
      - Start
      - OnEnable

  # 类型 D（可选）：声明静态分析无法捕获的动态跳转（事件派发/回调/delegate）
  # 适用场景：C# Action/UnityEvent 事件派发、Mirror SyncList 回调、delegate 绑定等
  # 注入一条 source_method → target_method 的合成 CALLS 边（精确匹配，一条边）
  - kind: method_triggers_method
    description: >-
      说明动态跳转的机制：例如"A 通过 EventHub.OnXxx?.Invoke() 触发，
      B 在初始化时订阅该事件"，或"A 调用 SyncList.Add()，
      触发 SyncList.Callback 回调到 B"
    source_class_pattern: "<source_class_regex>"   # 例如 "^PlayerActor$"
    source_method: "<source_method_name>"           # 例如 "ProcessInteractables"
    target_class_pattern: "<target_class_regex>"   # 例如 "^NetPlayer$"
    target_method: "<target_method_name>"           # 例如 "OnClientPickItUp"

# 可选：项目特有的 lifecycle 入口
lifecycle_overrides:
  additional_entry_points:
    - Init
    - Setup
  scope: "<path_prefix>"

topology:

closure:
  required_hops:
    - resource
    - guid_map
    - code_loader
    - code_runtime

claims:
  guarantees:
    - resource_to_runtime_chain_closed
  non_guarantees:
    - no_runtime_execution
    - no_dynamic_data_flow_proof
```

写入规则文件：

```bash
# 将上面填充好的 YAML 写入
cat > "$TARGET_REPO/.gitnexus/rules/approved/<ruleId>.yaml" << 'RULE_EOF'
<filled yaml content>
RULE_EOF
```

### 1.4 更新 catalog.json

读取现有 catalog（如果存在），添加新规则条目：

```bash
# 如果 catalog.json 不存在，创建初始结构
if [ ! -f "$TARGET_REPO/.gitnexus/rules/catalog.json" ]; then
  echo '{"version":1,"rules":[]}' > "$TARGET_REPO/.gitnexus/rules/catalog.json"
fi
```

用 Edit 工具或 node 脚本向 `rules` 数组追加：

```json
{
  "id": "<ruleId>",
  "version": "2.0.0",
  "file": "approved/<ruleId>.yaml",
  "enabled": true,
  "family": "analyze_rules"
}
```

---

## Phase 2: 执行 analyze

运行完整索引，包含 Unity 合成边注入：

```bash
$GITNEXUS_CLI analyze "$TARGET_REPO" --force
```

> 超时设置：10-30 分钟（大型 Unity 项目可能需要更长时间）。

### 验证 analyze 输出

analyze 完成后，检查索引状态：

```bash
$GITNEXUS_CLI status
```

确认目标仓库已被索引且状态为最新。

---

## Phase 3: 检索验证

使用 MCP 工具执行 4 项验证。每项给出 PASS/FAIL 判定。

### 验证 1: 合成边存在性

```
mcp__gitnexus__cypher:
  query: |
    MATCH (a)-[r:CodeRelation {type: 'CALLS'}]->(b)
    WHERE r.reason STARTS WITH 'unity-rule-'
    RETURN a.name AS source, b.name AS target, r.reason AS reason
    LIMIT 20
  repo: <repo-name>
```

**PASS 条件**：返回 ≥1 行，且 `reason` 包含规则 ID。
**FAIL 诊断**：规则未被 pipeline 加载 → 检查 catalog.json 的 `family` 字段是否为 `analyze_rules`。

### 验证 2: 运行时链路验证

```
mcp__gitnexus__query:
  query: "ReloadBase"
  runtime_chain_verify: "on-demand"
  repo: <repo-name>
```

**PASS 条件**：`runtime_claim.status === 'verified_full'` 且 `runtime_claim.evidence_level === 'verified_chain'`。
**FAIL 诊断**：
- `rule_not_matched` → 缺少可用结构化锚点，或 symbol/resource seed 不足以建立 graph-only closure 起点
- `rule_matched_but_verification_failed` → 图谱中无匹配的 `unity-rule-*` 合成边

### 验证 3: Process 完整性

```
mcp__gitnexus__context:
  name: "ReloadBase"
  repo: <repo-name>
```

**PASS 条件**：返回的 `processes` 中至少有一个包含跨越资源层和代码层的步骤。
**FAIL 诊断**：Process 生成器未拾取合成边 → 检查合成边的 `confidence` 是否 ≥ 0.5。

### 验证 4: 端到端链路

```
mcp__gitnexus__cypher:
  query: |
    MATCH path = (a)-[:CodeRelation {type: 'CALLS'}*1..6]->(b)
    WHERE a.name = 'WeaponPowerUp' AND b.name = 'ReloadBase'
    RETURN [n IN nodes(path) | n.name] AS chain
    LIMIT 5
  repo: <repo-name>
```

**PASS 条件**：返回至少一条从 WeaponPowerUp 到 ReloadBase 的调用链。
**FAIL 诊断**：中间节点缺失 → 需要更多规则覆盖中间的资源→代码边界穿越。

---

## Phase 4: 结果报告

汇总 4 项验证结果：

```
## Unity Runtime Process E2E 验证报告

| # | 验证项 | 结果 | 详情 |
|---|--------|------|------|
| 1 | 合成边存在性 | PASS/FAIL | 找到 N 条 unity-rule-* 合成边 |
| 2 | 运行时链路验证 | PASS/FAIL | status=..., evidence_level=... |
| 3 | Process 完整性 | PASS/FAIL | 找到 N 个包含合成边的 Process |
| 4 | 端到端链路 | PASS/FAIL | WeaponPowerUp → ... → ReloadBase |

总体结论：PASS / PARTIAL / FAIL
```

### 失败时的诊断路径

| 症状 | 可能原因 | 修复方向 |
|------|---------|---------|
| 验证 1 失败（无合成边） | 规则未加载或 `family` 不是 `analyze_rules` | 检查 catalog.json 和规则 YAML |
| 验证 2 失败（rule_not_matched） | 缺少结构化锚点，或 seed 不足以形成 graph-only closure 起点 | 补充 symbol/resource anchors，优先使用 `resource_path_prefix`、`uid`、精确类名 |
| 验证 2 失败（verification_failed） | 合成边存在但 ruleId 不匹配 | 检查规则 ID 一致性 |
| 验证 3 失败（无 Process） | 合成边 confidence 过低 | 检查 `RULE_EDGE_CONFIDENCE`（应为 0.75） |
| 验证 4 失败（链路断裂，中间有动态跳转） | 事件派发/回调/delegate 无静态 CALLS 边 | 添加 `method_triggers_method` binding 桥接动态跳转 |
| 验证 4 失败（链路断裂，无动态跳转） | 中间缺少资源→代码穿越边 | 添加更多 `resource_bindings` 覆盖缺失段 |

---

## 参考文档

- 设计文档：`docs/plans/2026-04-03-unity-runtime-process-rule-driven-design.md`
- 实现手册：`docs/unity-runtime-process-rule-driven-implementation.md`
- SSOT：`docs/unity-runtime-process-source-of-truth.md`
- 规则类型定义：`gitnexus/src/mcp/local/runtime-claim-rule-registry.ts`
- 注入逻辑：`gitnexus/src/core/ingestion/unity-runtime-binding-rules.ts`
