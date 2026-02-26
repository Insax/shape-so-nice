# Release Candidate Checklist

Date prepared: 2026-02-26
Target version: `0.1.0`

## Pre-RC Gate

- [ ] `npm test` passes
- [ ] `npm run test:coverage` passes
- [ ] `npm run build` passes
- [ ] `QA_CHECKLIST.md` fully executed with PASS/FAIL notes

## Packaging

- [ ] `src/module.json` version and compatibility verified
- [ ] Changelog/release notes prepared (`RELEASE_NOTES_0.1.0.md`)
- [ ] Migration notes verified (`MIGRATION_POLICY.md`)
- [ ] Distribution artifact validated from `dist/`

## Live Table Cycle

- [ ] One real session executed with player usage
- [ ] Feedback captured via `LIVE_TABLE_FEEDBACK_TEMPLATE.md`
- [ ] Critical/major issues triaged and fixed
- [ ] Regression check rerun after fixes

## RC Sign-off

- [ ] GM workflow validated
- [ ] Player workflow validated
- [ ] Transform/revert safety validated
- [ ] Decision recorded: `GO` / `NO-GO`
