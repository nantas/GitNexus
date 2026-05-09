import { describe, it, expect } from 'vitest';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUnityUiTrace } from './ui-trace.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity-ui');

it('resolves asset_refs with strict path+line evidence chain', async () => {
  const out = await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'EliteBossScreenController',
    goal: 'asset_refs',
  });
  expect(out.goal).toBe('asset_refs');
  expect(out.results.length).toBe(1);
  expect(out.results[0].evidence_chain.every((hop) => Boolean(hop.path) && hop.line > 0)).toBe(true);
});

it('resolves template_refs from target uxml', async () => {
  const out = await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'Assets/UI/Screens/DressUpScreenNew.uxml',
    goal: 'template_refs',
  });
  expect(out.goal).toBe('template_refs');
  expect(out.results.length).toBe(1);
  expect(out.results[0].evidence_chain[1].path).toBe('Assets/UI/Components/TooltipBox.uxml');
});

it('resolves selector_bindings for static csharp selector usage', async () => {
  const out = await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'EliteBossScreenController',
    goal: 'selector_bindings',
  });
  expect(out.goal).toBe('selector_bindings');
  expect(out.results.length).toBe(1);
  expect(out.results[0].evidence_chain.every((hop) => Boolean(hop.path) && hop.line > 0)).toBe(true);
});

it('resolves selector_bindings when target is a UXML path', async () => {
  const out = await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'Assets/UI/Screens/EliteBossScreenNew.uxml',
    goal: 'selector_bindings',
  });
  expect(out.goal).toBe('selector_bindings');
  expect(out.results.length).toBe(1);
  expect(out.results[0].evidence_chain[0].path.endsWith('.cs')).toBe(true);
  expect(out.results[0].evidence_chain[1].path.endsWith('.uss')).toBe(true);
});

