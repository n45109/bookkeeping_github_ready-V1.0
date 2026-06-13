# Agent Rules For This Project

Last updated: 2026-06-07

These rules are written for future work on this project.

## 1. Be explicit about unsolved issues

If a problem cannot be solved in the current step, say so directly.
Do not pretend it is solved.
Do not guess when uncertainty is material.

## 2. Check logs when errors appear

When an error occurs, explicitly consider whether logs should be checked.

Priority log files:

- `data/error.log`
- `data/app.log`
- `data/start-app.err.log`
- `data/start-app.log`

If startup fails, logs are part of the default diagnosis path.

## 3. Update the three project documents after major changes

After a module or major block of work is completed, review whether these files need updates:

- `data/PROJECT_ARCHITECTURE.md`
- `data/PROJECT_GUARDRAILS.md`
- `data/AGENT_RULES.md`

These files must stay synchronized with the actual project state.

If the change affects permissions or organization logic, also review:

- `data/verify_org_isolation.py`

## 4. Do not casually simplify official architecture

Do not remove or collapse these design choices without strong reason:

- dual startup mode
- shared `records` table
- `organization_id`
- `owner_user_id`
- `created_by_user_id`
- compatibility fields kept intentionally

## 5. Prefer root-cause fixes

When possible:

- fix the actual cause
- avoid superficial patches
- avoid hidden behavior changes

## 6. Preserve extension space

Different bosses may request different behavior later.
When in doubt, prefer designs that preserve controlled extension points.

## 7. Permission logic must stay centralized

Prefer changing permission scope in centralized backend logic first.
Avoid spreading ad hoc permission checks everywhere.

## 8. Permission changes should stay verifiable

If organization or role logic changes:

- consider log inspection if behavior is unexpected
- rerun `data/verify_org_isolation.py`
- update project memory docs if the official rule changed
- keep validation runs off the main working database when a temporary copy is practical

If organization-structure UI behavior changes:

- verify boss/admin management path
- verify staff read-only path
- then sync the three project memory documents

When a control is intentionally unavailable for staff:

- prefer disabled UI state first
- do not rely only on click-then-error experience

## 9. Encoding and stability checks

When Chinese text appears garbled:

- do not assume database corruption from PowerShell console output alone
- verify database values through Python/SQLite or normal browser/API JSON path
- avoid validating Chinese write paths through PowerShell payloads when a UTF-8-safe path is available

When startup or login becomes unstable:

- check logs first
- then inspect SQLite lock behavior and recent write-path changes
- if deployment or migration was involved, also verify:
  - whether `data/` was backed up before update
  - whether schema version and critical columns were upgraded completely
  - whether migration backup files were created in `data/backups`
