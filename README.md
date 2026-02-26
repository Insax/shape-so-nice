# Wildshape Companion (Shape So Nice)

Foundry VTT addon for safe, reversible druid wildshape automation.

Current mapping model:
- `trigger item name -> one or more form refs`
- form refs support `mode: "uuid"` or `mode: "name"`

Primary references:
- `AGENTS.md` for frozen architecture and guardrails
- `SPEC.md` for phase-1 contract details
- `TASKS.md` for milestone-by-milestone delivery order
- `NIMBLE_CONFORMANCE.md` for verified Nimble runtime assumptions
- `MIGRATION_POLICY.md` for schema and migration policy
- `QA_CHECKLIST.md` for manual release validation
- `RELEASE_NOTES_0.1.0.md` for release-candidate draft notes

## Compatibility

- Foundry core: `13` (minimum/verified/maximum)
- Module version: `0.1.0`
- Primary target system: Nimble

## Install (Foundry)

1. Build the module:
   - `npm install`
   - `npm run build`
2. Ensure `dist/` is available as a Foundry module directory.
3. In Foundry:
   - `Game Settings -> Manage Modules -> Install Module`
   - Use local manifest/module installation flow for your environment.
4. Enable `Wildshape Companion` in the world.

## GM Setup

1. Open `Game Settings -> Module Settings -> Wildshape Global Config`.
2. Add mappings:
   - Trigger ability/item name
   - One or more form refs (`name` or `uuid`)
3. Configure per-mapping filters (`whitelist`/`blacklist`).
4. Optionally map form abilities by UUID.
5. Configure:
   - `Show Debug Logs`
   - `Use Chat Fallback` (on/off)
6. Optionally grant player override editors via `playerOverrideEditors`.

## Player Usage

1. Use a mapped wildshape ability.
2. Choose a form in the chooser dialog.
3. While shaped:
   - Re-open chooser from wildshape action to reshape
   - Choose `Original Form` to revert quickly

## Known Limits (Phase 1)

- No compendium form source (world actors only)
- No duration-based automatic reversion
- No cross-scene batch transform tooling
- Manual QA in live table is still required before release candidate

## Development

- Install: `npm install`
- Build: `npm run build`
- Watch: `npm run watch`
- Test: `npm test`
- Coverage: `npm run test:coverage`
