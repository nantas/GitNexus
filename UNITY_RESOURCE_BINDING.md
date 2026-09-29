# GitNexus Unity 资源绑定分析 — 架构与功能设计说明

> 说明：本文聚焦 Unity 资源绑定与 UI trace。  
> `runtime_chain_verify=on-demand` 的 graph-only closure 契约请以 [docs/unity-runtime-process-source-of-truth.md](docs/unity-runtime-process-source-of-truth.md) 为准。

## 一、这个功能解决什么问题？

Unity 游戏项目中，代码（C# 脚本）和资源（界面文件 UXML、样式文件 USS、预制体 Prefab、场景文件等）之间存在大量**隐式关联**。这些关联不是通过代码 `import` 建立的，而是通过 Unity 特有的 **GUID 引用机制**——每个文件都有一个唯一 ID（GUID），资源文件通过这个 ID 来引用其他文件。

这带来一个核心痛点：**开发者改了一个脚本或资源，很难知道哪些其他资源会受影响。** GitNexus 的 Unity 资源绑定分析就是为了让这些隐式关联变得可见、可查询、可追踪。

## 二、整体架构（三阶段流水线）

整个系统分为三个阶段，可以类比为"建图书馆 → 查图书馆 → 专项调查"：

```
┌─────────────────────────────────────────────────────────┐
│  阶段 A：索引构建（Analyze）                              │
│  "把所有书分类编目，放进图书馆"                              │
│                                                         │
│  .cs 脚本 ──→ 找到 GUID ──→ 扫描哪些资源引用了它           │
│                    ↓                                     │
│            深度解析资源 YAML ──→ 提取序列化字段              │
│                    ↓                                     │
│            写入知识图谱（4 种关系边）                        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  阶段 B：查询增强（Query / Context Hydration）            │
│  "根据读者的问题，从图书馆调出相关资料"                       │
│                                                         │
│  用户查询某个符号 ──→ 从图谱加载资源绑定证据                  │
│                    ──→ 附加到查询结果中返回                  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  阶段 C：UI 追踪（Unity UI Trace）                       │
│  "针对 UI 文件做专项调查，追踪引用链"                        │
│                                                         │
│  三种追踪模式：                                           │
│  · 谁引用了这个界面？（asset_refs）                        │
│  · 这个界面嵌套了哪些子界面？（template_refs）              │
│  · 代码中的样式类名和 USS 样式表如何对应？（selector_bindings）│
└─────────────────────────────────────────────────────────┘
```

## 三、阶段 A：索引构建 — "编目入库"

### 做了什么

当用户运行 `gitnexus analyze` 时，系统会：

1. **扫描所有 C# 脚本**，建立"脚本名 → 文件路径 → GUID"的映射表
2. **扫描所有 .meta 文件**，提取每个资源文件的唯一 GUID
3. **在 Prefab/场景/资源文件中搜索 GUID**，找出"哪些资源文件引用了哪个脚本"
4. **深度解析 Unity YAML**，提取 MonoBehaviour 组件的序列化字段值（比如一个按钮引用了哪个图片、一个脚本配置了什么参数）
5. **处理 Prefab 覆盖链**——Unity 的 Prefab 可以嵌套和覆盖，系统会合并多层覆盖，得到最终生效的字段值

### 当前实现主线与读取模式（As-Built，面向理解）

为了避免把流程理解成“只有一条大解析器链路”，这里把实际实现拆成 3 条主线：

| 主线 | 目的 | 覆盖文件范围 | 主要关注字段/线索 | 读取方式 | 覆盖特性 |
|------|------|--------------|-------------------|----------|----------|
| 主线 A：脚本命中扫描（scan-context） | 先找“哪些资源里出现了脚本 GUID” | scoped 的 `.prefab/.unity/.asset`（以及相关 `.meta`） | `m_Script: { guid: ... }` | **流式逐行扫描**（line-by-line） | 全量扫资源文件，但只提取“脚本命中线索” |
| 主线 B：组件深度解析（resolver） | 对命中的资源做组件绑定与字段解析 | 仅主线 A 命中的资源文件（不是所有资源） | `MonoBehaviour` 组件字段、引用字段、Prefab override 合并结果 | **按资源共用解析：小资源 YAML，大资源流式轻量引用** | 同一资源的全部所选脚本共用语义读取；大资源默认不深解析 |
| 主线 C：Prefab Source 资源边（prefab-source） | 补齐 `scene/prefab -> prefab` 资源事实 | scoped 的 `.unity/.prefab` | `PrefabInstance.m_SourcePrefab` | **scan-context 流式识别 + Phase 5.5 统一消费写图** | 不再单独新增全量解析 pass；只记录轻量线索并统一消费 |

