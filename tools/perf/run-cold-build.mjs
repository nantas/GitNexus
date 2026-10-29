#!/usr/bin/env node
// Cold-build measurement harness for the perf loop.
// Runs a fresh full analyze (empty index + isolated HOME) against a target repo,
// captures an event stream, and extracts stage-anchored segments on exit.
//
// Usage:
//   node tools/perf/run-cold-build.mjs --label <name> --dist <path-to-dist> --target <repo> \
//       [--mode code|full] [--out <dir>] [--target-ms 240000]
//
// Output dir (default .scratch/perf-loop/<label>) must not exist — every run is a
// fresh measurement. Artifacts: invocation.json, analyze.log, output-events.ndjson,
// result.json, segments.json, io-*.json, metadata-before/after.json.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { extractSegments } from './lib/segments.mjs';

const opt = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const label = opt('--label');
const distRaw = opt('--dist');
const target = opt('--target');
const mode = opt('--mode', 'full');
const targetMs = Number(opt('--target-ms', '240000'));
if (!label || !distRaw || !target) {
  console.error('required: --label <name> --dist <path> --target <repo>');
  process.exit(64);
}
if (!['code', 'full'].includes(mode)) throw new Error('--mode must be code or full');
if (process.env.BENCH_CPU_PROFILE) throw new Error('Sampling prohibited for repeated comparison');

const dist = path.resolve(distRaw);
const output = path.resolve(opt('--out', path.join('.scratch/perf-loop', label)));
if (fs.existsSync(output)) throw new Error(`Fresh measurement directory required: ${output}`);
fs.mkdirSync(path.join(output, 'index'), { recursive: true });
fs.mkdirSync(path.join(output, 'home'), { recursive: true });

const toolDir = path.dirname(new URL(import.meta.url).pathname);
const storage = path.join(output, 'index');
const isolatedHome = path.join(output, 'home');
const sha256 = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const started = Date.now();

const metadata = path.join(storage, 'gitnexus.json');
if (fs.existsSync(metadata)) fs.copyFileSync(metadata, path.join(output, 'metadata-before.json'));

const args = ['-l', process.execPath,
  '--require=' + path.join(toolDir, 'io-guard.cjs'),
  '--max-old-space-size=18432', '--max-semi-space-size=128', '--stack-size=4096',
  path.join(dist, 'cli/index.js'), 'analyze', '--force', '--index-only', '--verbose',
  '--name', 'perf-loop', '--scope', 'Assets/,Packages/',
  '--extensions', mode === 'code' ? '.cs' : '.cs,.meta',
  '--csharp-define-csproj', 'Assembly-CSharp.csproj'];

fs.writeFileSync(path.join(output, 'invocation.json'), JSON.stringify({
  label, mode, dist, target, args, targetMs,
  resolverSha256: sha256(path.join(dist, 'core/unity/resolver.js')),
  snapshotSha256: sha256(path.join(dist, 'core/unity/analysis-input-snapshot.js')),
  runAnalyzeSha256: sha256(path.join(dist, 'core/run-analyze.js')),
  csvSha256: sha256(path.join(dist, 'core/lbug/csv-generator.js')),
  uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE ?? 'default',
  started: new Date(started).toISOString(), node: process.version,
  head: execFileSync('git', ['-C', target, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
}, null, 2));

const env = {
  ...process.env,
  BENCH_RECEIPT_PATH: path.join(output, 'input-hashes.json'),
  BENCH_CODE_ONLY: mode === 'code' ? '1' : '0',
  BENCH_IO_REPORT: path.join(output, 'io'),
  GITNEXUS_IO_GUARD_ROOT: path.resolve(target),
  NODE_ENV: 'development',
  VALIDATE_SEMANTIC_MODEL: '0',
  PROF_LBUG_LOAD: '0',
  PROF_SCOPE_RESOLUTION: '0',
  GITNEXUS_STORAGE_PATH: storage,
  GITNEXUS_HOME: isolatedHome,
};

const fd = fs.openSync(path.join(output, 'analyze.log'), 'w');
const eventsPath = path.join(output, 'output-events.ndjson');
const child = spawn('/usr/bin/time', args, { cwd: target, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
console.log(JSON.stringify({ label, pid: child.pid, output }));
for (const [channel, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
  stream.on('data', (chunk) => {
    fs.writeSync(fd, chunk);
    fs.appendFileSync(eventsPath, JSON.stringify({ time: Date.now(), channel, text: chunk.toString() }) + '\n');
  });
}

let diskStopped = false;
const sample = () => {
  try {
    const available = Number(execFileSync('/bin/df', ['-k', '/'], { encoding: 'utf8' }).trim().split('\n').at(-1).trim().split(/\s+/)[3]) * 1024;
    if (available < 2 * 1024 ** 3 && !diskStopped) {
      diskStopped = true;
      console.log('Disk guard: below 2 GiB; requesting SIGINT');
      process.kill(-child.pid, 'SIGINT');
    }
    fs.appendFileSync(path.join(output, 'pressure.log'), new Date().toISOString() + '\n'
      + execFileSync('/usr/sbin/sysctl', ['vm.swapusage'], { encoding: 'utf8' })
      + execFileSync('/usr/bin/vm_stat', [], { encoding: 'utf8' }));
  } catch {}
};
sample();
const timer = setInterval(sample, 30000);
const deadline = setTimeout(() => { console.log('30-minute limit; requesting SIGINT'); process.kill(-child.pid, 'SIGINT'); }, 1800000);

child.on('close', (code, signal) => {
  clearInterval(timer);
  clearTimeout(deadline);
  sample();
  fs.closeSync(fd);
  if (fs.existsSync(metadata)) fs.copyFileSync(metadata, path.join(output, 'metadata-after.json'));
  let segments = null;
  try {
    segments = extractSegments(fs.readFileSync(eventsPath, 'utf8'));
    fs.writeFileSync(path.join(output, 'segments.json'), JSON.stringify(segments, null, 2) + '\n');
  } catch (e) {
    console.error(`segment extraction failed: ${e.message}`);
  }
  const result = {
    code, signal, diskStopped,
    elapsedMs: Date.now() - started,
    segmentSumSeconds: segments?.sumSeconds ?? null,
    missingMarkers: segments?.missing ?? [],
    targetMs,
    meetsTarget: code === 0 && segments?.sumSeconds != null && segments.sumSeconds * 1000 <= targetMs,
    ended: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  process.exitCode = code ?? 1;
});
