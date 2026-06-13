# 1.0 Cleanup Checklist

Last updated: 2026-06-14

This file tracks old environment artifacts, noisy runtime leftovers, and
cleanup candidates that should be reviewed before calling the bookkeeping
project fully closed for version 1.0.

## A. Likely safe runtime noise

These are usually recreatable and should not be treated as business data:

- `__pycache__/`
- `data/__pycache__/`
- `data/_verify_tmp/`
- `data/exports/`

## B. Old environment candidates

Current status:

- `venv_broken_20260607/` has already been removed

Judgment:

- no abandoned broken virtual environment is currently left in the project root

## C. Historical logs to review

Current status:

- historical one-off service logs listed in `cleanup_legacy_artifacts.ps1` have already been deleted
- `data/manual-uvicorn.err.log` and `data/manual-uvicorn.out.log` were also removed after stopping the local temporary service

Remaining active logs:

- `data/app.log`
- `data/error.log`

Judgment:

- only the normal application logs remain
- no obvious stale service log pile-up is blocking the 1.0 cleanup target

## D. Keep as product memory

These should stay:

- `data/ACTIVE_CLEANUP_BASELINE.md`
- `data/AGENT_RULES.md`
- `data/PROJECT_ARCHITECTURE.md`
- `data/PROJECT_GUARDRAILS.md`
- `data/PROJECT_HEALTH_REPORT_20260609.md`
- `data/TOOL_NOISE_LOG.md`

## E. Keep as release safety tooling

These are now part of the release/upgrade safety workflow and should stay:

- `data/verify_startup_health.py`
- `data/verify_org_isolation.py`
- `data/verify_post_upgrade_checks.py`
- `data/verify_release_gate.py`

Additional active verification tools kept on purpose:

- `data/verify_admin_dashboard.py`
- `data/verify_boss_report_views.py`
- `data/verify_password_management.py`
- `data/verify_role_management_flow.py`

## F. Current judgment

No strong evidence was found in the current `data/*.md` and `data/*.py`
project memory files that core 1.0 guidance is still blocked by large-scale
encoding corruption.

Remaining cleanup work is now optional hygiene only, mainly:

- pruning future temporary export files in `data/exports/`
- continuing to keep release tooling trustworthy
- reducing project noise during later iterations when clearly safe
