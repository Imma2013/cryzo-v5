import { describe, expect, it } from 'vitest';
import {
  buildCanonicalDesignPreamble,
  compileDesignReferenceBrief,
  formatDesignSchemeOverrides,
} from './design-guidance';

describe('design guidance prompt helpers', () => {
  it('formats runtime overrides when present', () => {
    const result = formatDesignSchemeOverrides({
      palette: { primary: '#123456' },
      font: ['serif'],
      features: ['shadow'],
    });

    expect(result).toContain('FONT: ["serif"]');
    expect(result).toContain('PALETTE: {"primary":"#123456"}');
    expect(result).toContain('FEATURES: ["shadow"]');
  });

  it('omits canonical block when design.md is unavailable', () => {
    const result = buildCanonicalDesignPreamble({
      designScheme: {
        palette: { primary: '#123456' },
        font: ['serif'],
        features: ['shadow'],
      },
    });

    expect(result).not.toContain('<canonical_design_system>');
    expect(result).toContain('Optional runtime design overrides');
    expect(result).toContain('secondary hints only');
  });

  it('prioritizes the canonical design reference library over runtime overrides', () => {
    const result = buildCanonicalDesignPreamble({
      libraryPath: 'vendor/awesome-design-md/design-md',
      availableReferences: ['stripe', 'vercel'],
      selectedReferences: [
        {
          slug: 'vercel',
          relativePath: 'vendor/awesome-design-md/design-md/vercel/DESIGN.md',
          excerpt: '# Design System\nUse editorial layouts.',
          markdown: `# Vercel

## Identity
Minimal developer platform.

## Signature Markers
- Severe minimal technical framing.
- Controlled headlines.

## Must Keep
- Keep the page crisp.

## Must Avoid
- Do not turn Vercel into Cryzo-loudness.

## Section Archetypes
- Minimal technical hero.

## Anti-Drift Fail Conditions
- the result could be mistaken for a generic AI-generated startup landing page
`,
        },
      ],
      selectionSource: 'canonical',
      designScheme: {
        palette: { primary: '#123456' },
        font: ['serif'],
        features: ['shadow'],
      },
    });

    expect(result).toContain('`vendor/awesome-design-md/design-md` is the canonical generic design reference library');
    expect(result).toContain('<design_execution_brief slug="vercel"');
    expect(result).toContain('Signature markers:');
    expect(result).toContain('Severe minimal technical framing.');
    expect(result).toContain('If an override conflicts with the selected design references, ignore the override');
    expect(result).toContain('LOCKED PRIMARY REFERENCE: vercel');
    expect(result).toContain('binding visual blueprint');
    expect(result).toContain('signature markers, must-keep traits, must-avoid traits, section archetypes');
  });

  it('forbids unrelated brand drift when a primary reference is selected', () => {
    const result = buildCanonicalDesignPreamble({
      libraryPath: 'vendor/awesome-design-md/design-md',
      availableReferences: ['cryzo-10', 'apple'],
      selectedReferences: [
        {
          slug: 'cryzo-10',
          relativePath: 'vendor/awesome-design-md/design-md/cryzo-10/DESIGN.md',
          excerpt: '# Design System\nUse surreal dog-editorial composition.',
          markdown: `# Cryzo 10

## Identity
Surreal dog-editorial composition.

## Signature Markers
- Poster-like vertical chapters.
`,
        },
      ],
      selectionSource: 'canonical',
    });

    expect(result).toContain('Do not describe the output as Apple-inspired, Stripe-inspired, Ferrari-inspired');
    expect(result).toContain('follow the primary reference and ignore the generic premium instinct');
    expect(result).toContain('Do not normalize an editorial, weird, asymmetrical, or poster-like reference into a safer startup layout.');
  });

  it('compiles canonical markdown into a compact execution brief', () => {
    const result = compileDesignReferenceBrief({
      slug: 'apple',
      relativePath: 'vendor/awesome-design-md/design-md/apple/DESIGN.md',
      excerpt: 'fallback excerpt',
      markdown: `# Apple

## Identity
Hardware keynote restraint.

## Signature Markers
- Quiet product staging.
- Large calm product imagery.

## Must Keep
- Keep one dominant device family.

## Must Avoid
- Do not add busy feature-card grids.

## Section Archetypes
- Hero keynote frame.

## Anti-Drift Fail Conditions
- the page reads like a generic SaaS landing page rather than a product keynote
`,
      source: 'canonical',
    });

    expect(result.identity).toBe('Hardware keynote restraint.');
    expect(result.signatureMarkers).toEqual(['Quiet product staging.', 'Large calm product imagery.']);
    expect(result.mustKeep).toEqual(['Keep one dominant device family.']);
    expect(result.mustAvoid).toEqual(['Do not add busy feature-card grids.']);
    expect(result.sectionArchetypes).toEqual(['Hero keynote frame.']);
    expect(result.failConditions).toEqual([
      'the page reads like a generic SaaS landing page rather than a product keynote',
    ]);
  });

  it('labels degraded fallback mode explicitly', () => {
    const result = buildCanonicalDesignPreamble({
      libraryPath: 'vendor/awesome-design-md/design-md',
      availableReferences: ['apple'],
      selectedReferences: [
        {
          slug: 'apple',
          relativePath: 'vendor/awesome-design-md/design-md/apple/DESIGN.md',
          excerpt: '# Design System\nFallback extract.',
        },
      ],
      selectionSource: 'fallback',
    });

    expect(result).toContain('fallback mode');
    expect(result).toContain('do not pretend this is a richer multi-reference library extract');
  });
});
