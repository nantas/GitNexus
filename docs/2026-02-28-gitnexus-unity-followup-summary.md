# GitNexus Unity 跟进修复与问答总结

- 日期: 2026-02-28
- 范围: 本轮对 GitNexus 的 C#/Unity 索引准确性修复、基线复测、以及相关问答结论
- 目标: 记录“刚才几次提交解决了什么问题”与“关键问题答复”，便于后续复用

## 1. 提交摘要

### 1.1 `d83bb0f`（快照提交）

- 类型: 变更快照（修复前基线）
- 作用:
  - 固化当时工作区，避免后续修复丢失上下文
  - 包含 Unity 可行性报告、技能文件更新、以及 C# query 修复前后状态的过渡内容

### 1.2 `c6ef509`（核心修复）

- 标题: `fix: improve symbol disambiguation and Unity indexing accuracy`
- 关键改动:
  - `query`:
    - 从“文件命中后随机取符号”改为“符号级 FTS 命中优先”
    - 增加精确符号名优先逻辑，降低 `MinionsManager class` 这类查询噪声
  - `context`:
    - 同名符号返回 `ambiguous + candidates`，不再误选
    - 类型推断改为从 `id` 前缀推断，减少 `labels(...)[0]` 空值带来的类型缺失
    - 对类/接口提供文件范围回退，避免 `incoming/outgoing/processes` 为空
  - `impact`:
    - 支持 `target_uid` / `file_path` 精确定位
    - 同名时先返回歧义候选，不再误命中同名属性或同名方法
    - 默认 `minConfidence` 调整为 `0.3`（更贴合 Unity 项目中常见 0.3~0.5 边）
  - 行号:
    - Tree-sitter 行号改为 1-based（`+1`），修复 `startLine/endLine` 偏差
  - CLI / MCP:
    - CLI `impact` 新增 `--uid`、`--file`、`--min-confidence`
    - MCP tools schema 同步支持 `target_uid`、`file_path`

### 1.3 `3cfd9eb`（清理提交）

- 标题: `chore: remove unused row type helper`
- 作用:
  - 删除未使用 helper，保持 `local-backend.ts` 清洁

## 2. 你列出的问题与处理结果

你给出的 9 个问题中，核心修复情况如下:

1. `query("MinionsManager class")` 返回无关 definitions  
已修复为符号级命中优先；结果显著收敛到 `MinionsManager` 类和同名属性。

2. `cypher` 按 `minion + manager` 搜不到目标  
复测可命中 `Class:...:MinionsManager`；冲突不再是“搜不到”，而是“同名需消歧”。

3. `context(MinionsManager)` 返回空 incoming/outgoing/processes  
默认调用现在先返回歧义候选；使用类 UID 后可得到非空关系与流程。

4. `impact(MinionsManager, upstream)` 命中属性而非类  
已改为同名先返回歧义，让调用方选择 `target_uid`。

5. `impact(...downstream)` 命中类但 `impactedCount=0`  
通过类/接口回退种子策略 + 更合理置信度默认值缓解；可得到非零影响面。

6. `impact(RemoveMinion)` 误命中 `SyncData.RemoveMinion`  
改为歧义返回后可明确选择 `MinionsManager.RemoveMinion` 的 UID。

7. `impact(Minions)` 命中 Folder 而非属性  
通过 UID/文件路径消歧机制可规避；默认 name-only 查询不再“静默误选”。

8. `MEMBER_OF` 有大量 `(unassigned)`  
本轮未根治（属于社区划分覆盖度问题），但已在报告中标注为残余风险。

9. `labels(s)[0]` 空导致 type 不稳定  
已在工具输出侧改为 `id` 前缀推断类型，稳定性提升。

## 3. 基线复测（真实 Unity 仓库）

### 3.1 `Code` 目录重建

- 路径: `/Volumes/Shuttle/projects/neonspark/Assets/NEON/Code`
- 结果: `51,172 nodes | 108,578 edges | 2,545 clusters | 300 flows`

### 3.2 `Game` 子目录重建（后续做过）

- 路径: `/Volumes/Shuttle/projects/neonspark/Assets/NEON/Code/Game`
- 结果: `32,077 nodes | 62,635 edges | 1,558 clusters | 300 flows`

### 3.3 `Actors` 子目录（缩小规模测试）

- 路径: `/Volumes/Shuttle/projects/neonspark/Assets/NEON/Code/Game/Actors`
- 初次结果: `2,074 nodes | 3,822 edges`
- 增加 `.cs` 过滤后结果: `1,936 nodes | 3,753 edges`
- 校验:
  - `.meta` 文件计数: `0`
  - 非 `.cs` 文件计数: `0`

## 4. 关键问答结论（本轮）

### 4.1 “数据库重建后，当前 agent session 能否直接生效？”

- CLI 新进程调用: 立即生效
- 已运行中的 MCP/agent 长会话: 可能复用旧连接，建议重启会话以确保读取新索引

### 4.2 “是否需要一直跑 `node dist/cli/index.js list` 或某个 CLI？”

- 不需要
- 仅在 Web UI 模式下，需要保持 `gitnexus serve` 后端常驻

### 4.3 “GitNexus 是向量数据库吗？”

- 不是
- 主体是图数据库（Kuzu）+ FTS；向量检索是可选增强（embeddings）

### 4.4 “图数据库与 LSP symbol 查找的本质区别？”

- LSP: 强于精确定义/引用跳转（局部、编辑器会话级）
- 图数据库: 强于多跳关系推理（影响面、流程、跨模块链路）

### 4.5 “启动服务器和 Web UI 命令”

- 后端服务:
  - `cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus`
  - `node dist/cli/index.js serve --host 127.0.0.1 --port 4747`
- Web UI:
  - `cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus-web`
  - `npm run dev -- --host 127.0.0.1 --port 5173`

### 4.6 “为什么扫描速度快？”

- 以离线批处理为主:
  - 扫描与解析分阶段
  - 并行解析 worker + 批量写入 Kuzu + FTS 建索引
  - 查询期直接走本地图与索引，减少在线推理成本

## 5. 本轮新增能力（尚未提交）

以下改动已在工作区生效，但未单独提交到新 commit:

- `analyze --extensions <list>` 文件后缀白名单（可用 `--extensions .cs` 只扫 C#）
- 默认忽略新增 `.meta`
- 根 `.gitignore` 新增 `.obsidian/`

## 6. 建议的 Unity 使用方式（当前阶段）

建议默认命令:

`node dist/cli/index.js analyze --force --extensions .cs <Unity目录>`

理由:

- 能显著降低图规模和噪声
- 保留 C# 关系分析价值（query/context/impact）
- 降低 Web UI 卡顿概率

