# NOTES — neonspark-index-perf-240 世界笔记

## 术语

- **安静窗口**：本机无已知重 I/O 后台任务、preflight 噪声探针通过的时间段。只有安静窗口内的冷构建样本可作判定依据。
- **区段中位数**：同一构建各 pipeline 区段计时在多次运行中取中位数；判定用"区段中位数之和"，不用端到端 wall（wall 被环境噪声支配）。
- **粗筛**：候选实现后的第 1 次带 preflight 冷构建，用于快速判断方向是否有信号；不单独构成采纳/否决依据（明确退化除外）。
- **ledger**：[loop-ledger.md](loop-ledger.md)，逐轮台账，session 间状态的唯一来源。
- **保险丝**：loop 主动停下等人的条件，共三类（达标 / 连续 3 候选否决 / 新派生候选 HIGH-CRITICAL impact）。

## 环境

- 基准输入仓：neonnew（2026-10-27 起替换原 neonspark；阶段锚点复现旧基线）。
- 测量机构成已知慢区：SSD 长尾/内核回写节流未定罪，preflight 探针负责识别。
- 重型产物（实验数据库、解析缓存、原始日志）留本地 `.scratch/`，不进 Git。

## 工具与命令

- `node .gitnexus/run.cjs impact <symbol> --direction upstream --repo .` — 编辑前影响分析。
- `node .gitnexus/run.cjs detect-changes --scope all --repo .` — 提交前图变化分析。
- 索引新鲜度：`node .gitnexus/run.cjs analyze --index-only`（索引过期时先问再重建）。
- 验证：`cd gitnexus && npx tsc --noEmit`、`npm run build`、相关测试文件。

## 人的偏好

- 全自动连续跑，人只在保险丝触发时介入；每轮结束给 brief 但不阻塞。
- 采纳即提交当前分支，否决即全量还原，不留中间态。
- 达标线 240s 是 loop 停线；wayfinder map 的 180s 目标保持 open，由人决定是否续追。
