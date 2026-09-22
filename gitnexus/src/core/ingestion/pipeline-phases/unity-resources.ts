import type { PipelinePhase } from './types.js';
import { processUnityResources } from '../unity-resource-processor.js';
import { walkUnityResourcePaths } from '../unity-resource-scan.js';
import { pathMatchesScopeRules } from '../scope-filter.js';

export const unityResourcesPhase: PipelinePhase = {
  name: 'unity-resources',
  deps: ['communities', 'scopeResolution', 'structure'],
  async execute(ctx) {
    const scopedPaths = (await walkUnityResourcePaths(ctx.repoPath)).filter((p) =>
      pathMatchesScopeRules(p, ctx.options?.scopeRules ?? []),
    );
    return processUnityResources(ctx.graph, { repoPath: ctx.repoPath, scopedPaths });
  },
};
