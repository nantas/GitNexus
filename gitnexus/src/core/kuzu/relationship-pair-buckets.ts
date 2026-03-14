import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import path from 'path';

const REL_ENDPOINTS_PATTERN = /"([^"]*)","([^"]*)"/;

export interface RelationshipPairBucket {
  csvPath: string;
  rowCount: number;
}

export interface RelationshipPairBucketResult {
  relHeader: string;
  buckets: Map<string, RelationshipPairBucket>;
  skippedRels: number;
  totalValidRels: number;
}

const parseRelationshipEndpoints = (line: string): { fromId: string; toId: string } | null => {
  const match = line.match(REL_ENDPOINTS_PATTERN);
  if (!match) return null;
  return { fromId: match[1], toId: match[2] };
};

export async function bucketRelationshipLines(lines: string[], getNodeLabel: (id: string) => string) {
  const buckets = new Map<string, string[]>();
  for (const line of lines) {
    const endpoints = parseRelationshipEndpoints(line);
    if (!endpoints) continue;
    const key = `${getNodeLabel(endpoints.fromId)}|${getNodeLabel(endpoints.toId)}`;
    const rows = buckets.get(key) || [];
    rows.push(line);
    buckets.set(key, rows);
  }
  return buckets;
}

export async function streamRelationshipPairBucketsFromCsv(params: {
  relCsvPath: string;
  csvDir: string;
  validTables: Set<string>;
  getNodeLabel: (nodeId: string) => string;
}): Promise<RelationshipPairBucketResult> {
  const { relCsvPath, csvDir, validTables, getNodeLabel } = params;
  let relHeader = '';
  const buckets = new Map<string, RelationshipPairBucket>();
  let skippedRels = 0;
  let totalValidRels = 0;
  let isFirst = true;
  let queue = Promise.resolve();

  await new Promise<void>((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(relCsvPath, 'utf-8'), crlfDelay: Infinity });
    rl.on('line', (line) => {
      queue = queue.then(async () => {
        if (isFirst) {
          relHeader = line;
          isFirst = false;
          return;
        }
        if (!line.trim()) return;

        const endpoints = parseRelationshipEndpoints(line);
        if (!endpoints) {
          skippedRels++;
          return;
        }

        const fromLabel = getNodeLabel(endpoints.fromId);
        const toLabel = getNodeLabel(endpoints.toId);
        if (!validTables.has(fromLabel) || !validTables.has(toLabel)) {
          skippedRels++;
          return;
        }

        const pairKey = `${fromLabel}|${toLabel}`;
        let bucket = buckets.get(pairKey);
        if (!bucket) {
          bucket = {
            csvPath: path.join(csvDir, `rel_${fromLabel}_${toLabel}.csv`),
            rowCount: 0,
          };
          buckets.set(pairKey, bucket);
          await fs.writeFile(bucket.csvPath, `${relHeader}\n`, 'utf-8');
        }

        await fs.appendFile(bucket.csvPath, `${line}\n`, 'utf-8');
        bucket.rowCount++;
        totalValidRels++;
      }).catch((error) => {
        rl.close();
        reject(error);
      });
    });

    rl.on('close', () => {
      queue.then(() => resolve()).catch(reject);
    });
    rl.on('error', reject);
  });

  return { relHeader, buckets, skippedRels, totalValidRels };
}
