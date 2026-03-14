# GitNexus Analyze 内存优化专项设计（三档规划）

**日期**: 2026-03-14  
**状态**: 设计已批准，待进入实施计划  
**类型**: 性能/内存专项设计

## 1. 背景

`2026-03-14` 的 Unity lazy-expand 性能加固已经证明，查询冷路径的首次内存尖峰可以通过 query-time hydration 预算化明显收敛，但 full-repo `analyze` 仍然维持在高内存区间。

基于当前实测：

- `analyze`: `141.47s`, RSS `6.38GB`
- `context DoorObj` cold: `4.16s`, RSS `1.91GB`
- `context DoorObj` warm: `2.04s`, RSS `1.00GB`

结论：当前主瓶颈已经从“Unity enrich 重复全仓扫描”转移到“analyze 全流程的图对象常驻 + Kuzu/FTS 装载成本 + Unity 图数据膨胀”。

## 2. 问题定位

### 2.1 已经不是“全量读源码进内存”

当前 `pipeline` 已经具备：

1. `walkRepositoryPaths` 路径扫描，不读内容。
2. `20MB` byte budget 的 chunked source read。
3. chunk 级 AST cache 清理。
4. import resolution context 的显式释放。

因此，源码读取重复不是 analyze RSS 的主因。

### 2.2 当前 analyze RSS 的主要来源

1. `KnowledgeGraph` 在 pipeline 完成后到 Kuzu/FTS 结束前持续常驻内存。
2. `loadGraphToKuzu` 会把关系 CSV 再读一遍，并通过 `relsByPair: Map<string, string[]>` 在内存中重新分桶。
3. Unity enrich 仍会新增大量 Unity component 节点与边，放大单项目图规模。
4. `buildUnityScanContext` 会先把脚本内容读入 `scriptSources[]`，再构建 serializable type index。

### 2.3 已有历史技术决策与现状一致

项目历史文档已明确记录：

1. `2026-03-06`：Unity enrich 的主要瓶颈曾是“按 Class 重复全仓扫描”，已通过“两阶段 + 复用索引”解决。
2. `2026-03-09`：full-repo 端到端瓶颈已转移到 `Kuzu/FTS`，不再主要落在 Unity enrich。

本设计以该判断为前提，不回退到“继续只优化 Unity resolver 即可解决 analyze RSS”的假设。

## 3. 需求定位

本专项要同时回答三个问题：

1. 如何降低 `analyze` 阶段峰值内存，而不先破坏查询契约？
2. 如何减少单项目在图和数据库中的 Unity 数据体量？
3. 如果进一步把完整 Unity 绑定推迟到 query-time，会带来哪些可接受与不可接受的影响？

## 4. 非目标

1. 本轮设计不直接实现增量索引或 Kuzu-first 全重构。
2. 本轮设计不改变非 Unity 查询主路径。
3. 本轮设计不接受“只降内存但明显拖慢 analyze”。
4. 本轮设计不接受 `context/query --unity-resources on` 结果语义回退。

## 5. 统一测量合同

每一档实施后都必须独立产出测量报告，使用统一协议。

### 5.1 Analyze 指标

1. 端到端时间：`/usr/bin/time -l node gitnexus/dist/cli/index.js analyze ...`
2. 峰值内存：`maximum resident set size`
3. 分阶段耗时：
   - `pipeline total`
   - `extracting / parsing / communities / processes / enriching`
   - `KuzuDB`
   - `FTS`
4. 图规模：
   - `nodes`
   - `edges`
   - Unity 相关：
     - `bindingCount`
     - `UNITY_SERIALIZED_TYPE_IN` edge count

### 5.2 Query 指标

必须固定跑两组：

1. `context DoorObj --unity-resources auto`
2. `context AssetRef` 或 `context CharacterList --unity-resources on`

分别测：

1. cold query：`real` + `max RSS`
2. warm query：`real` + `max RSS`
3. `resourceBindings` 数量
4. `unityDiagnostics`

### 5.3 正确性门禁

每一档都必须保持：

1. `npm --prefix gitnexus run test:unity`
2. Unity 定向测试集全绿
3. `UNITY_SERIALIZED_TYPE_IN > 0`
4. `context(on) resourceBindings > 0`
5. `CharacterList assetRefPaths/sprite` 等 U3 gate 不回退

## 6. 三档设计

### 6.1 Tier 1：只降峰值，不改查询契约

目标：降低 analyze RSS，不改变数据库语义与 query 语义。

#### 设计动作

1. 在 `loadGraphToKuzu(...)` 完成后尽早释放 `pipelineResult.graph` 引用，避免图对象继续陪跑 FTS 和后续步骤。
2. 将 `relsByPair` 从内存 `Map<string, string[]>` 改为“按 pair 流式写临时 CSV”，避免关系字符串二次常驻。
3. 将 Unity `serializable type index` 改为流式两遍扫描，不保留整仓 `scriptSources[]`。
4. 将 `csv-generator` 的源码缓存从按条目数上限改为按总字节预算上限。
5. 为 analyze 增加阶段级 `rss/heapUsed/external` 采样点。

