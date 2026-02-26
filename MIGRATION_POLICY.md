# Migration Policy

Date: 2026-02-26
Module: `shape-so-nice`

## Schema Versioning

- Canonical schema version is `SCHEMA_VERSION` in:
  - `src/ts/constants.ts`
- Current value: `1`

Versioned payloads:
- global config (world setting)
- player override config (user flag)
- actor wildshape state (actor flag)

## Policy

1. Backward compatibility is best-effort within major release line.
2. New schema changes must:
   - bump `SCHEMA_VERSION`
   - add deterministic migration step(s)
   - include tests for migration success and invalid payload fallback
3. Migrations must be idempotent.
4. If migration cannot safely produce valid data, fallback to defaults and log structured warning events.

## Current Migration Stub

Migration entry points:
- `migrateGlobalConfigToCurrentSchema(rawConfig)`
- `migratePlayerOverrideConfigToCurrentSchema(rawConfig)`

File:
- `src/ts/config/migrations.ts`

Current behavior:
- accepts already-valid current schema payloads
- supports legacy/unversioned (`version` missing) and `version: 0` payload shape promotion to schema `1`
- rejects unsupported future/unknown versions
- preserves safety-first fallback behavior

## Future Migration Checklist

When schema changes to `N+1`:
1. Add `vN -> vN+1` migration transform(s).
2. Extend migration tests in `tests/ts/config/migrations.test.ts`.
3. Add release notes section describing migration impact.
4. Validate via manual QA before RC cut.
