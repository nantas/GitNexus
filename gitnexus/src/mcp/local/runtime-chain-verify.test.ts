import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeChainOnDemand, verifyRuntimeClaimOnDemand } from './runtime-chain-verify.js';

async function makeTempRepo(): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-verify-'));
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb'), { recursive: true });
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/Graphs/PlayerGun/Gungraph_use'), { recursive: true });
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/Code/Game/Graph/Nodes/Reloads'), { recursive: true });
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset'), 'gungraph: {guid: 69199acacbf8a7e489ad4aa872efcabd}\n');
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset.meta'), 'guid: 69199acacbf8a7e489ad4aa872efcabd\n');
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset'), 'ResultRPM: GunOutput.RPM\n');
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs.meta'), 'guid: bd387039cacb475381a86f156b54bac2\n');
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/Code/Game/PowerUps'), { recursive: true });
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/Code/Game/Core'), { recursive: true });
  await fs.writeFile(
    path.join(repoPath, 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs'),
    'void Equip() {\n  CurGunGraph = graph;\n}\n',
  );
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/Code/Game/Core/GunGraph.cs'), 'void StartRoutineWithEvents() {}\n');
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs'), 'void GetValue() {}\n');
  return repoPath;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function makeExecuteParameterized(repoPath: string): (query: string, params?: Record<string, unknown>) => Promise<any[]> {
  return async (query, params) => {
    const q = String(query || '');

    const weaponPath = 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs';
    const gunGraphPath = 'Assets/NEON/Code/Game/Core/GunGraph.cs';
    const reloadBasePath = 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs';

    const symbolRows: Record<string, any> = {
      WeaponPowerUp: {
        id: `Class:${weaponPath}:WeaponPowerUp`,
        name: 'WeaponPowerUp',
        type: 'Class',
        filePath: weaponPath,
        startLine: 1,
      },
      GunGraph: {
        id: `Class:${gunGraphPath}:GunGraph`,
        name: 'GunGraph',
        type: 'Class',
        filePath: gunGraphPath,
        startLine: 1,
      },
      ReloadBase: {
        id: `Class:${reloadBasePath}:ReloadBase`,
        name: 'ReloadBase',
        type: 'Class',
        filePath: reloadBasePath,
        startLine: 1,
      },
    };
    const reloadBasePresent = await fileExists(path.join(repoPath, reloadBasePath));

    if (q.includes('WHERE n.filePath = $filePath')) {
      const filePath = String(params?.filePath || '');
      const symbolName = String(params?.symbolName || '');
      const candidates = Object.values(symbolRows).filter(
        (row) => row.filePath === filePath && (row.name !== 'ReloadBase' || reloadBasePresent),
      );
      if (!symbolName) return candidates;
      return candidates.filter((row) => row.name === symbolName);
    }

    if (q.includes('WHERE n.name IN $symbolNames')) {
      const names = Array.isArray(params?.symbolNames) ? (params?.symbolNames as string[]) : [];
      return names
        .map((name) => symbolRows[String(name)])
        .filter((row) => row && (row.name !== 'ReloadBase' || reloadBasePresent))
        .filter(Boolean);
    }

    if (q.includes("MATCH (s {id: $symbolId})-[r:CodeRelation {type: 'CALLS'}]->(t)")) {
      const symbolId = String(params?.symbolId || '');
      if (symbolId === symbolRows.ReloadBase.id && reloadBasePresent) {
        return [{
          sourceId: symbolRows.ReloadBase.id,
          sourceName: 'ReloadBase',
          sourceFilePath: reloadBasePath,
          sourceStartLine: 1,
          targetId: `Method:${reloadBasePath}:CheckReload`,
          targetName: 'CheckReload',
          targetFilePath: reloadBasePath,
          targetStartLine: 12,
        }];
      }
      if (symbolId === symbolRows.WeaponPowerUp.id) {
        return [{
          sourceId: symbolRows.WeaponPowerUp.id,
          sourceName: 'WeaponPowerUp',
          sourceFilePath: weaponPath,
          sourceStartLine: 1,
          targetId: `Method:${weaponPath}:Equip`,
          targetName: 'Equip',
          targetFilePath: weaponPath,
          targetStartLine: 1,
        }];
      }
      return [];
    }

    if (q.includes("MATCH (s)-[r:CodeRelation {type: 'CALLS'}]->(t {id: $symbolId})")) {
      const symbolId = String(params?.symbolId || '');
      if (symbolId === symbolRows.ReloadBase.id && reloadBasePresent) {
        return [{
          sourceId: `Method:${weaponPath}:Equip`,
          sourceName: 'Equip',
          sourceFilePath: weaponPath,
          sourceStartLine: 1,
          targetId: symbolRows.ReloadBase.id,
          targetName: 'ReloadBase',
          targetFilePath: reloadBasePath,
          targetStartLine: 1,
        }];
      }
      return [];
    }

    if (q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")
      && q.includes("MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)")) {
      const symbolId = String(params?.symbolId || '');
      if (symbolId === symbolRows.ReloadBase.id && reloadBasePresent) {
        return [{
          sourceId: `Method:${reloadBasePath}:OnEquip`,
          sourceName: 'OnEquip',
          sourceFilePath: reloadBasePath,
          sourceStartLine: 5,
          targetId: `Method:${reloadBasePath}:CheckReload`,
          targetName: 'CheckReload',
          targetFilePath: reloadBasePath,
          targetStartLine: 12,
        }];
      }
      return [];
    }

    if (q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")
      && q.includes("MATCH (s)-[r:CodeRelation {type: 'CALLS'}]->(m)")) {
      const symbolId = String(params?.symbolId || '');
      if (symbolId === symbolRows.ReloadBase.id && reloadBasePresent) {
        return [{
          sourceId: `Method:${weaponPath}:Equip`,
          sourceName: 'Equip',
          sourceFilePath: weaponPath,
          sourceStartLine: 1,
          targetId: `Method:${reloadBasePath}:OnEquip`,
          targetName: 'OnEquip',
          targetFilePath: reloadBasePath,
          targetStartLine: 5,
        }];
      }
      return [];
    }

    if (q.includes("r.reason STARTS WITH 'unity-rule-'") && q.includes('r.reason CONTAINS $ruleId')) {
      const ruleId = String(params?.ruleId || '');
      if (ruleId && reloadBasePresent) {
        return [{
          sourceName: 'unity-runtime-root',
          sourceFilePath: '',
          sourceStartLine: 1,
          targetName: 'ReloadBase',
          targetFilePath: reloadBasePath,
          targetStartLine: 1,
          reason: `unity-rule-resource-load:${ruleId}`,
        }];
      }
      return [];
    }

    return [];
  };
}

function hasBalancedShellQuotes(command: string): boolean {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (const ch of String(command || '')) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && ch === '\'') {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
    }
  }
  return !inSingle && !inDouble && !escaped;
}

