import type { AgentContextCheck, AgentContextCheckResult } from './types.js';

type StepOutput = Record<string, any>;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function pushUid(into: Set<string>, uid: unknown) {
  if (typeof uid === 'string' && uid.trim()) {
    into.add(uid.trim());
  }
}

function collectUids(stepOutputs: StepOutput[]): string[] {
  const hits = new Set<string>();

  for (const output of stepOutputs) {
    pushUid(hits, output?.symbol?.uid);
    pushUid(hits, output?.target?.id);

    for (const row of output?.process_symbols || []) {
      pushUid(hits, row?.id);
    }
    for (const row of output?.definitions || []) {
      pushUid(hits, row?.id);
    }
    for (const row of output?.candidates || []) {
      pushUid(hits, row?.uid);
    }

    for (const list of Object.values(output?.byDepth || {})) {
      if (!Array.isArray(list)) {
        continue;
      }
      for (const row of list) {
        pushUid(hits, (row as any)?.id);
      }
    }
  }

  return [...hits];
}

function countIncoming(stepOutputs: StepOutput[]): number {
  let count = 0;
  for (const output of stepOutputs) {
    for (const rows of Object.values(output?.incoming || {})) {
      if (Array.isArray(rows)) {
        count += rows.length;
      }
    }
  }
  return count;
}

function countOutgoing(stepOutputs: StepOutput[]): number {
  let count = 0;
  for (const output of stepOutputs) {
    for (const rows of Object.values(output?.outgoing || {})) {
      if (Array.isArray(rows)) {
        count += rows.length;
      }
    }
  }
  return count;
}

function countImpacted(stepOutputs: StepOutput[]): number {
  let total = 0;
  for (const output of stepOutputs) {
    total += Number(output?.impactedCount || 0);
  }
  return total;
}

function collectNames(stepOutputs: StepOutput[]): string[] {
  const names = new Set<string>();
  const addName = (name: unknown) => {
    if (typeof name === 'string' && name.trim()) {
      names.add(name.trim());
    }
  };

  for (const output of stepOutputs) {
    addName(output?.symbol?.name);
    addName(output?.target?.name);

    for (const row of output?.process_symbols || []) {
      addName(row?.name);
    }
    for (const row of output?.definitions || []) {
      addName(row?.name);
    }
    for (const row of output?.candidates || []) {
      addName(row?.name);
    }
  }

  return [...names];
}

export function evaluateCheckT(stepOutputs: StepOutput[], expectedUid: string): AgentContextCheckResult {
  const expected = normalize(expectedUid);
  const pass = collectUids(stepOutputs).some((uid) => {
    const n = normalize(uid);
    return n === expected || n.endsWith(expected) || expected.endsWith(n);
  });

  return {
    id: 'T',
    pass,
    detail: pass ? undefined : `target uid not found: ${expectedUid}`,
  };
}

export function evaluateCheckE(toolCalls: number, maxToolCalls: number): AgentContextCheckResult {
  const pass = toolCalls <= maxToolCalls;
  return {
    id: 'E',
    pass,
    detail: pass ? undefined : `tool calls ${toolCalls} exceed max ${maxToolCalls}`,
  };
}

function evaluateCheckU(stepOutputs: StepOutput[], minIncoming: number): AgentContextCheckResult {
  const incoming = countIncoming(stepOutputs);
  return {
    id: 'U',
    pass: incoming >= minIncoming,
    detail: incoming >= minIncoming ? undefined : `incoming refs ${incoming} < ${minIncoming}`,
  };
}

function evaluateCheckD(stepOutputs: StepOutput[], minOutgoing: number): AgentContextCheckResult {
  const outgoing = countOutgoing(stepOutputs);
  return {
    id: 'D',
    pass: outgoing >= minOutgoing,
    detail: outgoing >= minOutgoing ? undefined : `outgoing refs ${outgoing} < ${minOutgoing}`,
  };
}

function evaluateCheckB(stepOutputs: StepOutput[], minImpacted: number): AgentContextCheckResult {
  const impacted = countImpacted(stepOutputs);
  return {
    id: 'B',
    pass: impacted >= minImpacted,
    detail: impacted >= minImpacted ? undefined : `impacted count ${impacted} < ${minImpacted}`,
  };
}

function evaluateCheckI(
  stepOutputs: StepOutput[],
  anchors: string[],
  minInternalHits: number,
): AgentContextCheckResult {
  const loweredAnchors = anchors.map((anchor) => normalize(anchor));
  const names = collectNames(stepOutputs).map((name) => normalize(name));

  const matched = new Set<string>();
  for (const anchor of loweredAnchors) {
    if (names.some((name) => name.includes(anchor))) {
      matched.add(anchor);
    }
  }

  return {
    id: 'I',
    pass: matched.size >= minInternalHits,
    detail: matched.size >= minInternalHits ? undefined : `internal anchors matched ${matched.size} < ${minInternalHits}`,
  };
}

export function evaluateScenarioChecks(
  stepOutputs: StepOutput[],
  checks: AgentContextCheck[],
  options?: { targetUid?: string; toolCalls?: number },
): AgentContextCheckResult[] {
  const results: AgentContextCheckResult[] = [];

  for (const check of checks) {
    switch (check.id) {
      case 'T':
        results.push(evaluateCheckT(stepOutputs, check.required_uid || options?.targetUid || ''));
        break;
      case 'U':
        results.push(evaluateCheckU(stepOutputs, check.min_incoming ?? 0));
        break;
      case 'D':
        results.push(evaluateCheckD(stepOutputs, check.min_outgoing ?? 0));
        break;
      case 'B':
        results.push(evaluateCheckB(stepOutputs, check.min_impacted ?? 0));
        break;
      case 'I':
        results.push(
          evaluateCheckI(
            stepOutputs,
            check.internal_anchors || [],
            check.min_internal_hits ?? 0,
          ),
        );
        break;
      case 'E':
        results.push(
          evaluateCheckE(options?.toolCalls ?? stepOutputs.length, check.max_tool_calls ?? Number.MAX_SAFE_INTEGER),
        );
        break;
      default:
        results.push({ id: check.id, pass: false, detail: `unsupported check id: ${check.id}` });
        break;
    }
  }

  return results;
}
