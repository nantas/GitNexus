import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

interface AnalyzeLockOwner {
  pid: number;
  token: string;
  startedAt: string;
}

export interface AnalyzeLockOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  missingOwnerStaleMs?: number;
  onWait?: (owner: AnalyzeLockOwner | null) => void;
}

export interface AnalyzeLock {
  lockPath: string;
  release: () => Promise<void>;
}

const OWNER_FILE = 'owner.json';
const RECLAIM_DIR = 'reclaim';

export const getAnalyzeLockPath = (storagePath: string): string => (
  path.join(storagePath, 'analyze.lock')
);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isNotFound = (error: unknown): boolean => (
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
);

const isAlreadyExists = (error: unknown): boolean => (
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
);

const readOwner = async (lockPath: string): Promise<AnalyzeLockOwner | null> => {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(lockPath, OWNER_FILE), 'utf8')) as Partial<AnalyzeLockOwner>;
    if (
      typeof parsed.pid === 'number' && Number.isInteger(parsed.pid) && parsed.pid > 0 &&
      typeof parsed.token === 'string' && parsed.token.length > 0 &&
      typeof parsed.startedAt === 'string'
    ) {
      return parsed as AnalyzeLockOwner;
    }
  } catch (error) {
    if (!isNotFound(error) && !(error instanceof SyntaxError)) throw error;
  }
  return null;
};

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH');
  }
};

const inspectStaleOwner = async (
  lockPath: string,
  missingOwnerStaleMs: number,
): Promise<{ owner: AnalyzeLockOwner | null; stale: boolean }> => {
  const owner = await readOwner(lockPath);
  if (owner) return { owner, stale: !isProcessAlive(owner.pid) };

  try {
    const stat = await fs.stat(lockPath);
    return { owner: null, stale: Date.now() - stat.mtimeMs >= missingOwnerStaleMs };
  } catch (error) {
    if (isNotFound(error)) return { owner: null, stale: false };
    throw error;
  }
};

const tryReclaimStaleLock = async (
  lockPath: string,
  missingOwnerStaleMs: number,
): Promise<boolean> => {
  const initial = await inspectStaleOwner(lockPath, missingOwnerStaleMs);
  if (!initial.stale) return false;

  const reclaimPath = path.join(lockPath, RECLAIM_DIR);
  try {
    await fs.mkdir(reclaimPath);
  } catch (error) {
    if (isAlreadyExists(error) || isNotFound(error)) return false;
    throw error;
  }

  const confirmed = await inspectStaleOwner(lockPath, missingOwnerStaleMs);
  const sameOwner = initial.owner?.token === confirmed.owner?.token;
  if (!confirmed.stale || (initial.owner !== null && !sameOwner)) {
    try { await fs.rmdir(reclaimPath); } catch (error) { if (!isNotFound(error)) throw error; }
    return false;
  }

  const quarantinePath = `${lockPath}.stale-${randomUUID()}`;
  try {
    await fs.rename(lockPath, quarantinePath);
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }

  const quarantined = await inspectStaleOwner(quarantinePath, missingOwnerStaleMs);
  const quarantineMatches = initial.owner === null
    ? quarantined.owner === null
    : quarantined.owner?.token === initial.owner.token;
  if (!quarantined.stale || !quarantineMatches) {
    try {
      await fs.rename(quarantinePath, lockPath);
    } catch (error) {
      throw new Error(`Analyze lock changed during stale-lock recovery: ${lockPath}`, { cause: error });
    }
    return false;
  }

  await fs.rm(quarantinePath, { recursive: true, force: true });
  return true;
};

export const acquireAnalyzeLock = async (
  storagePath: string,
  options: AnalyzeLockOptions = {},
): Promise<AnalyzeLock> => {
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  const missingOwnerStaleMs = options.missingOwnerStaleMs ?? 30_000;
  const lockPath = getAnalyzeLockPath(storagePath);
  const token = randomUUID();
  const startedAt = Date.now();
  let waitReported = false;

  await fs.mkdir(storagePath, { recursive: true });

  while (true) {
    try {
      await fs.mkdir(lockPath);
      const owner: AnalyzeLockOwner = { pid: process.pid, token, startedAt: new Date().toISOString() };
      try {
        await fs.writeFile(path.join(lockPath, OWNER_FILE), JSON.stringify(owner), { flag: 'wx' });
      } catch (error) {
        await fs.rm(lockPath, { recursive: true, force: true });
        throw error;
      }

      let released = false;
      return {
        lockPath,
        release: async () => {
          if (released) return;
          released = true;
          const currentOwner = await readOwner(lockPath);
          if (!currentOwner || currentOwner.token !== token) return;

          const releasePath = `${lockPath}.release-${token}`;
          try {
            await fs.rename(lockPath, releasePath);
          } catch (error) {
            if (isNotFound(error)) return;
            throw error;
          }
          await fs.rm(releasePath, { recursive: true, force: true });
        },
      };
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }

    const reclaimed = await tryReclaimStaleLock(lockPath, missingOwnerStaleMs);
    if (reclaimed) continue;

    const owner = await readOwner(lockPath);
    if (!waitReported) {
      waitReported = true;
      options.onWait?.(owner);
    }
    if (Date.now() - startedAt >= timeoutMs) {
      const ownerDetail = owner ? ` (pid ${owner.pid}, since ${owner.startedAt})` : '';
      throw new Error(`Another analyze process still owns ${lockPath}${ownerDetail}`);
    }
    await sleep(pollIntervalMs);
  }
};
