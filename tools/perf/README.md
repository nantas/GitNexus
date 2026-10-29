# tools/perf — perf-loop 测量工具集

`neonspark-index-perf-240` loop（见 `docs/wayfinder/neonspark-index-performance/workflows/`）的测量基础设施。轻量、只读系统状态，产物一律写 `.scratch/`。本目录是仓库纪律的显式例外：loop 的判定口径要求工具随 Git 版本化，避免各轮 session 各自重建导致口径漂移。

## preflight-probe.mjs — 安静窗口判定

```bash
node tools/perf/preflight-probe.mjs            # 安静 exit 0，吵闹 exit 1，JSON 报告
```

三项检查（阈值可用 flag 覆盖）：重负载开发进程持续 CPU（Unity/dotnet 等 >10%）、loadavg1 超核数 0.7 倍、磁盘写入探针低于 150 MB/s（SSD 长尾/回写节流）。测量前必须通过；不通过按 loop spec 退避重试。

## run-cold-build.mjs — 冷构建 harness

```bash
node tools/perf/run-cold-build.mjs --label r1-screen --dist gitnexus/dist \
    --target /path/to/neonnew --mode full
```

空索引 + 隔离 HOME 跑一次完整 analyze，输出目录（默认 `.scratch/perf-loop/<label>`）必须不存在，拒绝覆盖。内含 io-guard（code 模式下资源读取直接抛错）、磁盘余量守卫、30 分钟超时。退出时自动提取区段写入 `segments.json`。

## extract-segments.mjs — 区段提取

```bash
node tools/perf/extract-segments.mjs .scratch/perf-loop/r1-screen/output-events.ndjson
```

按 `docs/wayfinder/neonspark-index-performance/acceptance-noise.md` 的八区段标记表，从事件流计算各区段秒数与总和。标记缺失时 exit 2 并列出缺失项——样本作废，不得用于判定。

## 判定口径提醒

- 验收对象：≥3 次安静窗口冷构建的**区段中位数之和**，目标见 loop spec（当前 240s）。端到端 wall 仅作参考。
- 每次运行必须 exit 0 且输入 receipt 一致，否则样本作废。
