export interface ResourceCosts {
  opens: number;
  bytes: number;
  parses: number;
  peakRecordBytes: number;
  spillWrittenBytes: number;
  spillReadBytes: number;
  spillWriteMs: number;
  spillReadMs: number;
}

export function resourceCosts(): ResourceCosts {
  return { opens: 0, bytes: 0, parses: 0, peakRecordBytes: 0, spillWrittenBytes: 0, spillReadBytes: 0, spillWriteMs: 0, spillReadMs: 0 };
}
