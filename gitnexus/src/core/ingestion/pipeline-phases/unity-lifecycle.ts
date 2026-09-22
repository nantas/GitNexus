import path from 'node:path';
import { getPhaseOutput } from './types.js';
import type { ParseOutput } from './parse.js';
import type { PipelinePhase } from './types.js';
import { applyUnityLifecycleSyntheticCalls } from '../unity-lifecycle-synthetic-calls.js';
import { resolveUnityConfig } from '../../config/unity-config.js';

export const unityLifecyclePhase: PipelinePhase = {
  name: 'unity-lifecycle',
  deps: ['unity-resources', 'parse'],
  async execute(ctx, deps) {
    const enabled = [...ctx.graph.iterNodes()].some(
      (n) => n.properties.filePath?.startsWith('Assets/') && n.properties.filePath.endsWith('.cs'),
    );
    if (!enabled) return { enabled };
    const { config } = resolveUnityConfig(
      undefined,
      path.join(ctx.repoPath, '.gitnexus/config.json'),
    );
    const facts = getPhaseOutput<ParseOutput>(deps, 'parse').csharpPreprocReports ?? [];
    const byFile = new Map(facts.map((f) => [f.filePath, f.containers?.declaredBases ?? []]));
    const declaredBases = new Map<string, readonly string[]>();
    for (const node of ctx.graph.iterNodes()) {
      if (node.label !== 'Class') continue;
      const fact = byFile
        .get(node.properties.filePath)
        ?.find(
          (f) => f.className === node.properties.name && f.startLine === node.properties.startLine,
        );
      if (fact) declaredBases.set(node.id, fact.baseNames);
    }
    return {
      enabled,
      ...applyUnityLifecycleSyntheticCalls(
        ctx.graph,
        {
          maxSyntheticEdgesPerClass: config.maxSyntheticEdgesPerClass,
          maxSyntheticEdgesTotal: config.maxSyntheticEdgesTotal,
        },
        declaredBases,
      ),
    };
  },
};
