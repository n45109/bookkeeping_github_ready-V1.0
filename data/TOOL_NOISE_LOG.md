# Tool Noise Log

Last updated: 2026-06-09

This file tracks tool calls that were not part of intended project work,
so they can be reviewed later and ignored or cleaned up if needed.

## Recorded noise

1. 2026-06-09
- Several no-op or irrelevant internal tool triggers happened during long cleanup turns.
- They did not modify project files or change runtime state in a meaningful way.
- Known examples include:
  - repeated accidental `zz` tool triggers
  - a few irrelevant tool calls that were immediately ignored in commentary
  - another accidental `zz` trigger happened after this file was created during the report-risk fix stage
  - another accidental `zz` trigger happened during local service troubleshooting after browser access checks
  - another accidental `zz` trigger happened while comparing browser refresh behavior with local health checks
  - another accidental `zz` trigger happened during the balance-rule cleanup stage while gathering stage-close evidence
  - another accidental irrelevant tool-search trigger happened while resuming the deployment-verification stage
  - another accidental `zz` trigger happened while wiring the deployment-verification review loop
  - another accidental `zz` trigger happened while gathering database context for the new verification script
  - two more accidental `zz` triggers happened while integrating the review-agent feedback into the deployment verification stage
  - another accidental `zz` trigger happened during post-upgrade script self-test after the first validation failure

## Rule going forward

- Record future irrelevant tool triggers here.
- Do not treat them as product changes.
- Before any cleanup conclusion, quickly review whether any recorded noise created files,
  logs, or state that should be removed.
