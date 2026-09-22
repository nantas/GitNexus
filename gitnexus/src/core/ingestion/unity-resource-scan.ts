import { glob } from 'glob';
import { shouldIgnorePath } from '../../config/ignore-service.js';
const UNITY_RESOURCE_GLOBS = ['**/*.prefab', '**/*.unity', '**/*.asset'];

export const walkUnityResourcePaths = async (repoPath: string): Promise<string[]> => {
  const files = await glob(UNITY_RESOURCE_GLOBS, {
    cwd: repoPath,
    nodir: true,
    dot: false,
  });

  return files
    .filter((file) => !shouldIgnorePath(file))
    .map((file) => file.replace(/\\/g, '/'))
    .sort((left, right) => left.localeCompare(right));
};
