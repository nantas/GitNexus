export function buildFailureTriage(failures: Array<{ kind: string }>) {
  const counts = new Map<string, number>();

  for (const failure of failures) {
    counts.set(failure.kind, (counts.get(failure.kind) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