补充说明：

1. 主线 A/B 是“先筛选再深解析”的两段式设计。主线 A 负责快速缩小范围，主线 B 负责提取细节。  
2. 主线 C 的目标很窄，只追 `m_SourcePrefab`，不替代主线 B。也就是说，非 prefab 引用的组件字段仍由主线 B 解析。  
3. 你最关心的“哪些是流式、哪些是全量”可直接记为：  
   - 流式：主线 A + 主线 C 的识别阶段（`scan-context`）  
   - 小资源整文件读取：主线 B（≤512 KiB）；大资源只流式提取已有 lightweight 语义
4. analyze 的主线 A/C 共享一次物理发现读取；canonical 归属确定后，`UnityResourceSession` 对每个命中资源再做一次语义读取，processor 统一写图。查询沿用既有路径选择和 deep 请求。
5. 发现记录默认 4 MiB、单组件轻量引用默认 1 MiB 内存预算，超限转为本次运行专属临时记录；消费结束释放，不作为跨次缓存。最终图载荷和必要全局 GUID/canonical 索引单独计量。
6. 每个组件使用自身 m_Script 行号。资源读取/版本一致性失败记录到 metadata，status 通过 `unity-resource-analysis-failed` 报告不完整；下一次 analyze 会完整重试。暂存损坏属于致命错误，不回退到无界内存。

### 架构演进方向：Scan-Context 承载器 + 统一消费点

为避免未来每加一个资源字段识别需求就新增一条独立重型 pass，后续架构统一按下面约束演进：

1. **scan-context 作为承载器（carrier）**
   - 负责在资源扫描阶段产出轻量“线索记录”（resource signals）。
   - 对 prefab-source 信号采用 **streaming delivery** 交付给统一消费点，而不是要求先聚合全量数组。
   - 可按需挂载更多字段识别器（recognizer），例如：
     - 现有：`m_Script.guid`
     - 新增：`PrefabInstance.m_SourcePrefab`
   - 识别器职责是“记录线索”，不是“做完整语义解析”。

2. **`processUnityResources` 作为统一消费点**
   - 统一消费 scan-context 产物并写入图谱关系。
   - 统一执行 dedupe、diagnostics、reason payload 组装。
   - 组件深解析仍由 resolver 主线负责，避免职责混杂。

3. **保持两段式结构**
   - 第一段：扫描阶段（轻量、可扩展、偏流式）
   - 第二段：消费/解析阶段（按命中范围深解析）
   - 这样扩展新能力时只需“新增识别器 + 新增消费逻辑”，不再孤立另起炉灶。

### 写入知识图谱的 4 种关系

| 关系类型 | 含义 | 比喻 |
|---------|------|------|
| `UNITY_COMPONENT_INSTANCE` | 脚本 A 被挂载在资源 B 上 | "这本书被放在了这个书架上" |
| `UNITY_ASSET_GUID_REF` | 资源 A 引用了资源 B | "这本书的参考文献列表里有另一本书" |
| `UNITY_SERIALIZED_TYPE_IN` | 脚本 A 的某个字段类型是可序列化类 B | "这本书引用了另一本书定义的数据格式" |
| `UNITY_RESOURCE_SUMMARY` | 轻量摘要（用于快速查询） | "书的索引卡片" |

### 核心源码模块

| 模块 | 职责 |
|------|------|
| `unity-resource-processor.ts` | 总调度器，串联整个索引流程 |
| `scan-context.ts` | 预计算所有查找表（GUID 映射、资源命中缓存） |
| `meta-index.ts` | 从 `.meta` 文件提取 GUID |
| `resolver.ts` | 深度解析 YAML，提取绑定关系和序列化字段 |
| `yaml-object-graph.ts` | Unity YAML 解析器 |
| `override-merger.ts` | 合并 Prefab 多层覆盖 |
| `resource-hit-scanner.ts` | 在资源文件中逐行扫描 GUID |

## 四、阶段 B：查询增强 — "按需调阅"

当用户通过 `query()` 或 `context()` 查询某个 C# 类时，系统会：

1. 从知识图谱中加载该类的所有 Unity 资源绑定关系
2. 根据**水合模式**（hydration mode）决定返回详略程度：
   - **compact 模式**（默认）：只返回摘要信息，速度快
   - **parity 模式**：返回完整的序列化字段和引用详情，更全面但更慢
