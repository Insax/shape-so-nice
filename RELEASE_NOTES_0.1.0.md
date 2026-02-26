# Release Notes - 0.1.0 (RC Draft)

Date: 2026-02-26
Status: RC draft (pre live-table feedback cycle)

## Highlights

- Core wildshape flow is implemented and stable:
  - trigger -> chooser -> transform -> reshape/revert
- Nimble-first transform/revert behavior with rollback safety
- Form ability UUID mapping/injection on enter/leave form
- Descriptor-based filter support for Nimble:
  - `type`, `system.objectType`, `system.featureType`
- Direct item activation listener path (non-chat trigger path)
- Optional chat fallback trigger path (`ui.useChatFallback`)
- Structured debug logging with GM toggle

## Config and Permissions

- Global GM config (world setting)
- Player override config (user flag)
- Effective config merge with player override precedence
- Permission model for player override editors

## Reliability

- Snapshot-backed transform/revert model
- Failed transform recovery path restores stable actor state
- Ensured wildshape action persistence while shaped

## Adapter and Extensibility

- Adapter extension points added for trigger intake:
  - `getItemUseHooks()`
  - `extractItemFromHookArgs(hookName, args)`
- Nimble-specific assumptions are isolated in Nimble adapter path

## Testing

- Automated tests passing
- Coverage enforcement enabled at high thresholds:
  - lines/statements: `98`
  - functions: `99`
  - branches: `94`

## Docs and QA

- Added conformance notes: `NIMBLE_CONFORMANCE.md`
- Added migration policy: `MIGRATION_POLICY.md`
- Added manual QA checklist: `QA_CHECKLIST.md`

## Remaining Before Final RC/Release

- Execute full manual QA checklist in live Foundry/Nimble world
- Run one live-table feedback cycle
- Capture and triage any issues from live usage
