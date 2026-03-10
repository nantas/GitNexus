import fs from 'node:fs/promises';
import path from 'node:path';

export interface AnalyzeSummary {
  totalSec: number;
  kuzuSec: number;
  ftsSec: number;
  nodes?: number;
  edges?: number;
}

export interface EstimateVerdict {
  actualSec: number;
  lower: number;
  upper: number;
  inRange: boolean;
  status: 'below-range' | 'in-range' | 'above-range';
  deltaSec: number;
}

interface EstimateRange {
  lower: number;
  upper: number;
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function candidatePaths(inputPath: string): string[] {
  if (path.isAbsolute(inputPath)) {
    return [inputPath];
  }
  return [
    path.resolve(process.cwd(), inputPath),
    path.resolve(process.cwd(), 'src/benchmark/u2-e2e', inputPath),
    path.resolve(process.cwd(), 'gitnexus/src/benchmark/u2-e2e', inputPath),
    path.resolve(process.cwd(), '..', inputPath),
  ];
}

export async function parseAnalyzeSummary(logPath: string): Promise<AnalyzeSummary> {
  let raw = '';
  const tried: string[] = [];
  for (const candidate of candidatePaths(logPath)) {
    tried.push(candidate);
    try {
      raw = await fs.readFile(candidate, 'utf-8');
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  if (!raw) {
    throw new Error(`Analyze log not found: ${logPath}. Tried: ${tried.join(', ')}`);
  }

  const totalMatch = raw.match(/Repository indexed successfully \(([\d.]+)s\)/i);
  const kuzuFtsMatch = raw.match(/KuzuDB\s+([\d.]+)s\s*\|\s*FTS\s+([\d.]+)s/i);
  const realMatch = raw.match(/^real\s+([\d.]+)$/m);
  const nodesMatch = raw.match(/\bnodes?\D+(\d+)/i);
  const edgesMatch = raw.match(/\bedges?\D+(\d+)/i);

  const totalSec = parseNumber(totalMatch?.[1]) || parseNumber(realMatch?.[1]);
  const kuzuSec = parseNumber(kuzuFtsMatch?.[1]);
  const ftsSec = parseNumber(kuzuFtsMatch?.[2]);

  if (!totalSec) {
    throw new Error(`Failed to parse total duration from analyze log: ${logPath}`);
  }

  return {
    totalSec: round1(totalSec),
    kuzuSec: round1(kuzuSec),
    ftsSec: round1(ftsSec),
    nodes: nodesMatch ? parseNumber(nodesMatch[1]) : undefined,
    edges: edgesMatch ? parseNumber(edgesMatch[1]) : undefined,
  };
}

export function compareEstimate(actualSec: number, range: EstimateRange): EstimateVerdict {
  if (actualSec < range.lower) {
    return {
      actualSec: round1(actualSec),
      lower: range.lower,
      upper: range.upper,
      inRange: false,
      status: 'below-range',
      deltaSec: round1(actualSec - range.lower),
    };
  }

  if (actualSec > range.upper) {
    return {
      actualSec: round1(actualSec),
      lower: range.lower,
      upper: range.upper,
      inRange: false,
      status: 'above-range',
      deltaSec: round1(actualSec - range.upper),
    };
  }

  return {
    actualSec: round1(actualSec),
    lower: range.lower,
    upper: range.upper,
    inRange: true,
    status: 'in-range',
    deltaSec: 0,
  };
}
