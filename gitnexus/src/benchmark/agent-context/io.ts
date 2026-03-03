import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentContextDataset, AgentContextScenario, AgentContextThresholds } from './types.js';

export async function loadAgentContextDataset(root: string): Promise<AgentContextDataset> {
  const thresholds = JSON.parse(
    await fs.readFile(path.join(root, 'thresholds.json'), 'utf-8'),
  ) as AgentContextThresholds;

  const scenarios = await readJsonl<AgentContextScenario>(
    path.join(root, 'scenarios.jsonl'),
    ['scenario_id', 'target_uid', 'tool_plan', 'checks'],
  );

  return { thresholds, scenarios };
}

async function readJsonl<T>(file: string, required: string[]): Promise<T[]> {
  const raw = await fs.readFile(file, 'utf-8');
  const rows = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  for (const row of rows) {
    for (const key of required) {
      if (!(key in row)) {
        throw new Error(`missing required field: ${key}`);
      }
    }
  }

  return rows as T[];
}
