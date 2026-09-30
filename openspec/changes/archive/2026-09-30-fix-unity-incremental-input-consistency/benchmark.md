# neonnew 修复后实测（2026-09-29）

## 结论

四轮成功，全部逐事实/逐路径/完整 seed 对照通过。普通无变化运行分别为 **45.237 / 36.504 秒**，旧版普通重跑为 335.431 秒且会丢事实。新版两轮均未进入 parse、scope、Unity、数据库批量写入或 FTS；数据库、metadata 与 seed 的 inode、mtime、大小及侧车内容摘要保持不变。

**全量构建没有提速**：本轮冷解析缓存全量 754.104 秒、热缓存强制全量 691.188 秒，旧观测为 477.559 / 338.911 秒。新实现增加完整输入核验与发布前复核（冷合计 127.989 秒，热合计 137.831 秒）；资源、DB 与 FTS 仍执行。系统换页和各阶段耗时也明显不同，不能把全部差值归因于新代码，亦不能声称只是环境造成。接受的是正确性修复与无变化快路径，不是所有增量场景提速。真实变化、显式 force、旧索引一次修复仍承担全量成本。

## 固定条件与命令

- 源码基线：`1666e83ee433f7461fff6028afdf74ec4b5f50b2` 加本 change 工作区实现；四轮源文件/dist SHA256 不变（见下表）。
- 目标：`/Users/nantasmac/projects/neonnew`，HEAD `a9b2894c67ee9087bf2c2e984a356ca7e5135f97`。
- 原始及结束清单：155,513 个路径，manifest SHA256 `c6798e8d9cc7150090f17ff814bbd01aa124f91638930b71434c4bd1faba977a`，重新枚举后的清单逐字节一致；完整输入 receipt 另覆盖 162,488 个实际/保守候选输入。
- scope `Assets/`, `Packages/`；includeExtensions `.cs`, `.meta`；define project `Assembly-CSharp.csproj`。完整调用参数及配置见各轮 `invocation.json`。
- Node 24.15.0；`--max-old-space-size=18432 --max-semi-space-size=128 --stack-size=4096`；本地 dist；相同内存采样 preload，2 秒一次。
- 独立存储 `/Volumes/Shuttle/gitnexus-input-consistency-final-20260929/index`；独立 `GITNEXUS_HOME` 为相邻 `home`。
- `NODE_ENV=development VALIDATE_SEMANTIC_MODEL=0 PROF_LBUG_LOAD=1 PROF_SCOPE_RESOLUTION=1`。
- 顺序 cold → warm → noop → noop2，无并行重型测试。cold/warm 使用 `--force`，noop/noop2 不使用；全部 `--index-only --verbose --name neonnew-input-consistency`。
- “冷”只指解析缓存为空，不代表清空 OS 文件缓存。harness 每轮在计时前核验既有 manifest；**产品自己的完整输入核验始终在计时内**。导出数据库事实在计时外。

```sh
# 从 GitNexus 根目录依次执行；run.mjs 内部切换到 neonnew
UNITY_BENCH_NODE=/Users/nantasmac/.nvm/versions/node/v24.15.0/bin/node
$UNITY_BENCH_NODE .scratch/neonnew-input-consistency-final-20260929/run.mjs cold gitnexus/dist
$UNITY_BENCH_NODE .scratch/neonnew-input-consistency-final-20260929/export-facts.mjs cold
# warm、noop、noop2 同样依次运行并导出；harness 拒绝覆盖已完成样本。
python3 .scratch/neonnew-input-consistency-final-20260929/summarize.py
python3 .scratch/neonnew-input-consistency-final-20260929/compare.py
python3 .scratch/neonnew-input-consistency-final-20260929/verify-final.py
```

实际 CLI 由 `/usr/bin/time -l` 包装；wall 覆盖启动、输入核验、构建/复用及退出。30 分钟单轮上限、磁盘低于 2 GiB 中止保护均未触发。

## 耗时（秒）

| 轮次 | 完整 wall | 初始输入核验 | 发布前复核 | parse | scope | Unity resources | CSV/COPY 总计 | FTS 总计 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cold | 754.104 | 55.740 | 72.249 | 104.264 | 51.040 | 267.775 | 74.942 | 90.136 |
| warm | 691.188 | 54.310 | 83.521 | 5.192 | 42.761 | 254.990 | 120.268 | 86.824 |
| noop | 45.237 | 37.417 | 0.000 | 0.000 | 0.000 | 0.000 | 0 | 0.000 |
| noop2 | 36.504 | 32.155 | 0.000 | 0.000 | 0.000 | 0.000 | 0 | 0.000 |

冷缓存 `0 hit / 128 miss`，热缓存 `128 hit / 0 miss`；noop/noop2 不启动解析器，因此没有 cache summary。各阶段小计不等于 wall，启动、扫描、流程、元数据与发布等成本仍计入 wall；CSV/COPY 为已有 overlap profiler 的总计。

## 内存与系统压力（GiB）

