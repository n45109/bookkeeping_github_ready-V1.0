# Active Cleanup Baseline

Last updated: 2026-06-09

This file is the active reminder document for future Codex work on this project.
Read this first before doing major edits.

## Current mission

The current mission is not feature expansion.

The current mission is:

- clean the foundation
- reduce confusion
- keep extension slots
- make future feature work safer

## Do first

1. protect database upgrades during server deployment
2. clean encoding-polluted files
3. re-check organization isolation and permissions
4. simplify confusing or overgrown logic

## Do not do first

- do not rush into new business pages
- do not add complex new workflows before cleanup
- do not trust old helper scripts without re-reading them

## Known facts to remember

- `organization_id` is the true isolation key
- organization display name is only display text
- `神秘组织` is valid business text; past issues were more likely encoding pollution than core logic failure
- migrations exist, but deployment safety is still incomplete
- logs already showed `no such table`, `database is locked`, and foreign-key problems
- organization isolation verification script has been reworked and passes on temp copied DB
- current frontend cleanup baseline already centralizes:
  - login success initialization
  - preview save/clear button state
  - report save/delete button state

## Cleanup order

### Phase 1

Deployment and database safety

### Phase 2

Encoding/document/script cleanup

### Phase 3

Permission validation and complexity slimming

Current focus inside Phase 3:

- keep shrinking `static/app.js`
- prefer shared state helpers over repeated DOM toggles
- keep boss/staff visibility rules enforced in backend/database scope, not in frontend tricks
- keep running balance semantics aligned across backend, report editing, and export
- current preferred running balance rule is:
  - `date` ascending first
  - `id` ascending as same-day tie-breaker

Current focus inside Phase 1 right now:

- turn deployment safety into a repeatable verification loop
- keep `verify_org_isolation.py` as a special-purpose permission check
- add `verify_post_upgrade_checks.py` as the full post-upgrade regression check
- separate automatic backend checks from manual browser/business acceptance

### Phase 4

Feature work resumes on top of clean ground

## Working attitude

When making future edits:

- prefer root-cause fixes
- prefer readable structure over patch stacking
- preserve modular extension points
- keep the product simple for non-technical older users

