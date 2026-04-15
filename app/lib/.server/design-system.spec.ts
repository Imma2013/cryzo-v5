import { describe, expect, it } from 'vitest';
import { getDesignReferenceLibrary, routeDesignReferences, selectDesignReferenceDocs } from './design-system';

describe('design system reference selection', () => {
  it('covers the whole design library', () => {
    const result = getDesignReferenceLibrary();

    expect(result.length).toBeGreaterThan(60);
    expect(result.some((reference) => reference.slug === 'cryzo-4')).toBe(true);
    expect(result.some((reference) => reference.slug === 'apple')).toBe(true);
    expect(result.some((reference) => reference.slug === 'stripe')).toBe(true);
  });

  it('routes standard automotive prompts to cryzo-4 first', () => {
    const result = selectDesignReferenceDocs('make me a car website', 3);

    expect(result[0]?.slug).toBe('cryzo-4');
  });

  it('routes luxury automotive prompts to cryzo-9 first', () => {
    const result = selectDesignReferenceDocs('make me a luxury car website', 3);

    expect(result[0]?.slug).toBe('cryzo-9');
  });

  it('routes racecar prompts to cryzo-9 first', () => {
    const result = selectDesignReferenceDocs('make me a racecar website', 3);

    expect(result[0]?.slug).toBe('cryzo-9');
  });

  it('routes phone and device prompts to apple', () => {
    const result = selectDesignReferenceDocs('build a premium phone website for a new smartphone launch', 3);

    expect(result[0]?.slug).toBe('apple');
  });

  it('routes phone ecommerce prompts to apple instead of automotive luxury references', () => {
    const result = selectDesignReferenceDocs('make me a website for selling phones', 2);
    const slugs = result.map((reference) => reference.slug);

    expect(result[0]?.slug).toBe('apple');
    expect(slugs).not.toContain('tesla');
  });

  it('routes docs prompts to docs-oriented references instead of generic hosting defaults', () => {
    const result = selectDesignReferenceDocs('create a documentation site for our API and developer guides', 2);
    const slugs = result.map((reference) => reference.slug);

    expect(slugs).toContain('mintlify');
    expect(result[0]?.slug).not.toBe('vercel');
  });

  it('routes payments prompts to stripe', () => {
    const result = selectDesignReferenceDocs('design a modern payments and billing dashboard for merchants', 2);

    expect(result[0]?.slug).toBe('stripe');
  });

  it('routes pet prompts to cryzo-10 first', () => {
    const result = selectDesignReferenceDocs('make me a pet wellness website for a dog brand', 3);

    expect(result[0]?.slug).toBe('cryzo-10');
  });

  it('routes dog website prompts to cryzo-10 first', () => {
    const result = selectDesignReferenceDocs('make me a dog website', 3);

    expect(result[0]?.slug).toBe('cryzo-10');
  });

  it('routes plural dogs prompts to cryzo-10 first', () => {
    const result = selectDesignReferenceDocs('make me a website for dogs', 3);

    expect(result[0]?.slug).toBe('cryzo-10');
  });

  it('keeps apple out of primary position for dog prompts', () => {
    const result = routeDesignReferences('make me a website for dogs', 3);

    expect(result.primary?.slug).toBe('cryzo-10');
    expect(result.ranked[0]?.slug).toBe('cryzo-10');
    expect(result.ranked[0]?.slug).not.toBe('apple');
  });

  it('routes travel concierge prompts to cryzo-6 first', () => {
    const result = selectDesignReferenceDocs('create a luxury travel concierge homepage with curated journeys', 3);

    expect(result[0]?.slug).toBe('cryzo-6');
  });

  it('routes dining prompts to cryzo-7 first', () => {
    const result = selectDesignReferenceDocs('design a fine dining nightlife restaurant website', 3);

    expect(result[0]?.slug).toBe('cryzo-7');
  });

  it('returns internal ranked diagnostics for the top references', () => {
    const result = routeDesignReferences('make me a car website', 3);

    expect(result.primary?.slug).toBe('cryzo-4');
    expect(result.ranked[0]?.slug).toBe('cryzo-4');
    expect(result.ranked[0]?.reasons.some((reason) => reason.startsWith('house:'))).toBe(true);
    expect(result.matchedSignals.length).toBeGreaterThan(0);
  });

  it('keeps generic car prompts in cryzo instead of drifting to external car brands', () => {
    const result = selectDesignReferenceDocs('make me a car website', 3);

    expect(result[0]?.slug).toBe('cryzo-4');
    expect(result[0]?.slug).not.toBe('bmw');
    expect(result[0]?.slug).not.toBe('tesla');
  });

  it('routes explicit external brand style requests directly', () => {
    const result = selectDesignReferenceDocs('use BMW design language for a premium car website', 2);

    expect(result[0]?.slug).toBe('bmw');
  });

  it('treats explicit company names as deterministic routing signals when style intent is explicit', () => {
    const result = selectDesignReferenceDocs('use Apple design language for a premium phone store', 2);

    expect(result[0]?.slug).toBe('apple');
  });
});
