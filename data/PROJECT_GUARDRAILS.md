# Project Guardrails

Last updated: 2026-06-07

This file lists the project rules that must not be casually broken.

## 1. Startup guardrails

- Keep dual startup mode
- Do not remove `start.bat`
- Do not remove `launcher.py`
- Do not remove `start.sh`
- Do not remove `bookkeeping.service`

Reason:

- development startup and production startup serve different environments

## 2. Data model guardrails

- Keep one shared `records` table
- Do not create one table per employee
- Keep `organization_id` on records
- Keep `owner_user_id` on records
- Keep `created_by_user_id` on records
- Do not casually delete `records.user_id`

Reason:

- future boss requirements may differ
- compatibility and extension space must remain

Organization identity rule:

- use `organization_id` for identity, isolation, and permission checks
- use `organizations.name` only for UI display
- never use display name text as permission key or organization matcher

## 3. Permission guardrails

All record access must follow:

1. identify current user
2. filter by `organization_id`
3. then apply role rule

Role rule:

- boss/admin: can view and manage all records inside own organization
- staff: can only view and manage owned records inside own organization

Official staff scope:

- `organization_id = current_user.organization_id`
- `owner_user_id = current_user.id`

## 4. UI guardrails

- Keep one shared UI for now
- Do not split boss and staff into separate pages unless really needed
- Visibility differences should be enforced by backend scope first
- Organization structure panel is shared too
- Management actions inside that panel must stay boss/admin only
- Staff must remain read-only in that panel
- Organization rename action must stay boss/admin only
- Staff-side controls should prefer disabled state over clickable failure where practical
- Organization name should render as plain text by default, with separate `修改` entry into edit mode
- Do not expose internal organization numbering or IDs to end users as display names
- Do not casually switch the organization panel back to the wide `settings-grid` layout unless intentionally redesigning it

## 5. Change guardrails

When changing logic in future:

- update `PROJECT_ARCHITECTURE.md`
- update `PROJECT_GUARDRAILS.md`
- update `AGENT_RULES.md` if execution rules changed

These docs are part of the project memory and must stay in sync.

## 6. Verification guardrails

- keep `data/verify_org_isolation.py`
- rerun it after permission-related changes
- validation scripts should prefer temporary copied databases over the primary working database
- if UI text behavior is unexpected, inspect both `static/index.html` and `static/app.js`
- if write behavior is unstable, inspect logs and validate SQLite lock handling first
- before every production update, back up `data/`
- do not treat table existence alone as proof that database state is ready; schema version and critical columns matter too

Reason:

- organization isolation is a core requirement and must stay testable

