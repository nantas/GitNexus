# NeonSpark v2 MCP Explainability Sampling Report

Date: 2026-03-02
Dataset: `benchmarks/unity-baseline/neonspark-v2/tasks.jsonl`
Target repo alias: `neonspark-v1-subset`

## 1) Sampling Scope

- Total sampled tasks: `15`
- Split:
  - query: `5`
  - context: `5`
  - impact: `5`
- Selection method: sampled representative tasks from the calibrated v2 benchmark set, including disambiguation-sensitive cases (`LootManager`, `MovePlatform`, `BanScreen`, `RoomConfig`).
- Current task mapping used in this report: query tasks `1,4,6,7,8`; context tasks `20,21,24,25,26`; impact tasks `28,29,32,34,36`.

## 2) Query Samples (5)

### Q1 (`QUERY-1`, task 1)
- Input: `search_query="MirrorNetMgr", limit=1, max_symbols=1`
- Top hits/output summary: `definitions[0]=Class:Assets/NEON/Code/NetworkCode/NeonMgr/MirrorNetMgr.cs:MirrorNetMgr` (`definitionCount=1`)
- Expected vs actual: required hit present, result count `1` meets minimum `1`, no forbidden hits.
- Verdict: `clear`

### Q2 (`QUERY-4`, task 4)
- Input: `search_query="NetPlayer", limit=1, max_symbols=2`
- Top hits/output summary: top definitions are both target classes:
  - `Class:.../NetPlayer.cs:NetPlayer`
  - `Class:.../Netplayer.Decorate.cs:NetPlayer`
- Expected vs actual: both required hits present, result count `2` meets minimum `2`.
- Verdict: `clear`

### Q3 (`QUERY-6`, task 6)
- Input: `search_query="LootManager", limit=1, max_symbols=1`
- Top hits/output summary: `definitions[0]=Class:Assets/NEON/Code/Game/LootSystem/LootManager.cs:LootManager`
- Expected vs actual: required hit present; forbidden `Class:Assets/NEON/Code/Game/LootSystem/LootDropRecorder.cs:LootManager` not present.
- Verdict: `clear`

### Q4 (`QUERY-7`, task 7)
- Input: `search_query="MovePlatform", limit=1, max_symbols=1`
- Top hits/output summary: `definitions[0]=Class:Assets/NEON/Code/Game/MovePlatform.cs:MovePlatform`
- Expected vs actual: required hit present; forbidden `Class:Assets/NEON/Code/Game/Actors/MovePlatform.cs:MovePlatform` not present.
- Verdict: `clear`

### Q5 (`QUERY-8`, task 8)
- Input: `search_query="BanScreenConfig partial", limit=1, max_symbols=2`
- Top hits/output summary:
  - `Class:Assets/NEON/Code/VeewoUI/Shell/Views/BanScreen/BanScreen.cs:BanScreen`
  - `Class:Assets/NEON/Code/VeewoUI/Shell/Views/BanScreen/VesGridProvider.cs:VesGridProvider`
- Expected vs actual: required BanScreen hit present; forbidden `Class:Assets/NEON/Code/VeewoUI/BarScreen/BanScreen.cs:BanScreen` not present; result count `2` meets minimum `2`.
- Verdict: `clear`

## 3) Context Samples (5)

### C1 (`CONTEXT-20`, task 20)
- Input: `uid=Class:Packages/com.veewo.veenode/Veewo/Graph/Runtime/Nodes/Dialogue/DialogueGraph.cs:DialogueGraph`
- Top hits/output summary: `status=found`; symbol UID matched; outgoing refs include `IpoGraph` and `INestedFunctionGraph`; incoming refs `0`.
- Expected vs actual: target symbol resolved exactly, non-empty refs.
- Verdict: `clear`

### C2 (`CONTEXT-21`, task 21)
- Input: `uid=Class:Assets/NEON/Code/Game/PowerUps/AttackSpritePowerUp.cs:AttackSpritePowerUp`
- Top hits/output summary: `status=found`; incoming refs `3`; outgoing refs include parent `SpritePowerUp`.
- Expected vs actual: target symbol resolved exactly, non-empty refs.
- Verdict: `clear`

### C3 (`CONTEXT-24`, task 24)
- Input: `uid=Class:Assets/NEON/Code/Game/LootSystem/LootManager.cs:LootManager`
- Top hits/output summary: `status=found`; incoming refs `30`, outgoing refs `1`, process participation `16`.
- Expected vs actual: required class resolved; forbidden `Class:Assets/NEON/Code/Game/LootSystem/LootDropRecorder.cs:LootManager` absent.
- Verdict: `clear`

### C4 (`CONTEXT-25`, task 25)
- Input: `uid=Class:Assets/NEON/Code/Game/MovePlatform.cs:MovePlatform`
- Top hits/output summary: `status=found`; incoming refs `14`; outgoing refs include `FixedInteractable`.
- Expected vs actual: required class resolved; forbidden actor variant absent.
- Verdict: `clear`

### C5 (`CONTEXT-26`, task 26)
- Input: `uid=Class:Assets/NEON/Code/Game/Abstract/RoomConfig.cs:RoomConfig`
- Top hits/output summary: `status=found`; incoming refs `3`; outgoing refs include `IAssetRefContainer` and `IMigrateAssetRef`.
- Expected vs actual: required class resolved; forbidden tilemap variant absent.
- Verdict: `clear`

## 4) Impact Samples (5)

