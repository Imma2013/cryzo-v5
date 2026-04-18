import { describe, expect, it } from 'vitest';
import { routeDesignReferences } from './design-system';

describe('design system routing', () => {
  const expectPrimary = (prompt: string, slug: string) => {
    expect(routeDesignReferences(prompt).primary?.slug).toBe(slug);
  };

  it('routes phones to apple', () => {
    expectPrimary('build me a phone website', 'apple');
  });

  it('routes pets to cryzo-10', () => {
    expectPrimary('build me a dog lovers website', 'cryzo-10');
  });

  it('routes generic dog prompts to cryzo-10', () => {
    expectPrimary('make me a dog website', 'cryzo-10');
  });

  it('routes regular cars to cryzo-4', () => {
    expectPrimary('build me a regular car website', 'cryzo-4');
  });

  it('routes generic car prompts to cryzo-4', () => {
    expectPrimary('make a car website', 'cryzo-4');
  });

  it('routes luxury cars to cryzo-9', () => {
    expectPrimary('build me a luxury car website', 'cryzo-9');
  });

  it('routes books to cryzo-8', () => {
    expectPrimary('create a book publisher website', 'cryzo-8');
  });

  it('routes furniture to cryzo-3', () => {
    expectPrimary('make a furniture website for designer sofas and chairs', 'cryzo-3');
  });

  it('routes festivals to cryzo-1', () => {
    expectPrimary('make a music festival website with lineup and tickets', 'cryzo-1');
  });

  it('routes payments to stripe', () => {
    expectPrimary('create a payments platform for merchants', 'stripe');
  });

  it('routes deployment platforms to vercel', () => {
    expectPrimary('design a frontend deployment platform for developers', 'vercel');
  });

  it('routes workspaces to notion', () => {
    expectPrimary('create a knowledge workspace for teams', 'notion');
  });

  it('routes design tools to figma', () => {
    expectPrimary('make a collaborative interface design tool', 'figma');
  });

  it('routes travel marketplaces to airbnb', () => {
    expectPrimary('build a travel marketplace for stays and vacation rentals', 'airbnb');
  });

  it('routes observability to sentry', () => {
    expectPrimary('create an error tracking and observability platform', 'sentry');
  });

  it('routes terminal apps to warp', () => {
    expectPrimary('design a modern terminal app for developers', 'warp');
  });

  it('routes docs sites to mintlify', () => {
    expectPrimary('build an api docs site for developers', 'mintlify');
  });

  it('routes databases to supabase when the prompt describes app backend infra', () => {
    expectPrimary('build a postgres backend platform for app developers', 'supabase');
  });

  it('keeps pet prompts away from ferrari', () => {
    expect(routeDesignReferences('build a pet website for dog lovers').primary?.slug).not.toBe('ferrari');
  });

  it('hard-locks to a single primary design reference', () => {
    expect(routeDesignReferences('make me a dog website').supporting).toEqual([]);
  });
});
