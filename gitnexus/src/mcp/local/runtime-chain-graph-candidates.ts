interface QueryExecutor {
  (query: string, params?: Record<string, unknown>): Promise<any[]>;
}

interface GraphCandidateInput {
  executeParameterized: QueryExecutor;
  symbolName?: string;
  symbolFilePath?: string;
  maxSymbols?: number;
  maxEdgesPerSymbol?: number;
}

export interface RuntimeGraphCandidate {
  sourceId?: string;
  sourceName: string;
  sourceFilePath?: string;
  sourceStartLine?: number;
  targetId?: string;
  targetName: string;
  targetFilePath?: string;
  targetStartLine?: number;
  reason?: string;
}

interface AnchorSymbolRow {
  id: string;
  name: string;
  filePath?: string;
  startLine?: number;
}

function normalizeName(value: unknown): string {
  return String(value || '').trim();
}

function dedupeCandidates(candidates: RuntimeGraphCandidate[]): RuntimeGraphCandidate[] {
  const out: RuntimeGraphCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const source =
      normalizeName(candidate.sourceId) ||
      `${normalizeName(candidate.sourceName)}@${normalizeName(candidate.sourceFilePath)}`;
    const target =
      normalizeName(candidate.targetId) ||
      `${normalizeName(candidate.targetName)}@${normalizeName(candidate.targetFilePath)}`;
    const key = `${source}->${target}`;
    if (!source || !target || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

async function resolveAnchorSymbols(input: GraphCandidateInput): Promise<AnchorSymbolRow[]> {
  const symbolName = normalizeName(input.symbolName);
  if (!symbolName) return [];

  const maxSymbols = Math.max(1, Number(input.maxSymbols || 8));
  const symbolFilePath = normalizeName(input.symbolFilePath);
  if (symbolFilePath) {
    const byFile = await input.executeParameterized(
      `
      MATCH (n)
      WHERE n.filePath = $filePath AND n.name = $symbolName
      RETURN n.id AS id, n.name AS name, n.filePath AS filePath, n.startLine AS startLine
      ORDER BY id
    LIMIT ${maxSymbols}
    `,
      { filePath: symbolFilePath, symbolName },
    );
    if (Array.isArray(byFile) && byFile.length > 0) {
      return byFile
        .map((row) => ({
          id: normalizeName(row.id),
          name: normalizeName(row.name),
          filePath: normalizeName(row.filePath) || undefined,
          startLine: Number(row.startLine || 1),
        }))
        .filter((row) => row.id && row.name);
    }
  }

  const byName = await input.executeParameterized(
    `
    MATCH (n)
    WHERE n.name IN $symbolNames
    RETURN n.id AS id, n.name AS name, n.filePath AS filePath, n.startLine AS startLine
    ORDER BY id
    LIMIT ${maxSymbols}
  `,
    { symbolNames: [symbolName] },
  );

  return (Array.isArray(byName) ? byName : [])
    .map((row) => ({
      id: normalizeName(row.id),
      name: normalizeName(row.name),
      filePath: normalizeName(row.filePath) || undefined,
      startLine: Number(row.startLine || 1),
    }))
    .filter((row) => row.id && row.name);
}

function toCandidate(row: any): RuntimeGraphCandidate | undefined {
  const sourceName = normalizeName(row.sourceName);
  const targetName = normalizeName(row.targetName);
  if (!sourceName || !targetName) return undefined;
  return {
    sourceId: normalizeName(row.sourceId) || undefined,
    sourceName,
    sourceFilePath: normalizeName(row.sourceFilePath) || undefined,
    sourceStartLine: Number(row.sourceStartLine || 1),
    targetId: normalizeName(row.targetId) || undefined,
    targetName,
    targetFilePath: normalizeName(row.targetFilePath) || undefined,
    targetStartLine: Number(row.targetStartLine || 1),
    reason: normalizeName(row.reason) || undefined,
  };
}

export async function extractRuntimeGraphCandidates(
  input: GraphCandidateInput,
): Promise<RuntimeGraphCandidate[]> {
  const anchors = await resolveAnchorSymbols(input);
  if (anchors.length === 0) return [];

  const maxEdgesPerSymbol = Math.max(1, Number(input.maxEdgesPerSymbol || 16));
  const rawCandidates: RuntimeGraphCandidate[] = [];
  for (const symbol of anchors) {
    const directRows = await input.executeParameterized(
      `
      MATCH (s {id: $symbolId})-[r:CodeRelation {type: 'CALLS'}]->(t)
      RETURN s.id AS sourceId, s.name AS sourceName, s.filePath AS sourceFilePath, s.startLine AS sourceStartLine,
             t.id AS targetId, t.name AS targetName, t.filePath AS targetFilePath, t.startLine AS targetStartLine,
             r.reason AS reason
      ORDER BY sourceId, targetId, reason
      LIMIT ${maxEdgesPerSymbol}
    `,
      { symbolId: symbol.id },
    );
    for (const row of Array.isArray(directRows) ? directRows : []) {
      const candidate = toCandidate(row);
      if (candidate) rawCandidates.push(candidate);
    }

    const methodRows = await input.executeParameterized(
      `
      MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)
      MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)
      RETURN m.id AS sourceId, m.name AS sourceName, m.filePath AS sourceFilePath, m.startLine AS sourceStartLine,
             t.id AS targetId, t.name AS targetName, t.filePath AS targetFilePath, t.startLine AS targetStartLine,
             r.reason AS reason
      ORDER BY sourceId, targetId, reason
      LIMIT ${maxEdgesPerSymbol}
    `,
      { symbolId: symbol.id },
    );
    for (const row of Array.isArray(methodRows) ? methodRows : []) {
      const candidate = toCandidate(row);
      if (candidate) rawCandidates.push(candidate);
    }

    const incomingClassRows = await input.executeParameterized(
      `
      MATCH (caller)-[r:CodeRelation {type: 'CALLS'}]->(s {id: $symbolId})
      RETURN caller.id AS sourceId, caller.name AS sourceName, caller.filePath AS sourceFilePath, caller.startLine AS sourceStartLine,
             s.id AS targetId, s.name AS targetName, s.filePath AS targetFilePath, s.startLine AS targetStartLine,
             r.reason AS reason
      ORDER BY sourceId, targetId, reason
      LIMIT ${maxEdgesPerSymbol}
    `,
      { symbolId: symbol.id },
    );
    for (const row of Array.isArray(incomingClassRows) ? incomingClassRows : []) {
      const candidate = toCandidate(row);
      if (candidate) rawCandidates.push(candidate);
    }

    const incomingMethodRows = await input.executeParameterized(
      `
      MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)
      MATCH (caller)-[r:CodeRelation {type: 'CALLS'}]->(m)
      RETURN caller.id AS sourceId, caller.name AS sourceName, caller.filePath AS sourceFilePath, caller.startLine AS sourceStartLine,
             m.id AS targetId, m.name AS targetName, m.filePath AS targetFilePath, m.startLine AS targetStartLine,
             r.reason AS reason
      ORDER BY sourceId, targetId, reason
      LIMIT ${maxEdgesPerSymbol}
    `,
      { symbolId: symbol.id },
    );
    for (const row of Array.isArray(incomingMethodRows) ? incomingMethodRows : []) {
      const candidate = toCandidate(row);
      if (candidate) rawCandidates.push(candidate);
    }
  }

  return dedupeCandidates(rawCandidates);
}