#### 预期影响

1. 优化 analyze 期间内存占用。
2. 基本不改变数据库内容。
3. query-time 基本不变。

#### 验收目标

1. `analyze RSS` 下降 `15%-25%`
2. `analyze` 时间波动控制在 `-5% ~ +5%`
3. `nodes/edges` 与现状保持等价
4. cold/warm query 不明显恶化

### 6.2 Tier 2：轻度减图，兼顾内存和数据库

目标：在保持 query 语义基本不变的前提下，直接减少 Unity 相关节点/边和 payload 体积。

#### 设计动作

1. 删除 `UNITY_COMPONENT_IN`
2. 停止为 Unity-only 资源创建额外 `File` node
3. Unity component 型 `CodeElement` 不再生成 `content` 文本
4. 压缩 Unity payload，只保留 query 必需字段
5. 可选压缩 `UNITY_SERIALIZED_TYPE_IN.reason`

#### 预期影响

1. 优化 analyze 内存占用。
2. 优化数据库中的 Unity 节点/边数量与字符串负担。
3. Kuzu COPY 与 FTS 成本下降。
4. 主链路 `context/query --unity-resources on` 结果语义保持等价。

#### 验收目标

1. 在 Tier 1 基础上 `analyze RSS` 再降 `10%-20%`
2. `analyze` 总时长应小幅改善
3. `nodes/edges` 明确下降
4. cold/warm query 持平或略好

### 6.3 Tier 3：结构性减图，完整绑定转 query-time

目标：通过 analyze 持久化 summary、query-time 恢复 full binding，进一步显著降低 analyze 与数据库体量。

#### 设计动作

1. analyze 期不再为每个 Unity binding 创建 `CodeElement` component node。
2. 改为持久化资源级 summary：
   - `Class -> File`
   - `UNITY_RESOURCE_SUMMARY` 或等价 relation
3. `UNITY_SERIALIZED_TYPE_IN` 改为指向资源 `File`，`reason` 中保留最小可查询信息。
4. query 读取改成：
   - 先读 summary
   - 投影成 lightweight bindings
   - 再通过现有 lazy hydration / overlay 恢复 full binding

#### 预期影响

1. 优化 analyze 内存。
2. 明显缩小数据库中的 Unity 节点、边和 JSON payload。
3. Kuzu/FTS 时间显著改善。
4. cold query 变慢，warm query 依赖 overlay 命中恢复。

#### 验收目标

1. `analyze RSS` 在 Tier 2 基础上继续显著下降
2. `analyze` 总时长明显改善
3. `nodes/edges` 中 Unity 部分显著收缩
4. cold query 可变慢，但必须有明确预算上限
5. warm query 必须回到可接受区间

## 7. 核心 tradeoff 决策

### 7.1 什么在优化“内存占用”

以下动作主要优化 analyze 运行时内存，不改变数据库内容：

1. 更早释放 `graph`
2. 关系分桶流式化
3. scanContext 脚本索引流式化
4. content cache 字节预算化

### 7.2 什么在优化“数据库内容”

以下动作会同时减少 analyze RSS 和数据库体量：

1. 删除 `UNITY_COMPONENT_IN`
2. 停止创建 Unity 资源 `File` node
3. 缩小 Unity payload
4. 不再持久化 component 级 `CodeElement`

### 7.3 query-time 的影响边界

1. Tier 1：query 基本不受影响
2. Tier 2：query 主链路应保持等价，可能略快
3. Tier 3：cold query 明显受影响，warm query 依赖 overlay/cache

## 8. 推荐实施顺序

1. 先做 Tier 1，验证“只降峰值”能拿到多少收益
2. 再做 Tier 2，减少 Unity 图体量与数据库负担
3. 仅当 Tier 1 + Tier 2 仍不足以把 analyze RSS/时间压到可接受区间，再推进 Tier 3

## 9. 风险与缓解

1. 风险：为了减图破坏现有 Unity 查询契约  
   缓解：每档都必须跑 U3 gate 与 `context/query --unity-resources` 验证
2. 风险：Tier 3 将 ingest 成本转移到 query-time，造成 cold query 失控  
   缓解：沿用当前 lazy hydration 的 budget / batch / dedupe / overlay 约束
3. 风险：删除 `UNITY_COMPONENT_IN` 影响手写 Cypher 或调试路径  
   缓解：在 Tier 2 先做消费方排查，并将该变更明确定义为图裁剪决策

## 10. 下一步

进入 `writing-plans`，将三档设计转化为可执行实施计划：

1. Tier 1：峰值拆叠与内存采样
2. Tier 2：轻度减图与 payload 收缩
3. Tier 3：summary 化与 query-time full hydration