async function writeRules(
  repoPath: string,
  ruleYamlByFile: Record<string, string>,
  rootDirName = 'rules',
): Promise<string> {
  const rulesRoot = path.join(repoPath, '.gitnexus', rootDirName);
  await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
  const entries = Object.entries(ruleYamlByFile).map(([file, content]) => {
    const id = String(content.match(/^id:\s*(.+)$/m)?.[1] || '').trim();
    const version = String(content.match(/^version:\s*(.+)$/m)?.[1] || '').trim();
    return { id, version, file };
  });
  await fs.writeFile(path.join(rulesRoot, 'catalog.json'), JSON.stringify({ rules: entries }, null, 2), 'utf-8');
  for (const [file, content] of Object.entries(ruleYamlByFile)) {
    await fs.writeFile(path.join(rulesRoot, file), content, 'utf-8');
  }
  return rulesRoot;
}

describe('runtime chain verify', () => {
  it('does not run reload fallback when no rule is matched', async () => {
    const repoPath = await makeTempRepo();
    const out = await verifyRuntimeChainOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      executeParameterized: makeExecuteParameterized(repoPath),
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
    });
    expect(out).toBeUndefined();
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('runtime chain gaps are actionable under graph-only verification', async () => {
    const out = await verifyRuntimeChainOnDemand({
      repoPath: await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-gaps-')),
      queryText: 'Reload',
      symbolName: 'ReloadBase',
      symbolFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
      executeParameterized: async () => [],
      resourceBindings: [],
    });
    expect(out?.gaps.length).toBeGreaterThan(0);
    expect(out?.gaps.every((gap) => !!gap.next_command)).toBe(true);
  });

  it('builds graph-only follow-up command from symbol anchor when query text is missing', async () => {
    const out = await verifyRuntimeClaimOnDemand({
      repoPath: await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-anchor-symbol-')),
      executeParameterized: async () => [],
      queryText: '',
      symbolName: 'InitGlobal',
      symbolFilePath: 'Assets/NEON/Code/Game/Core/GameBootstrap.cs',
      resourceBindings: [],
    });
    expect(out.next_action).toContain('InitGlobal');
    expect(out.next_action).not.toContain('Reload NEON.Game.Graph.Nodes.Reloads');
    expect(out.gaps.every((gap) => !gap.next_command.includes('Reload NEON.Game.Graph.Nodes.Reloads'))).toBe(true);
    expect(out.gaps.every((gap) => gap.next_command.includes('InitGlobal'))).toBe(true);
  });

  it('prefers resource seed path in follow-up command subject when seed is present', async () => {
    const seedPath = 'Assets/NEON/DataAssets/Powerups/Startup/init_global.asset';
    const out = await verifyRuntimeClaimOnDemand({
      repoPath: await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-anchor-seed-')),
      executeParameterized: async () => [],
      queryText: '',
      symbolName: 'InitGlobal',
      symbolFilePath: 'Assets/NEON/Code/Game/Core/GameBootstrap.cs',
      resourceSeedPath: seedPath,
      resourceBindings: [],
    });
    expect(out.next_action).toContain(seedPath);
    expect(out.next_action).not.toContain('Reload NEON.Game.Graph.Nodes.Reloads');
    expect(out.gaps.every((gap) => !gap.next_command.includes('Reload NEON.Game.Graph.Nodes.Reloads'))).toBe(true);
  });

  it('accepts seed-to-mapped resource equivalence for bind segment in graph-only verifier', async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-mapped-resource-'));
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'EnergyByAttackCount Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/0_初始武器/1_weapon_0_james_new.asset',
      symbolName: 'EnergyNode',
      symbolFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Energy/EnergyNode.cs',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/0_初始武器/1_weapon_0_james_new.asset',
      mappedSeedTargets: ['Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_0_james1.asset'],
      resourceBindings: [{ resourcePath: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_0_james1.asset' }],
      executeParameterized: async (query: string) => {
        const q = String(query || '');
        if (q.includes('WHERE n.name IN $symbolNames')) {
          return [{
            id: 'Class:Assets/NEON/Code/Game/Graph/Nodes/Energy/EnergyNode.cs:EnergyNode',
            name: 'EnergyNode',
            type: 'Class',
            filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Energy/EnergyNode.cs',
            startLine: 1,
          }];
        }
        if (q.includes("MATCH (s {id: $symbolId})-[r:CodeRelation {type: 'CALLS'}]->(t)")) {
          return [{
            sourceId: 'Method:Assets/NEON/Code/Game/Graph/Nodes/Energy/EnergyNode.cs:Apply',
            sourceName: 'Apply',
            sourceFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Energy/EnergyNode.cs',
            sourceStartLine: 22,
            targetId: 'Method:Assets/NEON/Code/Game/Graph/Nodes/Energy/EnergyRuntime.cs:Run',
            targetName: 'Run',
            targetFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Energy/EnergyRuntime.cs',
            targetStartLine: 10,
            reason: 'unity-rule-method-bridge:demo.energy.seed-map.v1',
          }];
        }
        if (
          q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")
          && q.includes("MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)")
        ) {
          return [{
            sourceId: 'Method:Assets/NEON/Code/Game/Graph/Nodes/Energy/EnergyNode.cs:Bootstrap',
            sourceName: 'Bootstrap',
            sourceFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Energy/EnergyNode.cs',
            sourceStartLine: 8,
            targetId: 'Method:Assets/NEON/Code/Game/Graph/Nodes/Energy/EnergyNode.cs:Apply',
            targetName: 'Apply',
            targetFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Energy/EnergyNode.cs',
            targetStartLine: 22,
            reason: 'static-call',
          }];
        }
        return [];
      },
    });

    expect(out.rule_id).toBe('graph-only.runtime-closure.v1');
    expect(out.status).toBe('verified_full');
    expect(out.gaps.length).toBe(0);
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('phase2 runtime claim returns explicit rule_not_matched', async () => {
    const out = await verifyRuntimeClaimOnDemand({
      repoPath: path.resolve('.'),
      queryText: 'CompletelyUnrelatedChain',
      executeParameterized: async () => [],
      resourceBindings: [],
    });
    expect(out.status).toBe('failed');
    expect(out.reason).toBe('rule_not_matched');
    expect(out.next_action).toBeTruthy();
  });

  it('phase2 runtime claim maps missing catalog to rule_not_matched', async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-missing-catalog-'));
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      executeParameterized: async () => [],
      resourceBindings: [],
      rulesRoot: path.join(repoPath, '.gitnexus', 'rules'),
    });
    expect(out.status).toBe('failed');
    expect(out.reason).toBe('rule_not_matched');
    expect(out.next_action).toBeTruthy();
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('phase2 runtime claim maps missing rule file to rule_not_matched', async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-missing-rule-file-'));
    const rulesRoot = path.join(repoPath, '.gitnexus', 'rules');
    await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
    await fs.writeFile(
      path.join(rulesRoot, 'catalog.json'),
      JSON.stringify({
        rules: [{ id: 'demo.reload.rule.v1', version: '1.0.0', file: 'approved/demo.reload.rule.v1.yaml' }],
      }),
      'utf-8',
    );
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      executeParameterized: async () => [],
      resourceBindings: [],
      rulesRoot,
    });
    expect(out.status).toBe('failed');
    expect(out.reason).toBe('rule_not_matched');
    expect(out.next_action).toBeTruthy();
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('phase2 runtime claim uses graph-only metadata', async () => {
    const repoPath = await makeTempRepo();
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      symbolName: 'ReloadBase',
      symbolFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
      executeParameterized: makeExecuteParameterized(repoPath),
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
    });
    expect(out.rule_id).toBe('graph-only.runtime-closure.v1');
    expect(out.rule_version).toBe('1.0.0');
  });

  it('phase2 next_action remains shell-parsable when unmatched', async () => {
    const out = await verifyRuntimeClaimOnDemand({
      repoPath: path.resolve('.'),
      queryText: 'CompletelyUnrelatedChain',
      executeParameterized: async () => [],
      resourceBindings: [],
    });
    expect(out.reason).toBe('rule_not_matched');
    expect(typeof out.next_action).toBe('string');
    expect(hasBalancedShellQuotes(String(out.next_action || ''))).toBe(true);
  });

  it('phase2 runtime claim is stable under different rulesRoot values (graph-only)', async () => {
    const repoPath = await makeTempRepo();
    const executeParameterized = makeExecuteParameterized(repoPath);
    const strictExecuteParameterized = async (query: string, params?: Record<string, unknown>) => {
      const q = String(query || '');
      if (q.includes("MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)")) {
        return [];
      }
      return executeParameterized(query, params);
    };
    const strictRulesRoot = await writeRules(repoPath, {
      'approved/demo.reload.strict.v1.yaml': [
        'id: demo.reload.strict.v1',
        'version: 1.0.0',
        'trigger_family: reload',
        'resource_types:',
        '  - asset',
        'host_base_type:',
        '  - ReloadBase',
        'required_hops:',
        '  - resource',
        '  - guid_map',
        '  - code_loader',
        '  - code_runtime',
        'guarantees:',
        '  - strict_chain_closed',
        'non_guarantees:',
        '  - strict_no_runtime_execution',
        'next_action: node strict',
      ].join('\n'),
    }, 'rules-strict');
    const relaxedRulesRoot = await writeRules(repoPath, {
      'approved/demo.reload.relaxed.v1.yaml': [
        'id: demo.reload.relaxed.v1',
        'version: 1.0.0',
        'trigger_family: reload',
        'resource_types:',
        '  - asset',
        'host_base_type:',
        '  - ReloadBase',
        'required_hops:',
        '  - resource',
        '  - guid_map',
        '  - code_loader',
        'guarantees:',
        '  - relaxed_chain_closed',
        'non_guarantees:',
        '  - relaxed_no_runtime_execution',
        'next_action: node relaxed',
      ].join('\n'),
    }, 'rules-relaxed');

    const strict = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      symbolName: 'ReloadBase',
      symbolFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
      executeParameterized: strictExecuteParameterized,
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
      rulesRoot: strictRulesRoot,
    });
    const relaxed = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      symbolName: 'ReloadBase',
      symbolFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
      executeParameterized,
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
      rulesRoot: relaxedRulesRoot,
    });

    expect(strict.rule_id).toBe('graph-only.runtime-closure.v1');
    expect(relaxed.rule_id).toBe('graph-only.runtime-closure.v1');
    expect(strict.status).toBe(relaxed.status);
    expect(strict.evidence_level).toBe(relaxed.evidence_level);
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('phase2 runtime claim guarantees/non_guarantees follow graph-only contract', async () => {
    const repoPath = await makeTempRepo();
    const rulesRoot = await writeRules(repoPath, {
      'approved/demo.reload.claim-semantics.v1.yaml': [
        'id: demo.reload.claim-semantics.v1',
        'version: 2.0.0',
        'trigger_family: reload',
        'resource_types:',
        '  - asset',
        'host_base_type:',
        '  - ReloadBase',
        'required_hops:',
        '  - resource',
        '  - guid_map',
        '  - code_loader',
        '  - code_runtime',
        'guarantees:',
        '  - custom_guarantee_from_rule',
        'non_guarantees:',
        '  - custom_non_guarantee_from_rule',
        'next_action: node claim-semantics',
        'match:',
        '  trigger_tokens:',
        '    - reload',
        'topology:',
        '  - hop: resource',
        '    from:',
        '      entity: resource',
        '    to:',
        '      entity: script',
        '    edge:',
        '      kind: binds_script',
        'closure:',
        '  required_hops:',
        '    - resource',
        '    - guid_map',
        '    - code_loader',
        '    - code_runtime',
        '  failure_map:',
        '    missing_evidence: rule_matched_but_evidence_missing',
        'claims:',
        '  guarantees:',
        '    - custom_guarantee_from_rule',
        '  non_guarantees:',
        '    - custom_non_guarantee_from_rule',
        '  next_action: node claim-semantics',
      ].join('\n'),
    });
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload runtime start sequence',
      symbolName: 'ReloadBase',
      symbolFilePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
      resourceSeedPath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
      executeParameterized: makeExecuteParameterized(repoPath),
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
      rulesRoot,
    });
    expect(out.rule_id).toBe('graph-only.runtime-closure.v1');
    expect(out.non_guarantees).toContain('no_runtime_execution');
    expect(out.non_guarantees).toContain('no_dynamic_data_flow_proof');
    expect(out.non_guarantees).toContain('no_state_transition_proof');
    expect(out.non_guarantees).not.toContain('custom_non_guarantee_from_rule');
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('phase2 without structured anchors returns rule_not_matched', async () => {
    const repoPath = await makeTempRepo();
    const rulesRoot = await writeRules(repoPath, {
      'approved/demo.startup.v1.yaml': [
        'id: demo.startup.v1',
        'version: 1.0.0',
        'trigger_family: startup',
        'resource_types:',
        '  - asset',
        'host_base_type:',
        '  - StartupNode',
        'required_hops:',
        '  - resource',
        'guarantees:',
        '  - startup_chain_closed',
        'non_guarantees:',
        '  - startup_not_executed',
        'next_action: node startup',
      ].join('\n'),
    });
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Startup Graph Trigger',
      executeParameterized: makeExecuteParameterized(repoPath),
      resourceBindings: [{ resourcePath: 'Assets/Custom/Rules/startup.asset' }],
      rulesRoot,
    });
    expect(out.rule_id).toBe('none');
    expect(out.reason).toBe('rule_not_matched');
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('phase2 rule_not_matched does not leak first rule next_action', async () => {
    const repoPath = await makeTempRepo();
    const rulesRoot = await writeRules(repoPath, {
      'approved/demo.startup.v1.yaml': [
        'id: demo.startup.v1',
        'version: 1.0.0',
        'trigger_family: startup',
        'resource_types:',
        '  - asset',
        'host_base_type:',
        '  - StartupNode',
        'required_hops:',
        '  - resource',
        'guarantees:',
        '  - startup_chain_closed',
        'non_guarantees:',
        '  - startup_not_executed',
        'next_action: node startup-only-action',
      ].join('\n'),
    });
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload runtime start sequence',
      executeParameterized: makeExecuteParameterized(repoPath),
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
      rulesRoot,
    });
    expect(out.reason).toBe('rule_not_matched');
    expect(String(out.next_action || '')).not.toContain('startup-only-action');
    expect(String(out.next_action || '')).toContain('Reload runtime start sequence');
    await fs.rm(repoPath, { recursive: true, force: true });
  });

});
