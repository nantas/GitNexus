import { describe, it, expect } from 'vitest';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gitnexusRoot = path.resolve(here, '../../..');
const repoRoot = path.resolve(gitnexusRoot, '..');

it('scan-context carrier contract matches code and docs', async () => {
  const bindingDoc = await fs.readFile(path.join(repoRoot, 'UNITY_RESOURCE_BINDING.md'), 'utf-8');
  const ssot = await fs.readFile(
    path.join(repoRoot, 'docs/unity-runtime-process-source-of-truth.md'),
    'utf-8',
  );
  const design = await fs.readFile(
    path.join(
      repoRoot,
      'docs/plans/2026-04-10-prefab-source-streaming-consumption-memory-optimization-design.md',
    ),
    'utf-8',
  );
  const scanContextCode = await fs.readFile(
    path.join(gitnexusRoot, 'src/core/unity/scan-context.ts'),
    'utf-8',
  );
  const processorCode = await fs.readFile(
    path.join(gitnexusRoot, 'src/core/ingestion/unity-resource-processor.ts'),
    'utf-8',
  );
  const pipelineCode = await fs.readFile(
    path.join(gitnexusRoot, 'src/core/ingestion/pipeline.ts'),
    'utf-8',
  );
  const unityScanPhaseCode = await fs.readFile(
    path.join(gitnexusRoot, 'src/core/ingestion/pipeline-phases/unity-scan.ts'),
    'utf-8',
  );

  expect(bindingDoc).toMatch(/scan-context.*承载器|resource signal carrier|scan-context.*carrier/i);
  expect(bindingDoc).toMatch(/streaming delivery|incremental consumption/i);
  expect(ssot).toMatch(/As-Built[\s\S]*Design Direction/i);
  expect(ssot).toMatch(/scan-context[\s\S]*does not write graph/i);
  expect(ssot).toMatch(/统一消费点契约/i);
  expect(design).toMatch(/scan-context[\s\S]*(统一消费|unified consumer)/i);
  expect(scanContextCode).toMatch(/streamPrefabSourceRefs/);
  expect(processorCode).toMatch(/streamPrefabSourceRefs\(/);
  expect(processorCode).toMatch(/emitPrefabSourceGuidRefsFromScanContext/);
  expect(processorCode).not.toMatch(/emitPrefabSourceGuidRefs\(/);
  expect(scanContextCode).not.toMatch(/addRelationship\(/);
  // processUnityResources is called inside unityScanPhase (which runs before processesPhase).
  // applyUnityLifecycleSyntheticCalls is called inside processesPhase.
  expect(unityScanPhaseCode.indexOf('processUnityResources(') >= 0).toBeTruthy();
  expect(pipelineCode.indexOf('phases.push(unityScanPhase)') >= 0 &&
      pipelineCode.indexOf('phases.push(processesPhase)') >= 0 &&
      pipelineCode.indexOf('phases.push(unityScanPhase)') <
        pipelineCode.indexOf('phases.push(processesPhase)')).toBeTruthy();
});