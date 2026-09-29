# neonnew 完整构建 A/B

2026-09-29，Node v24.15.0。用户指定 neonnew，未重建正在使用的 neondesign。

## 固定条件

- 目标：`/Users/nantasmac/projects/neonnew`，HEAD `a9b2894c67ee9087bf2c2e984a356ca7e5135f97`。
- 155513 个源文件/资源/配置/csproj 输入的内容清单 SHA256：`c6798e8d9cc7150090f17ff814bbd01aa124f91638930b71434c4bd1faba977a`。每次运行前核验内容，运行后重新枚举核验新增/删除及内容变化。
- 两版均 `--force --index-only --no-parse-cache`；Node heap 18432 MiB、semi-space 128 MiB、stack 4096 KiB。强制全量数据库写入，串行运行，测量期间无本任务的编译、测试或清理。
- 相同外置索引目录和独立 GITNEXUS_HOME，保留 neonnew 原索引及用户注册表。冻结 baseline dist 与当前优化 dist 的 resolver 哈希见各自 invocation.json。
- 2 秒采样每个 isolate 的 heapUsed；报告所有 isolate 中最大样本，并单列 whole-process RSS/footprint。不是 isolate heap 求和，也不是无采样误差的瞬时峰值。
- 单次上限 30 分钟；系统盘低于 2 GiB 自动中止。最终两次均未触发保护、退出码 0。

## 结果

| 指标 | 基线 | 优化版 | 降幅 | 预设门槛 |
| --- | ---: | ---: | ---: | --- |
| 完整命令 wall | 786.176 s | 512.561 s | 34.80% | ≥10% |
| Unity 资源阶段 | 533.882 s | 243.398 s | 54.41% | ≥20% |
| peak sampled isolate heap | 6517413480 B（6.07 GiB） | 2062855328 B（1.92 GiB） | 68.35% | ≥10% |
| whole-process maxRSS | 4097327104 B | 3221929984 B | 21.37% | 上升超过 10% 需调查 |
| peak memory footprint | 17598160768 B | 12417653712 B | 29.44% | 上升超过 10% 需调查 |
| user + system CPU | 1015.15 s | 805.93 s | 20.61% | 辅助证据 |
| instructions retired | 14426029565842 | 8763357137357 | 39.25% | 辅助证据 |

最大 isolate heap 样本均来自主线程。原始数值见 [neonnew-final-measurements.json](neonnew-final-measurements.json)。数值门槛在完整运行前锁定，未根据结果调整。

优化版成本：19399 个资源各一次 discovery，读取 5643347241 bytes；16488 个选中资源各一次 semantic open/parse，读取 5225435798 bytes。Discovery 暂存 peak-record-bytes 4194196，spill 写入和重放各 30286473 bytes；语义解析暂存峰值 15268 bytes，无 spill。resource-failures 为 0。必要全局映射、最终图和数据库内存不属于上述局部记录预算。

## 语义验收

最终关系和 seed 对比见 [neonnew-final-semantic-comparison.json](neonnew-final-semantic-comparison.json)。比较的是 352780 条关系的 source/target/type/reason/confidence/step 规范化具体事实多重集合，不只比较数量；reason 的对象键排序，不移除业务字段。完整 seed 深比较涵盖 canonical/GUID/resource 映射。

原始 gzip 关系、seed、fact-hashes、调用参数、日志、内存及系统压力位于 `.scratch/unity-resource-ab/complete-baseline/` 与 `complete-optimized/`。

## 环境限制和排除记录

这是同一台仍有其他应用活动的 24 GiB Mac 上的一组串行观测，不是隔离实验室或跨机器性能保证。系统初始 swap 使用量基线约 26549 MiB、优化版约 21388 MiB，系统计数包含其他进程，不能全归因于 indexer；OS 文件缓存也未人为清空。两版 parser cache 均禁用。

这些环境差异需要随结果保留，但本次收益并非仅由更快的前置解析解释：优化版 parse 67.850 s，反而高于基线 38.931 s；非 Unity 部分总 wall 为 269.163 s 对 252.294 s，也略慢。整体 wall 节省主要来自 Unity 阶段的 290.484 s，且 CPU、retired instructions、实际资源读取复杂度和前置真实资源原型给出同方向证据。因此按本次固定输入的观测值判定数值门槛满足，同时不承诺每次都得到相同百分比。

- 首次基线因系统盘降至约 200 MiB，在 FTS 收尾前被 SIGINT 中止，不纳入完整比较；原日志保存在 `neonnew-baseline-disk-interrupted/`。
- 用户授权清理旧上游验收产物，释放约 42 GiB；Git 追踪路径与嵌套仓库元数据排除在清理外。
- 第一轮优化版解析时发生清理，只作诊断，保存在 `neonnew-optimized-cleanup-diagnostic/`；正式优化版已重新运行。
- 原先 neondesign 快照运行因用户改用 neonnew 而停止，完全排除。
- 既有流程遍历预算截断、C# 条件表达式诊断保持存在；资源优化与关系相等不意味着全仓所有运行时流程已获得完整证明。
