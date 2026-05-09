import { describe, it, expect } from 'vitest'

import path from 'node:path';
import { loadAgentSafeQueryContextSuite } from './io.js';

it('loads canonical benchmark cases without placeholders', async () => {
  const suite = await loadAgentSafeQueryContextSuite(
    path.resolve('../benchmarks/agent-safe-query-context/neonspark-v1'),
  );

  expect(Object.keys(suite.cases).sort()).toEqual(['reload', 'weapon_powerup']);
  expect(suite.cases.weapon_powerup.semantic_tuple.resource_anchor).toBe('Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',);
  expect(suite.cases.reload.semantic_tuple.proof_edge).toBe('ReloadBase.GetValue -> ReloadBase.CheckReload',);
  expect(suite.cases.weapon_powerup.live_task.symbol_seed).toBe('WeaponPowerUp');
  expect(suite.cases.reload.live_task.resource_seed).toBe('Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',);
  expect(suite.cases.weapon_powerup.live_task.objective.includes('HoldPickup -> WeaponPowerUp.PickItUp')).toBe(false,);
});
