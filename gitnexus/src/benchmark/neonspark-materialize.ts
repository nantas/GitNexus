import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface BuildSymbolRowsOptions {
  minSelected?: number;
  maxSelected?: number;
}

export function buildSymbolRows(candidates: any[], selectedUids: string[], options: BuildSymbolRowsOptions = {}) {
  const minSelected = options.minSelected ?? 20;
  const maxSelected = options.maxSelected ?? 20;

  for (const [key, value] of [['minSelected', minSelected], ['maxSelected', maxSelected]] as const) {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a finite non-negative integer, got ${value}`);
    }
  }

  if (minSelected > maxSelected) {
    throw new Error(`invalid selected symbol range: minSelected (${minSelected}) exceeds maxSelected (${maxSelected})`);
  }

  if (selectedUids.length < minSelected || selectedUids.length > maxSelected) {
    if (minSelected === 20 && maxSelected === 20) {
      throw new Error(`selected symbol count must be exactly 20, got ${selectedUids.length}`);
    }
    throw new Error(`selected symbol count must be between ${minSelected} and ${maxSelected}, got ${selectedUids.length}`);
  }

  const byUid = new Map(candidates.map((c) => [String(c.symbol_uid), c]));
  return selectedUids.map((uid) => {
    const row = byUid.get(uid);
    if (!row) throw new Error(`selected uid not found in candidates: ${uid}`);
    return {
      symbol_uid: String(row.symbol_uid),
      file_path: String(row.file_path),
      symbol_name: String(row.symbol_name),
      symbol_type: String(row.symbol_type),
      start_line: Number(row.start_line || 0),
      end_line: Number(row.end_line || 0),
    };
  });
}

export interface MaterializeCliArgs extends Required<BuildSymbolRowsOptions> {
  candidatesFile: string;
  selectedFile: string;
  outFile: string;
}

function parseNonNegativeInteger(value: string, flagName: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${flagName} must be a finite non-negative integer, got ${value}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a finite non-negative integer, got ${value}`);
  }
  return parsed;
}

export function parseMaterializeCliArgs(argv: string[]): MaterializeCliArgs {
  const positional: string[] = [];
  let minSelected = 20;
  let maxSelected = 20;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--min-selected' || arg === '--max-selected') {
      const value = argv[i + 1];
      if (value == null) {
        throw new Error(`${arg} requires a value`);
      }
      const parsed = parseNonNegativeInteger(value, arg);
      if (arg === '--min-selected') minSelected = parsed;
      if (arg === '--max-selected') maxSelected = parsed;
      i += 1;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`unknown option: ${arg}`);
    }

    positional.push(arg);
  }

  if (positional.length !== 3) {
    throw new Error(
      'usage: node dist/benchmark/neonspark-materialize.js <candidatesFile> <selectedFile> <outFile> [--min-selected N] [--max-selected N]',
    );
  }

  if (minSelected > maxSelected) {
    throw new Error(`invalid selected symbol range: minSelected (${minSelected}) exceeds maxSelected (${maxSelected})`);
  }

  const [candidatesFile, selectedFile, outFile] = positional;
  return { candidatesFile, selectedFile, outFile, minSelected, maxSelected };
}

function parseJsonlRows(raw: string): any[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseSelectedUids(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function mainMaterializeCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { candidatesFile, selectedFile, outFile, minSelected, maxSelected } = parseMaterializeCliArgs(argv);

  const candidatesRaw = await fs.readFile(candidatesFile, 'utf-8');
  const selectedRaw = await fs.readFile(selectedFile, 'utf-8');
  const rows = buildSymbolRows(parseJsonlRows(candidatesRaw), parseSelectedUids(selectedRaw), { minSelected, maxSelected });

  const jsonl = rows.length > 0 ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` : '';
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, jsonl, 'utf-8');
  return rows.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mainMaterializeCli()
    .then((written) => {
      console.log(`wrote ${written} symbol rows`);
    })
    .catch((error: any) => {
      console.error(String(error?.message || error));
      process.exitCode = 1;
    });
}
