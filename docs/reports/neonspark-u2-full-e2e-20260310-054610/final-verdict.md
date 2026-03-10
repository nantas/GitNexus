# U2 E2E Final Verdict

- Run ID: neonspark-u2-full-e2e-20260310-054610

## Build Timings
- Build: 1276.0ms
- Pipeline Profile: 19127.9ms
- Analyze: 44.0s

## Estimate Comparison
- Status: below-range
- In Range: NO
- Actual: 44.0s
- Expected: 322.6s - 540.1s
- Delta: -278.6s

## U2 Capability Checks by Symbol
- MainUIManager: PASS (steps=4, duration=242.2ms, tokens=5740)
- CoinPowerUp: PASS (steps=4, duration=56.9ms, tokens=15655)
- GlobalDataAssets: PASS (steps=4, duration=130.1ms, tokens=4566)
- AssetRef: FAIL (steps=4, duration=140.7ms, tokens=7204)
- PlayerActor: PASS (steps=4, duration=262.6ms, tokens=13815)

## Token Consumption Summary
- Total Tokens (est): 46980
- Total Duration: 832.5ms

## Failures and Manual Actions
- AssetRef: AssetRef: context(on) must include resourceBindings
- duration.min=0.9ms median=22.3ms max=210.4ms
- AssetRef: AssetRef: context(on) must include resourceBindings
- duration.min=0.9ms median=22.3ms max=210.4ms
