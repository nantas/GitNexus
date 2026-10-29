#!/usr/bin/env node
// Usage: node tools/perf/extract-segments.mjs <output-events.ndjson> [--out segments.json]
// Extracts stage-anchored segment timings from a cold-build event stream.
// Exit 0 when all markers resolved, exit 2 when markers are missing (result still printed).
import fs from 'node:fs';
import { extractSegments } from './lib/segments.mjs';

const [eventsPath, ...rest] = process.argv.slice(2);
if (!eventsPath) {
  console.error('usage: extract-segments.mjs <output-events.ndjson> [--out segments.json]');
  process.exit(64);
}
const outIdx = rest.indexOf('--out');
const outPath = outIdx >= 0 ? rest[outIdx + 1] : null;
const result = extractSegments(fs.readFileSync(eventsPath, 'utf8'));
const json = JSON.stringify(result, null, 2);
if (outPath) fs.writeFileSync(outPath, json + '\n');
console.log(json);
if (result.missing.length > 0) {
  console.error(`missing markers: ${result.missing.join(', ')}`);
  process.exit(2);
}
