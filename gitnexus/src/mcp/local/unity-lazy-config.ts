export interface UnityLazyConfig {
  maxPendingPathsPerRequest: number;
  batchSize: number;
  maxHydrationMs: number;
}

export function resolveUnityLazyConfig(env: NodeJS.ProcessEnv): UnityLazyConfig {
  return {
    maxPendingPathsPerRequest: Number(env.GITNEXUS_UNITY_LAZY_MAX_PATHS || 120),
    batchSize: Number(env.GITNEXUS_UNITY_LAZY_BATCH_SIZE || 30),
    maxHydrationMs: Number(env.GITNEXUS_UNITY_LAZY_MAX_MS || 5000),
  };
}
