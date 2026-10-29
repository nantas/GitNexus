---
id: neonspark-perf-acceptance-noise
parent: neonspark-index-performance
labels: ["wayfinder:grilling"]
status: closed
assignee: codex
blocked_by: []
---
# 定验收测量的噪声策略

## Question

[neonnew 重立基线](neonnew-rebaseline.md)证明：当前环境下端到端完整构建 wall 被环境噪声支配
（三次 1310-1503s，各含一个落点不定的 ~1000s 慢区），连旧 464.5s 参考都不可复现；而阶段成本
（热缓存）与纯代码整轮（≤165s）可稳定复现。180 秒验收应采用哪种口径？

## 决议（2026-10-28 用户选定）

**采用阶段锚定判据**：以阶段/区段成本表为验收对象，端到端 wall 降为参考记录（不设阈值）。

### 判据定义

- 测量条件：≥3 次独立冷构建（空索引 + 空解析缓存；不清 OS 页缓存，沿用冷启动定义），安静窗口
  执行（Unity 等开发负载暂停）；每次 exit 0 且输入 receipt 一致，否则样本作废。
- 分段口径（从 analyze 日志与事件时间线提取，工具已在
  `.scratch/neonnew-rebaseline-20261027/` 验证可用）：

| # | 区段 | 提取标记 |
|---|---|---|
| 1 | 启动+输入快照 | 进程启动 → `▶ Phase: scan` |
| 2 | scan | `✓ Phase: scan` |
| 3 | parse | `✓ Phase: parse` |
| 4 | scopeResolution | `✓ Phase: scopeResolution` |
| 5 | unity-resources | `✓ Phase: unity-resources` |
| 6 | 其余小阶段 | 最后一个 `✓ Phase:` 行为止的剩余阶段 |
| 7 | CSV+DB 导入 | 最后阶段行 → `FTS: creating File` |
| 8 | FTS+发布+退出 | `FTS: creating File` → 进程退出 |

- 通过条件：各区段取 ≥3 次独立运行的中位数，**中位数之和 ≤ 180 秒**。
- 端到端 wall 与 CPU/峰值照常记录，作为环境与成本参考，不作为判定。

### 安静窗口参考（2026-10-28 09:41，full-b4，单次）

Unity 空闲（2% CPU）窗口下完整构建 **308.5s**（CPU 727.9s ≈ 旧参考 727.8s，receipt 与语义产物
和 full-b1 逐字节一致）：

| 区段 | 秒 |
|---|---:|
| 启动+快照 | 30.4 |
| scan | 13.4 |
| parse | 40.7 |
| scopeResolution | 26.1 |
| unity-resources | **69.8** |
| CSV+DB 导入 | 29.5 |
| FTS+发布+退出 | **94.5** |
| 合计（≈wall） | ~306-308 |

两个新事实：
1. 旧参考 464.5s 带外置 HFS+ 源盘惩罚：neonnew 内置盘上 unity-resources 69.8s vs 旧 150.2s，
   同 CPU 总量下 wall 差 156s。基线输入仓切换后，180s 目标的实际缺口比旧参考显示的更小。
2. FTS+发布+退出段（94.5s）现为第二大区段且内部无日志标记（含发布前 157k 文件再哈希 ~38s）；
   若它成为优化主项，需要先给产品加区段日志标记。

## 后续

- [验收票](acceptance.md)解除本票阻塞，按阶段锚定判据执行；当前缺口 ~126s（306→180）。
- 优化排序证据更新见[路线图](roadmap.md)：unity-resources（69.8s）与 FTS/发布段（94.5s）并列
  主项候选，待更多区段分解。
