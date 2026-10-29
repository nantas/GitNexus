#!/usr/bin/env node
// Quiet-window preflight probe for perf-loop measurement.
// Verdict: quiet (exit 0) or noisy (exit 1). JSON report on stdout.
//
// Checks (macOS):
//   1. heavy dev processes (Unity/dotnet/VBCSCompiler/csc) sustained CPU > threshold
//   2. loadavg1 > loadFactor * core count
//   3. disk write+read probe below throughput floor (SSD long-tail / writeback throttle)
//
// Usage: node tools/perf/preflight-probe.mjs [--cpu-threshold 10] [--load-factor 0.7]
//          [--min-write-mbps 150] [--sample-ms 3000] [--skip-disk]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const CPU_THRESHOLD = arg('--cpu-threshold', 10);
const LOAD_FACTOR = arg('--load-factor', 0.7);
const MIN_WRITE_MBPS = arg('--min-write-mbps', 150);
const SAMPLE_MS = arg('--sample-ms', 3000);
const SKIP_DISK = process.argv.includes('--skip-disk');

const HEAVY = /^(Unity|UnityHelper|dotnet|VBCSCompiler|csc|msbuild)/i;

const readTimes = () => {
  const map = new Map();
  const out = execFileSync('/bin/ps', ['-Ao', 'pid=,comm=,cputime='], { encoding: 'utf8' });
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(\d+):([\d.]+)$/);
    if (!m) continue;
    map.set(Number(m[1]), { comm: path.basename(m[2]), cpuSec: Number(m[3]) * 60 + Number(m[4]) });
  }
  return map;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const checkProcesses = async () => {
  const before = readTimes();
  await sleep(SAMPLE_MS);
  const after = readTimes();
  const offenders = [];
  for (const [pid, now] of after) {
    const prev = before.get(pid);
    if (!prev || !HEAVY.test(now.comm)) continue;
    const pct = ((now.cpuSec - prev.cpuSec) / (SAMPLE_MS / 1000)) * 100;
    if (pct > CPU_THRESHOLD) offenders.push({ pid, comm: now.comm, cpuPct: Math.round(pct * 10) / 10 });
  }
  return { ok: offenders.length === 0, offenders };
};

const checkLoad = () => {
  const cores = os.cpus().length;
  const load1 = os.loadavg()[0];
  return { ok: load1 <= LOAD_FACTOR * cores, load1: Math.round(load1 * 100) / 100, cores, limit: LOAD_FACTOR * cores };
};

const checkDisk = () => {
  if (SKIP_DISK) return { ok: true, skipped: true };
  const file = path.join(os.tmpdir(), `preflight-probe-${process.pid}.bin`);
  const buf = Buffer.alloc(64 * 1024 * 1024, 1);
  try {
    const w0 = performance.now();
    const fd = fs.openSync(file, 'w');
    fs.writeSync(fd, buf);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    const writeMbps = (64 / ((performance.now() - w0) / 1000));
    return { ok: writeMbps >= MIN_WRITE_MBPS, writeMbps: Math.round(writeMbps) };
  } finally {
    try { fs.unlinkSync(file); } catch {}
  }
};

const checks = {
  processes: await checkProcesses(),
  load: checkLoad(),
  disk: checkDisk(),
};
const reasons = [];
if (!checks.processes.ok) reasons.push(`heavy dev process CPU: ${checks.processes.offenders.map((o) => `${o.comm} ${o.cpuPct}%`).join(', ')}`);
if (!checks.load.ok) reasons.push(`loadavg1 ${checks.load.load1} > ${checks.load.limit}`);
if (!checks.disk.ok) reasons.push(`disk write ${checks.disk.writeMbps} MB/s < ${MIN_WRITE_MBPS} MB/s`);
const quiet = reasons.length === 0;
console.log(JSON.stringify({ quiet, reasons, checks, node: process.version, at: new Date().toISOString() }, null, 2));
process.exit(quiet ? 0 : 1);
