# Workflow: neonspark-index-perf-240

neonspark 冷启动全量建图降耗的持续优化 loop。agent 按本 spec 逐轮迭代，直到达标、路线枯竭或保险丝触发。

## 目标与停线

- **达标线**：按 [../acceptance-noise.md](../acceptance-noise.md) 的 stage-anchored 口径，≥3 次安静窗口冷构建的**区段中位数之和 ≤ 240 秒**。端到端 wall 仅作参考，不做判定依据。
- **基线参照**：当前安静参考为区段和 308.5s（见 [../README.md](../README.md) 与 [../baseline-current.json](../baseline-current.json)），缺口约 68.5s。
- **与 wayfinder map 的关系**：本 loop 的停线是 240s；[../map.md](../map.md) 的 Destination（180s）不因此改动。loop 达标即停，是否继续追 180s 由人在 loop 结束后决定。

## 运行形态：每轮一个新 session

每轮迭代由独立 session 执行。session 之间不依赖对话记忆，全部状态以仓库文档为准。

### 入口协议（session 开始，按序执行）

1. 读 [../README.md](../README.md)、[../roadmap.md](../roadmap.md)、[loop-ledger.md](loop-ledger.md)。
2. 从 ledger 最后一行恢复当前候选状态：
   - `无候选` → 进入"候选选取"。
   - `实现中` → 检查工作树，继续该候选的实现与验证。
   - `待测量` → 进入"测量"步骤。
   - `待判定` → 进入"判定"步骤。
3. 若 ledger 与工作树状态矛盾（如 ledger 说实现中但工作树干净），停下出 brief 等人裁决，不自行猜测。

### 出口协议（session 结束前必须完成）

1. ledger 追加一行本轮记录（格式见 ledger 文件头注释）。
2. roadmap 候选状态表同步更新（进行中 → 完成/不采纳；新派生候选已登记）。
3. 采纳的改动已按"提交门槛"提交；否决的改动已全量还原，工作树干净。
4. 对话中给出本轮 brief：做了什么、测量结论、下一步候选。

## 单轮迭代流程

一轮 = 一个候选的完整生命周期。不得把多个候选混进一轮。

1. **候选选取**：按 roadmap"当前方向"表顺序取下一候选（当前顺序：资源输入降本杠杆 → FTS 区段日志标记 → 声明驱动 namespace 候选发现重评）。实现/测量中发现的杠杆可派生新候选，但必须先写入 roadmap 再执行。**已否决候选不得重跑**。
2. **前置分析**：对即将编辑的符号跑 `impact`（MCP 或 `node .gitnexus/run.cjs impact <symbol> --direction upstream --repo .`）。`risk: UNKNOWN` 视为未决，必须文本检索确认后才可继续。
3. **实现**：遵循 TDD——语义一致性测试场景先行。实验索引、诊断脚本、粗日志一律进 `.scratch/`，不进 Git。
4. **安静窗口 preflight**：测量前跑 `node tools/perf/preflight-probe.mjs`，exit 0 才算安静。不通过：每 10 分钟重试，最多 1 小时；仍不安静则挂起测量，转做本轮内不依赖测量的工作（如埋点、测试、文档）；无事可做才停下出 brief。**噪声样本永不做判定依据**。
5. **测量**：用 `node tools/perf/run-cold-build.mjs --label <标签> --dist gitnexus/dist --target <neonnew 路径> --mode full` 跑冷构建（自动产出 `segments.json`）。先 1 次粗筛；再 3 次正式判定，取区段中位数。粗筛信号不明确（变化 <5s）或标记缺失（exit 2）的样本作废，需补满 3 次有效样本。每次 exit 0 且输入 receipt 一致才有效。
6. **判定**：
   - **采纳** → 过提交门槛 → 立即提交当前分支 → 判定是否达标。
   - **否决** → 全量还原源码，roadmap 记录否决原因与证据哈希。
7. **达标判定**：累计采纳后的区段中位数之和 ≤240s → 再跑 ≥3 次安静冷构建复验 → 通过则停线，出达标 brief。

## 提交门槛（采纳即提交前全部满足）

- `cd gitnexus && npx tsc --noEmit` 与 `npm run build` 通过。
- 相关测试文件通过（按候选触及的模块选择）。
- 三模式语义一致性 A/B：缺省 / `hydration_policy=strict` / compat 三模式构建，符号、关系、FTS 一致性对照符合该候选自己的验收口径。
- `node .gitnexus/run.cjs detect-changes --scope all --repo .` 干净（`partial/truncated` 不算干净，必须重跑）。

## 保险丝（立即停下出 brief 等人，共三类）

1. **达标**：240s 复验通过。
2. **路线枯竭**：连续 3 个候选被否决。
3. **高风险编辑**：新派生候选的 `impact` 报 HIGH/CRITICAL。roadmap"当前方向"表中已列的三个方向（资源输入降本、FTS 区段标记、namespace 重评）已预授权，其范围内的编辑不触发本保险丝；`UNKNOWN` 不在豁免内，仍须先确认。

## 环境约束

- 测量期间本机视为独占：不并行跑其他重 I/O 任务，不并行开第二个测量 session。
- 不修改 neonspark 业务逻辑、不安装全局 CLI、不发布 npm 包、不删除既有索引（继承 map 的 Out of scope）。
- Git 只收源码、轻量说明、结果与哈希；数据库、CSV、解析缓存等重型产物按既有清理纪律回收。