### I1 (`IMPACT-28`, task 28)
- Input: `target=AssetRef`, `target_uid=Class:Assets/NEON/Code/Framework/AssetData/AssetRef.cs:AssetRef`, `direction=downstream`, `maxDepth=1`, `minConfidence=0.3`, `relationTypes=[EXTENDS]`
- Top hits/output summary: `impactedCount=1`, risk `LOW`; depth-1 includes `Interface:...:IAssetRef`.
- Expected vs actual: target UID present; non-zero downstream impact.
- Verdict: `clear`

### I2 (`IMPACT-29`, task 29)
- Input: `target=Stat`, `target_uid=Class:Packages/com.veewo.stat/Runtime/Stat.cs:Stat`, `direction=downstream`, `maxDepth=1`, `minConfidence=0.5`, `relationTypes=[CALLS]`
- Top hits/output summary: `impactedCount=3`, risk `LOW`; top depth-1 hits are `StatModifier` methods (`Parent`, `UnParent`, `GetTypeAndOrderHash`).
- Expected vs actual: target UID present; non-zero downstream impact.
- Verdict: `clear`

### I3 (`IMPACT-32`, task 32)
- Input: `target=MinionsManager`, `target_uid=Class:Assets/NEON/Code/Game/AllMinionManager/MinionsManager.cs:MinionsManager`, `direction=downstream`, `maxDepth=1`, `minConfidence=0.7`, `relationTypes=[CALLS]`
- Top hits/output summary: `impactedCount=1`, risk `HIGH`; top depth-1 hit `Method:...:GameDataMaxValueAssign`.
- Expected vs actual: target UID present; non-zero downstream impact.
- Verdict: `clear`

### I4 (`IMPACT-34`, task 34)
- Input: `target=LootManager`, `target_uid=Class:Assets/NEON/Code/Game/LootSystem/LootManager.cs:LootManager`, `direction=downstream`, `maxDepth=1`, `minConfidence=0.5`, `relationTypes=[EXTENDS]`
- Top hits/output summary: `impactedCount=1`, risk `LOW`; depth-1 hit `Class:Assets/NEON/Code/Framework/Service.cs:Service`.
- Expected vs actual: required class resolved; forbidden `Class:Assets/NEON/Code/Game/LootSystem/LootDropRecorder.cs:LootManager` absent.
- Verdict: `clear`

### I5 (`IMPACT-36`, task 36)
- Input: `target=RoomConfig`, `target_uid=Class:Assets/NEON/Code/Game/Abstract/RoomConfig.cs:RoomConfig`, `direction=downstream`, `maxDepth=1`, `minConfidence=0.5`, `relationTypes=[CALLS,EXTENDS]`
- Top hits/output summary: `impactedCount=2`, risk `LOW`; depth-1 hits include `IAssetRefContainer` and `IMigrateAssetRef`.
- Expected vs actual: required class resolved; forbidden tilemap variant absent; non-zero downstream impact.
- Verdict: `clear`

## 5) Aggregated Failure Classes

### Sampled 15-task explainability batch

- Total failures: `0`
- Ambiguous verdicts: `0/15`
- Failure classes observed: `none`

### Cross-run v2 benchmark context (same day)

- Source: `docs/reports/2026-03-02-neonspark-v2-run1-report.json`
- Observed historical failure class before stabilization (pre-quick-task hardening revision):
  - `missing-required-hit`: `1` (task index `2`, InputManager query)
- Source: `docs/reports/2026-03-02-neonspark-v2-run2-report.json`, `docs/reports/2026-03-02-neonspark-v2-run3-report.json`
  - residual failures: `none`

## 6) Follow-up Actions

1. Keep early quick-sampled query tasks (`1-5`) in a pinned sanity subset for repeated spot-checking, especially after dataset query-text edits.
2. Extend explainability sampling from `15` to `30` cases in the next calibration cycle, prioritizing name-collision-heavy symbols.
3. Record one weekly quick-run trend line (`benchmark:neonspark:v2:quick`) and alert if any `missing-required-hit` reappears.

## 7) Final Verification Command Outcomes

Executed from `gitnexus/`:

1. `npm run build` -> `PASS`
2. `npm run test:benchmark` -> `PASS` (`48` tests passed, `0` failed)
3. `npm run benchmark:neonspark:v2:quick` -> `PASS` on two consecutive runs
   - archived artifacts:
     - `docs/reports/2026-03-02-neonspark-v2-quick-run1-report.json`
     - `docs/reports/2026-03-02-neonspark-v2-quick-run1-summary.md`
     - `docs/reports/2026-03-02-neonspark-v2-quick-run2-report.json`
     - `docs/reports/2026-03-02-neonspark-v2-quick-run2-summary.md`
   - run1 metrics (archived):
     - query precision: `1.000`
     - query recall: `1.000`
     - context/impact F1: `1.000`
     - smoke pass rate: `1.000`
     - gate failures: `none`
   - run2 metrics (archived):
     - query precision: `1.000`
     - query recall: `1.000`
     - context/impact F1: `1.000`
     - smoke pass rate: `1.000`
     - gate failures: `none`
4. `npm run benchmark:neonspark:v2:full` -> `PASS` (sanity run)
   - query precision: `0.952`
   - query recall: `1.000`
   - context/impact F1: `0.680`
   - smoke pass rate: `1.000`
   - gate failures: `none`
5. `node dist/cli/index.js status` -> `PASS` (command succeeded; freshness state can still be `stale`)
   - Clarification: command execution success and index freshness are separate; staleness is expected when commits are added after the last `analyze`.
6. `node dist/cli/index.js list` -> `PASS` (`4` indexed repos listed; `neonspark-v1-subset` mapped to `/Volumes/Shuttle/unity-projects/neonspark`)
