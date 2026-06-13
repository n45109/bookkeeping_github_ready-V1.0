# Project Health Report

Last updated: 2026-06-09

This file is the plain-language health report for the current stage of the bookkeeping project.
It is written to help future work stay focused when context becomes long or fragmented.

## 1. Project stage summary

The product has already moved beyond a simple single-user bookkeeping tool.

It is now a multi-user bookkeeping system with:

- voice/text entry
- AI conversion into structured records
- preview before save
- one boss/admin with multiple staff
- organization-level data isolation

The product direction is now clear:

- keep the workflow simple for older users
- keep boss visibility clear
- keep staff operation minimal
- strengthen the technical foundation before adding new features

## 2. Current overall judgment

Current status can be summarized as:

- usable
- directionally correct
- foundation not stable enough yet for fast feature growth

The next phase should prioritize cleanup and stabilization, not feature expansion.

## 3. What is already correct

### Product direction

- shared UI instead of many separate pages
- backend-controlled permissions
- organization identity separated from organization display name
- role design leaves room for future extension

### Backend direction

- there is already schema version tracking
- there is already migration logic
- there is already organization-based scope logic
- there is already log recording for backend and frontend errors
- high-risk permission entry points were re-checked against centralized backend scope logic

### Database direction

- `organization_id` is used as the true isolation key
- `owner_user_id` is already introduced for staff visibility
- compatibility fields are intentionally kept for future extension
- organization isolation verification currently passes again from the latest script run

These are good foundation decisions and should be preserved.

## 4. Main risks right now

### Risk A: deployment and database upgrade flow is not closed-loop

The project already has migration code, but not a full safe-upgrade workflow.

Current gap:

- no mandatory pre-upgrade database backup flow
- no migration rollback flow
- no explicit post-upgrade database verification flow
- no clear deployment checklist for GitHub-to-server updates

This is currently the highest-priority structural risk.

Latest progress:

- deployment flow is now being documented as:
  local change -> GitHub -> server backup -> server update -> automatic verification -> manual acceptance
- `verify_org_isolation.py` remains the permission special-check script
- `verify_post_upgrade_checks.py` has been added as the broader post-upgrade regression script

Remaining caution:

- the closed loop is stronger now, but it still depends on people actually running the scripts after updates
- browser-side Excel download behavior is still a manual acceptance topic, not a backend regression signal

### Risk B: some files show encoding pollution

Confirmed observations:

- core backend files currently store `神秘组织` correctly
- some historical docs/scripts showed garbled Chinese text before
- `verify_org_isolation.py` was cleaned and is now readable again

Interpretation:

- this is more likely a file encoding pollution problem than a business-logic problem
- it must be cleaned before future maintenance becomes confusing

### Risk C: startup/database state can become inconsistent

Observed from logs:

- `no such table: users`
- `database is locked`
- `FOREIGN KEY constraint failed`

Interpretation:

- there have already been states where code and database were not fully aligned
- initialization, migration, and live use are not yet stable enough to fully trust under repeated deployment changes

### Risk D: project complexity grew faster than cleanup

The project started as a single-user tool and then grew into a boss/staff organization system.

This means:

- old assumptions may still remain in some flows
- some modules are carrying compatibility and new logic at the same time
- some helper scripts and docs are no longer equally reliable

This is why the code now needs cleanup and slimming before new business expansion.

### Risk E: running balance semantics were previously aligned to `id`, not business date

Interpretation:

- old logic was internally consistent
- but it could become misleading when users later added older records with earlier dates
- this is a trust risk for bookkeeping, not just a UI detail

## 5. Priority judgment

Official priority order for the next stage:

1. stabilize deployment + database upgrade safety
2. clean encoding-polluted files and untrusted helper scripts
3. verify permission/data isolation again from current real code
4. simplify confused or overly indirect logic
5. only then add new business features

## 6. Recommended cleanup direction

### First cleanup block

Focus on database safety and deployment predictability.

Target outcomes:

- every server update has a backup step
- every schema change has a predictable migration path
- every deployment has a quick verification checklist
- automatic and manual verification boundaries are now being separated on purpose

### Second cleanup block

Focus on text encoding and project memory reliability.

Target outcomes:

- all project memory files are UTF-8 clean
- all validation scripts are readable and trustworthy
- no garbled Chinese remains in files that guide future work

### Third cleanup block

Focus on code slimming.

Target outcomes:

- reduce unclear compatibility branches where possible
- keep extension slots, but remove misleading or dirty paths
- make the product easier to continue evolving like modular building blocks

Current verified progress in this block:

- login success state in `static/app.js` is now centralized
- preview action buttons in `static/app.js` are now centrally controlled
- report save/delete button visibility in `static/app.js` is now centrally controlled
- remaining frontend complexity is now more concentrated in report rendering and filtering, which is a better next cleanup target
- formal running balance rule has now been moved toward:
  - business date first
  - id as same-day tie-breaker

## 7. Product guidance for future features

The target users are older and not comfortable with computers.

So future design must continue to prefer:

- fewer decisions
- clearer labels
- fewer pages
- fewer hidden states
- strong default behavior

For staff users, the ideal feeling is:

- say it
- preview it
- save it

For the boss, the ideal extra ability is:

- see everyone clearly
- manage staff simply
- avoid technical concepts

## 8. Immediate execution recommendation

Do not start with large new features.

Start with a foundation pass:

1. deployment/database safety cleanup
2. encoding pollution cleanup
3. permission and verification script cleanup
4. complexity slimming

After that, continue feature growth on top of a cleaner base.

