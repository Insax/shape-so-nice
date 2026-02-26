# Wildshape Companion (Shape So Nice)

Foundry VTT addon for safe, reversible druid wildshape automation.

Current mapping model:
- `trigger item name -> one or more form refs`
- form refs support `mode: "uuid"` or `mode: "name"`

Primary references:
- `AGENTS.md` for frozen architecture and guardrails
- `SPEC.md` for phase-1 contract details
- `TASKS.md` for milestone-by-milestone delivery order

## Current baseline

The project now includes:
- module constants and schema/version keys
- global config setting registration (`world` scope)
- config typing, validation, and normalization helpers
- adapter interface and registry
- Nimble adapter detection scaffold
- module API that exposes the selected runtime adapter

## Development

- Install: `npm install`
- Build: `npm run build`
- Watch: `npm run watch`
