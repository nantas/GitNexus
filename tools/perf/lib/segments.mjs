// Stage-anchored segment extraction for cold-build analyze runs.
// Marker table mirrors docs/wayfinder/neonspark-index-performance/acceptance-noise.md.
// Input: output-events.ndjson lines of {time, channel, text} written by run-cold-build.mjs.

const MARKERS = [
  { key: 'startup_snapshot', label: '启动+输入快照', from: 'start', to: 'phaseBegin:scan' },
  { key: 'scan', label: 'scan', from: 'phaseBegin:scan', to: 'phaseEnd:scan' },
  { key: 'parse', label: 'parse', from: 'phaseEnd:scan', to: 'phaseEnd:parse' },
  { key: 'scope_resolution', label: 'scopeResolution', from: 'phaseEnd:parse', to: 'phaseEnd:scopeResolution' },
  { key: 'unity_resources', label: 'unity-resources', from: 'phaseEnd:scopeResolution', to: 'phaseEnd:unity-resources' },
  { key: 'misc_phases', label: '其余小阶段', from: 'phaseEnd:unity-resources', to: 'lastPhaseEnd' },
  { key: 'csv_db_import', label: 'CSV+DB 导入', from: 'lastPhaseEnd', to: 'ftsFile' },
  { key: 'fts_publish_exit', label: 'FTS+发布+退出', from: 'ftsFile', to: 'end' },
];

export function extractSegments(eventsText) {
  const events = eventsText.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  if (events.length === 0) throw new Error('no events');
  const points = { start: events[0].time, end: events[events.length - 1].time };
  const missing = [];
  const find = (re) => {
    const hit = events.find((e) => typeof e.text === 'string' && re.test(e.text));
    return hit ? hit.time : undefined;
  };
  for (const phase of ['scan', 'parse', 'scopeResolution', 'unity-resources']) {
    points[`phaseEnd:${phase}`] = find(new RegExp(`✓ Phase: ${phase}\\b`));
  }
  points['phaseBegin:scan'] = find(/▶ Phase: scan\b/);
  let lastPhaseEnd;
  for (const e of events) {
    if (typeof e.text === 'string' && /✓ Phase: /.test(e.text)) lastPhaseEnd = e.time;
  }
  points.lastPhaseEnd = lastPhaseEnd;
  points.ftsFile = find(/FTS: creating File/);
  for (const name of ['phaseBegin:scan', 'phaseEnd:scan', 'phaseEnd:parse', 'phaseEnd:scopeResolution', 'phaseEnd:unity-resources', 'lastPhaseEnd', 'ftsFile']) {
    if (points[name] === undefined) missing.push(name);
  }
  const segments = MARKERS.map((m) => {
    const from = points[m.from];
    const to = points[m.to];
    const seconds = from !== undefined && to !== undefined ? (to - from) / 1000 : null;
    return { key: m.key, label: m.label, seconds };
  });
  const sumSeconds = segments.every((s) => s.seconds !== null)
    ? segments.reduce((acc, s) => acc + s.seconds, 0)
    : null;
  return { segments, sumSeconds, missing, startIso: new Date(points.start).toISOString(), endIso: new Date(points.end).toISOString() };
}
