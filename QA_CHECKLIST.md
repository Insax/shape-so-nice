# Manual QA Checklist

Date prepared: 2026-02-26
Module: `shape-so-nice`
Target system: Nimble

Use this checklist before RC/release. Mark each item `PASS`/`FAIL` and add notes.

## Environment

- [ ] Foundry core v13 world is running
- [ ] Nimble system is active
- [ ] `shape-so-nice` module is enabled
- [ ] At least two test users exist: `GM`, `Player`

## R5.1 Nimble Smoke Test

### Setup

- [ ] Create/choose a player character with mapped wildshape trigger ability
- [ ] Add at least two mapped forms
- [ ] Ensure mapping uses both form-ref modes across entries (`name` and `uuid`)

### Trigger and chooser

- [ ] Use mapped ability -> chooser opens
- [ ] Current form is excluded from options when already shaped
- [ ] `Original Form` option appears while shaped

### Transform behavior

- [ ] Transform applies form token image/size/senses/speed
- [ ] Character core preserved (HP/resources/level/class identity per config)
- [ ] Whitelist/blacklist keep behavior matches config (inventory not duplicated)
- [ ] Form abilities mapped by UUID are added on enter and removed on leave/revert

### Revert and reshape

- [ ] Revert from chooser restores original form in one interaction
- [ ] Re-shape between forms works repeatedly without corruption
- [ ] No item duplication after repeated transform/revert cycles (run at least 5 cycles)

## R5.2 Multi-player Permission Scenarios

### Global config

- [ ] GM can open/edit/save global config
- [ ] Non-GM cannot edit global config

### Player override permissions

- [ ] Player without grant cannot edit personal override
- [ ] GM grants player in `playerOverrideEditors`
- [ ] Granted player can edit/save own override
- [ ] Granted player still cannot edit another player's override

### Trigger activation ownership

- [ ] Player can trigger own mapped wildshape action
- [ ] Behavior is stable when GM has token control vs player has token control

## R5.3 Missing Form and Failure Recovery

### Missing form refs

- [ ] Mapping contains at least one missing/invalid form ref
- [ ] Chooser excludes missing forms and still opens with valid forms
- [ ] Logs warn about missing refs (when debug logging enabled)

### Forced failure recovery

- [ ] Trigger a transform that fails mid-flow (e.g., revoke update permission temporarily)
- [ ] Module reports failure notification
- [ ] Actor state is restored to stable pre-transform snapshot
- [ ] Wildshape action remains usable after recovery

## Optional activation path validation

- [ ] With `Use Chat Fallback = ON`, trigger works
- [ ] With `Use Chat Fallback = OFF`, trigger still works via direct activation path

## Notes

- Record world version, module version, and any reproduction steps for failures.