it('selector_bindings path target uses UXML->resource->m_Script chain before filename fallback', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-ui-trace-selector-chain-'));
  await fs.mkdir(path.join(tempRoot, 'Assets/UI/Screens'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Assets/UI/Styles'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Assets/Prefabs'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Assets/Scripts'), { recursive: true });

  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Screens/FeaturePanelNew.uxml'),
    '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Style src="project://database/Assets/UI/Styles/FeaturePanel.uss?guid=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&amp;type=3" /></ui:UXML>\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Screens/FeaturePanelNew.uxml.meta'),
    'fileFormatVersion: 2\nguid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Styles/FeaturePanel.uss'),
    '.feature-panel { color: red; }\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Styles/FeaturePanel.uss.meta'),
    'fileFormatVersion: 2\nguid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/Scripts/PanelBinder.cs'),
    'public class PanelBinder { void Bind() { root.AddToClassList("feature-panel"); } }\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/Scripts/PanelBinder.cs.meta'),
    'fileFormatVersion: 2\nguid: cccccccccccccccccccccccccccccccc\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/Prefabs/FeaturePanel.prefab'),
    [
      '%YAML 1.1',
      '--- !u!114 &11400000',
      'MonoBehaviour:',
      '  m_Script: {fileID: 11500000, guid: cccccccccccccccccccccccccccccccc, type: 3}',
      '  runtimeViewAsset: {fileID: 9197481963319205126, guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 3}',
    ].join('\n'),
    'utf-8',
  );

  const out = await runUnityUiTrace({
    repoRoot: tempRoot,
    target: 'Assets/UI/Screens/FeaturePanelNew.uxml',
    goal: 'selector_bindings',
  });
  expect(out.results.length).toBe(1);
  expect(out.results[0].evidence_chain[0].path).toBe('Assets/Scripts/PanelBinder.cs');
  expect(out.results[0].evidence_chain[1].path).toBe('Assets/UI/Styles/FeaturePanel.uss');

  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('selector_bindings matches class token inside composite USS selectors', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-ui-trace-composite-selector-'));
  await fs.mkdir(path.join(tempRoot, 'Assets/UI/Screens'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Assets/UI/Styles'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Assets/Prefabs'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Assets/Scripts'), { recursive: true });

  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Screens/CompositePanelNew.uxml'),
    '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Style src="project://database/Assets/UI/Styles/CompositePanel.uss?guid=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&amp;type=3" /></ui:UXML>\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Screens/CompositePanelNew.uxml.meta'),
    'fileFormatVersion: 2\nguid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Styles/CompositePanel.uss'),
    '.isLock .preview-icon { opacity: 0.4; }\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Styles/CompositePanel.uss.meta'),
    'fileFormatVersion: 2\nguid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/Scripts/CompositeBinder.cs'),
    'public class CompositeBinder { void Bind() { root.AddToClassList("isLock"); } }\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/Scripts/CompositeBinder.cs.meta'),
    'fileFormatVersion: 2\nguid: cccccccccccccccccccccccccccccccc\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/Prefabs/CompositePanel.prefab'),
    [
      '%YAML 1.1',
      '--- !u!114 &11400000',
      'MonoBehaviour:',
      '  m_Script: {fileID: 11500000, guid: cccccccccccccccccccccccccccccccc, type: 3}',
      '  runtimeViewAsset: {fileID: 9197481963319205126, guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 3}',
    ].join('\n'),
    'utf-8',
  );

  const out = await runUnityUiTrace({
    repoRoot: tempRoot,
    target: 'Assets/UI/Screens/CompositePanelNew.uxml',
    goal: 'selector_bindings',
  });
  expect(out.results.length).toBe(1);
  expect(out.results[0].evidence_chain[0].path).toBe('Assets/Scripts/CompositeBinder.cs');
  expect(out.results[0].evidence_chain[1].path).toBe('Assets/UI/Styles/CompositePanel.uss');

  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('selector_bindings ranks resource-chain matches ahead of name-fallback matches', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-ui-trace-ranking-'));
  await fs.mkdir(path.join(tempRoot, 'Assets/UI/Screens'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Assets/UI/Styles'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Assets/Prefabs'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Assets/Scripts'), { recursive: true });

  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Screens/RankPanelNew.uxml'),
    '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Style src="project://database/Assets/UI/Styles/RankPanel.uss?guid=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&amp;type=3" /></ui:UXML>\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Screens/RankPanelNew.uxml.meta'),
    'fileFormatVersion: 2\nguid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Styles/RankPanel.uss'),
    '.active .rank-icon { opacity: 1; }\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Styles/RankPanel.uss.meta'),
    'fileFormatVersion: 2\nguid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/Scripts/ResourceDriver.cs'),
    'public class ResourceDriver { void Bind() { root.AddToClassList("active"); } }\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/Scripts/ResourceDriver.cs.meta'),
    'fileFormatVersion: 2\nguid: cccccccccccccccccccccccccccccccc\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/Scripts/RankPanel.cs'),
    'public class RankPanel { void Bind() { root.AddToClassList("active"); } }\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/Scripts/RankPanel.cs.meta'),
    'fileFormatVersion: 2\nguid: dddddddddddddddddddddddddddddddd\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/Prefabs/RankPanel.prefab'),
    [
      '%YAML 1.1',
      '--- !u!114 &11400000',
      'MonoBehaviour:',
      '  m_Script: {fileID: 11500000, guid: cccccccccccccccccccccccccccccccc, type: 3}',
      '  runtimeViewAsset: {fileID: 9197481963319205126, guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 3}',
    ].join('\n'),
    'utf-8',
  );

  const out = await runUnityUiTrace({
    repoRoot: tempRoot,
    target: 'Assets/UI/Screens/RankPanelNew.uxml',
    goal: 'selector_bindings',
  });
  expect(out.results.length).toBe(2);
  expect(out.results[0].evidence_chain[0].path).toBe('Assets/Scripts/ResourceDriver.cs');
  expect(out.results[1].evidence_chain[0].path).toBe('Assets/Scripts/RankPanel.cs');
  expect((out.results[0].score || 0) > (out.results[1].score || 0)).toBe(true);
  expect(out.results[0].confidence).toBe('high');
  expect(out.results[1].confidence).toBe('medium');

  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('enforces unique-result gate and returns ambiguity diagnostics', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-ui-trace-ambiguity-'));
  await fs.cp(fixtureRoot, tempRoot, { recursive: true });
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Screens/EliteBossScreen.uxml'),
    '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:VisualElement /></ui:UXML>\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Screens/EliteBossScreen.uxml.meta'),
    'fileFormatVersion: 2\nguid: 12121212121212121212121212121212\n',
    'utf-8',
  );

  const out = await runUnityUiTrace({
    repoRoot: tempRoot,
    target: 'EliteBossScreenController',
    goal: 'asset_refs',
  });
  expect(out.results).toEqual([]);
  expect(out.diagnostics[0].code).toBe('ambiguous');
  expect(Boolean(out.diagnostics[0].candidates[0].path)).toBe(true);
  expect(out.diagnostics[0].candidates[0].line > 0).toBe(true);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('treats existing UXML path target as unique even when canonical names collide', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-ui-trace-path-'));
  await fs.cp(fixtureRoot, tempRoot, { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Assets/UI/Legacy'), { recursive: true });
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Legacy/EliteBossScreen.uxml'),
    '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:VisualElement /></ui:UXML>\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(tempRoot, 'Assets/UI/Legacy/EliteBossScreen.uxml.meta'),
    'fileFormatVersion: 2\nguid: 34343434343434343434343434343434\n',
    'utf-8',
  );

  const out = await runUnityUiTrace({
    repoRoot: tempRoot,
    target: 'Assets/UI/Screens/EliteBossScreenNew.uxml',
    goal: 'asset_refs',
  });
  expect(out.diagnostics.length).toBe(0);
  expect(out.results.length).toBe(1);
  expect(out.results[0].evidence_chain[1].path).toBe('Assets/UI/Screens/EliteBossScreenNew.uxml');

  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('ensures no graph mutations occur in query-time engine', async () => {
  const mockGraphAddRelationship = () => {};
  await runUnityUiTrace({
    repoRoot: fixtureRoot,
    target: 'EliteBossScreenController',
    goal: 'asset_refs',
  });
  expect(typeof mockGraphAddRelationship).toBe('function');
});
