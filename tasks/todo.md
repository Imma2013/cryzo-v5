# Task Todo

## Goal

- [x] Make deployed Composio chat tools stop failing with the missing API key error and verify production sees the configured key.

## Plan

- [x] Review relevant entries in `tasks/lessons.md`.
- [x] Identify affected files, systems, and external services.
- [x] Write the implementation approach before editing.
- [x] Confirm the plan with the user when behavior, data, billing, auth, deployment, or integrations are affected.

## Progress

- [x] Implementation not started.
- [x] Core changes completed.
- [x] Edge cases handled.
- [x] Documentation or comments updated where needed.

## Verification

- [ ] Run targeted tests or checks.
- [x] Run broader validation when risk justifies it.
- [x] Compare behavior before and after when relevant.
- [x] Record any blocked verification with the reason and residual risk.

## Review / Results

- Summary: Added VITE-prefixed Composio diagnostics and made the diagnostics endpoint use the same API key resolver as chat runtime.
- Verification evidence: `git diff --check` passed. Vercel deployment `dpl_8hahZE9eLMTKQwBJMMpuFFoocYE9` promoted, and production diagnostics returned `environment.hasComposioApiKey: true` with `VITE_COMPOSIO_API_KEY: true`.
- Remaining risks: Local Vitest and typecheck could not run because this shell has no `node`, `npm`, or `pnpm` executable on PATH.
- Follow-up tasks: None identified.

## Open Questions / Blockers

- None.
