# Writeback

## Change: fix-unity-scan-activation-gate

## Writeback Targets

### Target 1: `gitnexus/skills/gitnexus-cli.md`

**Status:** ✓ Already applied during implementation (step 2.2)

**Change:** Added `**Unity 项目推荐**` subsection after the `--extensions` flag row in the analyze chapter, including:
- Recommended command: `--extensions .cs --csharp-define-csproj <path>`
- Explanation that Unity resource bindings and lifecycle edges are auto-loaded by the Unity Scan phase
- Performance note: ~15x File nodes without benefit from including `.meta`

**Verification:** Content placed after `--extensions` flag table row, before "Option persistence" section. Existing "C# preprocessing (Unity)" section at line 93 untouched.

### Target 2: `openspec/changes/fix-extensions-param-pipeline/proposal.md`

**Status:** Skipped (optional)

**Reason:** The `fix-extensions-param-pipeline` change is already archived. No impact on its scope description.

## No Additional Writeback Required

- `ARCHITECTURE.md`: No architecture-level documentation changes needed (pipeline phase contract unchanged)
- `UNITY_RESOURCE_BINDING.md`: No changes (binding semantics unchanged)
- `docs/unity-runtime-process-source-of-truth.md`: No changes (runtime process architecture unchanged)