| 轮次 | time 最大 RSS | time peak footprint | 采样主 isolate heap 峰值 | 系统 swap 起止 | 系统换入 / 换出增量 |
| --- | ---: | ---: | ---: | --- | ---: |
| cold | 3.71 | 10.86 | 2.01 | 29.14 → 35.04 | 14.31 / 20.97 |
| warm | 2.90 | 10.03 | 4.25 | 32.39 → 35.29 | 38.11 / 42.74 |
| noop | 0.98 | 1.17 | 0.73 | 29.66 → 30.10 | 1.41 / 1.89 |
| noop2 | 0.83 | 1.26 | 0.84 | 29.38 → 30.46 | 1.22 / 2.30 |

macOS 页大小 16 KiB。RSS、footprint 与 JS heap 含义不同，不能相加；压缩/换页下 heap 可大于当前 resident 内存。swap 是整机指标，不是本进程独占。单组串行观测、系统压力不受实验完全控制，不构成统计性性能保证，也没有复刻旧 1.5.x 的 130 秒项目基线。

## 具体事实与发布验收

每轮查询所有 `UNITY_*` 关系、有序 `STEP_IN_PROCESS`、runtime-root `CALLS`；比较 source/target/type/reason/confidence/step，递归规范化 JSON 后保留重复次数、排序逐项对比。**不是仅比较数量**。四轮共用的排序事实哈希列表 SHA256：`e401019bf19e6c52954da12078becd8b7301c6d5fd47219642dd7014a3185c2c`。

| 事实类型 | 每轮数量 |
| --- | ---: |
| STEP_IN_PROCESS | 11,790 |
| UNITY_RESOURCE_SUMMARY | 74,134 |
| UNITY_COMPONENT_INSTANCE | 119,315 |
| UNITY_ASSET_GUID_REF | 70,788 |
| CALLS | 256 |
| UNITY_GRAPH_NODE_SCRIPT_REF | 70,704 |
| UNITY_SERIALIZED_TYPE_IN | 5,793 |

- 四轮均为 352,780 条事实，完整解析后的 seed、持久 File ID/路径、metadata.fileHashes、图统计完全一致。新版 cold 还与旧版正确 cold 逐事实和 seed 对照通过。
- 每轮持久 File 为 154,296 个，路径集合与发布哈希集合完全一致。stats.files=135,935 是已有源码扫描统计，不能拿它代替最终 File 清单。
- stats.nodes=272,294，stats.edges=813,225。旧普通重跑曾缺失 334,941 条事实；本次两轮普通重跑缺失/新增均为 0。
- 四轮 receipt 均为 version 1，digest `cfd534f964fb3d01d1f7038c5a154bcfb5a6b8e17451a14db09166df05e3cef4`，fileCount=162,488。
- 普通重跑均记录 `Unity inputs: reuse` 和 `Already up to date`；没有重型 phase、COPY profiler 或 FTS 创建日志，且持久文件记录前后完全相同。
- 正常 `.gitnexus` 的数据库 inode/mtime/大小、metadata/seed 摘要及项目 HEAD/完整 status -z 前后完全一致。未修改 neonnew 用户 C#。不对全局 registry 的并发活动作额外不变声明。
- 原有流程搜索预算截断仍有诊断，本次不将事实一致解释成全项目所有运行时路径的 closure 证明。

## 证据与限制

原始目录 `.scratch/neonnew-input-consistency-final-20260929/` 保存 runner、导出器、manifest、调用、stdout/stderr、time、内存、系统压力、四组数据库事实与完整 seed 压缩件、File inventory、前后 metadata、`measurements.json`、`semantic-comparison.json`、`old-reference-comparison.json`、`acceptance.json`。最终验收脚本所有检查为 true。

计时外只读事实导出出现既有 missing-shadow WAL quarantine 诊断；四轮事实和主数据库状态核对均通过。

较早 `.scratch/neonnew-input-consistency-20260929` 试跑于 71.404 秒人工中止，不计入本表。全量测试超时与既有 NUL 检查失败单独见 [verification](verification.md)，不被性能验收覆盖。

## 实现内容 pin

| 文件 | SHA256 |
| --- | --- |
| `gitnexus/src/core/run-analyze.ts` | `dbbf371193c35979a8a23bf47edae2a404b45f7e63db8f1ffa18385d25df53f1` |
| `gitnexus/src/core/unity/analysis-input-snapshot.ts` | `42c915762d36d31d2510c29d0a689db0c44986cdc43a0d8705460e1107b23597` |
| `gitnexus/src/storage/repo-meta.ts` | `295c50af51ebdf0e0630172bfb7fe554743d682ff8a68e54f0479bfbc134db7a` |
| `gitnexus/dist/core/run-analyze.js` | `e3d595cd76a0bcb9a258935a7d07a25b4ff18c003b7e374b3cd967b6c4c18da9` |
| `gitnexus/dist/core/unity/analysis-input-snapshot.js` | `8a6e7ab38b8cc58ef8600d48d094a781d87febfcdad70b9908a8c45bd8b8fda4` |
