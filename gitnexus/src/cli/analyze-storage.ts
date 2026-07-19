import fs from 'node:fs/promises';

type RemoveArtifact = (target: string) => Promise<unknown>;

export const removeLbugArtifacts = async (
  lbugPath: string,
  removeArtifact: RemoveArtifact = (target) => fs.rm(target, { recursive: true, force: true }),
): Promise<void> => {
  for (const target of [lbugPath, `${lbugPath}.wal`, `${lbugPath}.lock`]) {
    try {
      await removeArtifact(target);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to remove LadybugDB artifact ${target}: ${message}`, { cause: error });
    }
  }
};
