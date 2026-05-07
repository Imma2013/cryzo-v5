# Codex Workflow Orchestration

This file defines how Codex-style agents should work in this repository. Follow it unless a higher-priority system, developer, or tool instruction says otherwise.

## Operating Mode

- Enter plan mode for any non-trivial task: 3+ meaningful steps, architectural decisions, migrations, external integrations, unclear verification, or meaningful product tradeoffs.
- Use plan mode for verification strategy, not only implementation strategy.
- Write detailed specs before implementation so the task is decision-complete.
- If something goes sideways, stop and re-plan immediately. Do not keep pushing through failing tests, contradictory requirements, broken assumptions, or a hacky path.

## Task Management

- At session start, review `tasks/lessons.md` for rules relevant to the current project and task.
- Before non-trivial implementation, write `tasks/todo.md` with checkable items covering plan, progress, verification, and review.
- Check in before starting implementation when the plan changes user-visible behavior, data flow, billing, auth, deployment, or external integrations.
- Track progress by updating checkboxes as work completes.
- Explain changes at a high level while working, especially before file edits and after verification.
- Before marking done, add a review/results section to `tasks/todo.md` with what changed, what was verified, and any remaining risk.

## Subagent Strategy

- Use subagents liberally when they are available and permitted.
- Offload focused research, repo exploration, independent verification, and parallel analysis to subagents to keep the main context clean.
- For complex problems, use more compute rather than overloading one thread.
- Give each subagent one clear tack with a bounded output. The main agent owns final decisions, integration, and user-facing summary.

## Self-Improvement Loop

- After any user correction, update `tasks/lessons.md` with the mistake pattern and a prevention rule.
- Write rules as future triggers, not vague reminders.
- Revisit and refine lessons until the same class of mistake stops recurring.

## Verification Before Done

- Never mark a task complete without proving it works.
- Use the strongest practical evidence: targeted tests, typecheck, lint, logs, screenshots, API responses, or behavior diffs against `main`.
- When relevant, compare behavior before and after the change.
- If verification is blocked, state the blocker, what was still checked, and the residual risk.
- Ask: would a staff engineer approve this evidence?

## Elegance Gate

- For non-trivial changes, pause before finalizing and ask whether there is a simpler, more elegant root-cause solution.
- If a fix feels hacky, reframe it as: knowing everything now, implement the elegant solution.
- Skip this gate for simple, obvious fixes. Do not over-engineer small changes.
- Keep impact minimal. Touch only the code needed to solve the problem.

## Autonomous Bug Fixing

- For bug reports, investigate and fix without asking for hand-holding.
- Find logs, errors, failing tests, and root causes, then resolve them.
- Go fix failing CI tests without requiring the user to explain the implementation path.
- Ask only when blocked by missing credentials, destructive choices, ambiguous product intent, or external decisions that cannot be inferred.

## Project Stack

- Supabase owns auth and database behavior.
- Vercel owns hosting and production deployment.
- Stripe owns payments and billing.
- GitHub owns source control and repository workflows.
- Composio CLI is the preferred path for connected-service workflows when available.

## Core Principles

- Simplicity first: make every change as simple as possible.
- No laziness: find root causes and avoid temporary fixes.
- Minimal impact: avoid broad rewrites, unrelated refactors, and new bug surface.
- Senior developer standard: verify, document results, and challenge your own work before presenting it.
