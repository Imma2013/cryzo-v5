# Design Reference Audit Workflow

Use this workflow when a canonical design reference feels directionally correct but still too tidy or generic in generation.

## Goal

Extract the source design DNA of a reference and convert it into stronger `DESIGN.md` guardrails without changing the routing layer.

## Workflow

1. Confirm the router is selecting the correct primary slug.
2. Review the source reference in a real browser.
3. Capture the traits that make the source unmistakable:
   - layout DNA
   - scale behavior
   - palette dominance
   - type tension
   - imagery treatment
   - spacing discipline
   - interaction tone
4. Convert those traits into:
   - `Signature Markers`
   - `Must Keep`
   - `Must Avoid`
   - `Section Archetypes`
   - `Anti-Drift Fail Conditions`
5. Update `scripts/sync-design-library.mjs` so the canonical `DESIGN.md` stays generated from source-controlled rules.
6. Regenerate `vendor/awesome-design-md/design-md/*/DESIGN.md`.
7. Tighten `app/lib/common/prompts/design-guidance.ts` if the design family still normalizes into a safer layout.
8. Verify routing tests still pass and confirm the prompt layer now carries the sharper reference lock.

## Calibration Notes

### Cryzo 10 / Bark Studio

The Bark Studio reference should push Cryzo 10 toward:

- poster-like vertical chaptering instead of a normal marketing stack
- giant acidic display type that competes with imagery
- hard color fields rather than tasteful accent-only usage
- fashion-editorial dog imagery instead of lifestyle pet commerce
- awkward-beautiful spacing and confrontational composition
- camp, art-directed tone instead of polished startup friendliness

If Cryzo 10 output becomes balanced, tasteful-safe, or generic-agency-clean, treat that as reference drift and tighten the canonical rules again.