3. 将资源绑定证据附加到查询结果中返回

这让 AI 助手在回答"这个类在哪里被使用"时，不仅能看到代码层面的调用关系，还能看到资源层面的挂载关系。

核心源码模块：`unity-enrichment.ts`——从图谱加载资源绑定数据，根据水合模式投影为结构化载荷返回给调用方。

## 五、阶段 C：UI 追踪 — "专项调查"

这是一个**实时分析工具**（不依赖预建索引），专门用于追踪 Unity UI Toolkit 的资源引用链。

### 三种追踪模式

#### 1. `asset_refs` — "谁引用了这个界面？"

```
输入：一个 UXML 文件路径
输出：哪些 Prefab / Asset 文件引用了它

工作原理：找到 UXML 的 GUID → 在所有 Prefab/Asset 中搜索该 GUID
```

用途：改一个界面文件前，先看看它被哪些预制体使用，评估影响范围。

#### 2. `template_refs` — "这个界面嵌套了哪些子界面？"

```
输入：一个 UXML 文件路径
输出：它通过 <Template> 标签引用的所有子 UXML

工作原理：解析 UXML 中的 <Template> 标签 → 提取 GUID → 解析为文件路径
```

用途：理解一个复杂界面的组成结构。

#### 3. `selector_bindings` — "代码里的样式类名对应哪个 USS 规则？"

```
输入：一个 C# 类名或 UXML 路径
输出：C# 代码中使用的 CSS 类名 ↔ USS 样式表中的选择器匹配关系

工作原理：
  UXML → 找到关联的 Prefab → 找到挂载的 C# 脚本
  C# 脚本 → 提取 AddToClassList("xxx") 调用
  UXML → 找到引用的 USS 样式表 → 提取 .xxx 选择器
  交叉匹配 → 评分 → 返回带置信度的匹配结果
```

用途：调试样式问题时，快速定位"代码里写的类名到底对应 USS 里的哪条规则"。

匹配有两种精度模式：
- **strict**：只匹配精确的 `.className` 选择器
- **balanced**（默认）：也匹配复合选择器中包含的类名片段，召回率更高

### 核心源码模块

| 模块 | 职责 |
|------|------|
| `ui-trace.ts` | UI 追踪总入口，调度三种追踪模式 |
| `ui-meta-index.ts` | UXML/USS 文件的 GUID-to-路径映射 |
| `ui-asset-ref-scanner.ts` | 在 Prefab/Asset 中流式扫描 GUID 引用 |
| `uxml-ref-parser.ts` | 解析 UXML 中的 `<Template>` 和 `<Style>` 标签 |
| `uss-selector-parser.ts` | 从 USS 样式表提取类选择器 |
| `csharp-selector-binding.ts` | 从 C# 代码提取 `AddToClassList` / `Q<>` 调用 |

## 六、关键设计决策

| 决策 | 原因 |
|------|------|
| 使用 GUID 而非文件路径作为关联键 | Unity 的资源引用本质上是 GUID 引用，路径会变但 GUID 不变 |
| 索引阶段深度解析 YAML | 只有解析 YAML 才能提取序列化字段值和覆盖链 |
| UI Trace 不写入图谱 | 保持查询时的灵活性，避免索引膨胀 |
| compact/parity 双模式水合 | 平衡查询速度和信息完整性 |
| selector_bindings 使用评分机制 | CSS 类名匹配本质上是模糊匹配，需要置信度排序 |

## 七、数据流全景图

```
Unity 项目文件系统
  │
  ├── .cs 脚本文件
  ├── .cs.meta 文件 ──→ 提取脚本 GUID
  ├── .prefab / .unity / .asset ──→ 搜索 GUID 引用 + 解析 YAML
  ├── .uxml / .uxml.meta ──→ 界面文件 GUID 映射
  └── .uss / .uss.meta ──→ 样式文件 GUID 映射
         │
         ▼
  ┌──────────────────┐
  │  UnityScanContext │ ← 所有查找表的集合
  │  (预计算缓存)     │
  └──────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
 知识图谱    UI Trace
 (持久化)   (实时查询)
    │         │
    ▼         ▼
 查询增强    追踪结果
 (hydration) (evidence chains)
    │         │
    └────┬────┘
         ▼
   AI 助手获得完整的
   代码 + 资源关联视图
```
