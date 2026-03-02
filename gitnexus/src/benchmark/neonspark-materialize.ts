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
