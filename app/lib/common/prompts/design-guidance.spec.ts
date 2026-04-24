import { describe, expect, it } from 'vitest';
import { buildCanonicalDesignPreamble, formatDesignSchemeOverrides } from './design-guidance';

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
    expect(result).toContain('Use editorial layouts.');
    expect(result).toContain('If an override conflicts with the selected design references, ignore the override');
    expect(result).toContain('LOCKED PRIMARY REFERENCE: vercel');
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
        },
      ],
      selectionSource: 'canonical',
    });

    expect(result).toContain('Do not describe the output as Apple-inspired, Stripe-inspired, Ferrari-inspired');
    expect(result).toContain('follow the primary reference and ignore the generic premium instinct');
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
