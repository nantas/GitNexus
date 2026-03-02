export function buildSymbolRows(candidates: any[], selectedUids: string[]) {
  if (selectedUids.length !== 20) {
    throw new Error(`selected symbol count must be exactly 20, got ${selectedUids.length}`);
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
