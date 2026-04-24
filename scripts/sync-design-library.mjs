import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const designSystemPath = path.join(repoRoot, 'app', 'lib', '.server', 'design-system.ts');
const outputRoot = path.join(repoRoot, 'vendor', 'awesome-design-md', 'design-md');

const SPECIAL_BLUEPRINTS = {
  'apple': {
    title: 'Apple',
    identity:
      'A launch-first consumer hardware system built on obsessive restraint, oversized product imagery, near-silent chrome, and premium confidence.',
    useWhen: [
      'phone websites',
      'device launches',
      'consumer electronics showcases',
      'minimal product keynote pages',
    ],
    rules: [
      'Let one product or hero image dominate the composition.',
      'Use restrained navigation, compact copy blocks, and large headline hierarchy.',
      'Keep surfaces bright, calm, and premium instead of decorative or noisy.',
      'Use motion as subtle reveal, parallax, and product-emphasis polish.',
    ],
    avoid: [
      'dashboard chrome',
      'busy card grids',
      'dark SaaS gradients',
      'automotive or racing language',
    ],
    signatureMarkers: [
      'Layout DNA: keynote-like staging with one dominant product moment per viewport and almost no competing noise.',
      'Scale behavior: giant calm product photography and oversized but quiet headline scale instead of layered marketing clutter.',
      'Palette dominance: bright, near-monochrome surfaces with sparse accent color and immaculate tonal restraint.',
      'Type tension: clean sans hierarchy with no decorative distortion, no loud editorial collision, and extreme copy compression.',
      'Imagery treatment: hero product renders or photographs feel museum-lit, floating, and obsessively polished.',
      'Spacing discipline: huge breathing room, careful margin cadence, and obvious confidence in what is omitted.',
      'Interaction tone: subtle reveal, scroll polish, and hardware-centric micro-motion instead of playful motion spectacle.',
    ],
    mustKeep: [
      'Keep the page anchored to one hero product or one dominant device family at a time.',
      'Keep the chrome nearly silent so the product absorbs most of the visual attention.',
      'Keep the composition restrained enough that every extra card or badge feels suspicious.',
    ],
    mustAvoid: [
      'Do not inject busy feature-card grids just to make the page feel complete.',
      'Do not drift into developer-platform darkness, generic startup gradients, or editorial chaos.',
      'Do not let runtime overrides overpower the near-silent Apple restraint.',
    ],
    sectionArchetypes: [
      'Hero keynote frame with one product image and one dominant statement.',
      'Focused product detail bands or capability callouts with careful hierarchy.',
      'Cinematic product gallery or finish/color story section.',
      'Quiet purchase, compare, or learn-more close instead of a noisy CTA wall.',
    ],
    failConditions: [
      'the page reads like a generic SaaS landing page rather than a product keynote',
      'multiple competing cards or illustrations overpower the hero device',
      'the palette becomes loud, dark, or trend-driven without prompt justification',
    ],
  },
  'stripe': {
    title: 'Stripe',
    identity:
      'A developer-fintech system with precise hierarchy, confident product explanation, modular sections, and quiet technical polish.',
    useWhen: [
      'payments platforms',
      'billing infrastructure',
      'merchant tools',
      'API-led fintech products',
    ],
    rules: [
      'Favor structured storytelling over decorative spectacle.',
      'Blend editorial headlines with trustworthy product explanation.',
      'Use modular product sections, clean diagrams, and contained motion.',
      'Keep color accents deliberate and product-led rather than loud.',
    ],
    avoid: [
      'generic dark AI hero pages',
      'playful consumer-app styling',
      'luxury automotive drama',
    ],
    signatureMarkers: [
      'Layout DNA: modular product-story chapters with strong explanatory rhythm and calm fintech confidence.',
      'Scale behavior: editorial headline moments balanced by dense but orderly supporting product information.',
      'Palette dominance: mostly controlled neutrals with restrained gradient or accent-color punctuation.',
      'Type tension: polished sans-serif hierarchy with smart code-adjacent contrast rather than loud fashion-editorial moves.',
      'Imagery treatment: diagrams, product frames, and payment surfaces are crisp, technical, and trustworthy.',
      'Spacing discipline: modular spacing that feels systematic rather than airy-for-airiness sake.',
      'Interaction tone: precise, polished, and infrastructural rather than playful or dreamy.',
    ],
    mustKeep: [
      'Keep the product explanation structured enough that the system feels real and technically grounded.',
      'Keep trust, legitimacy, and payment-flow clarity dominant over hype.',
      'Keep diagrams, product bands, and modular sections cleaner than a generic startup site.',
    ],
    mustAvoid: [
      'Do not turn Stripe into a moody AI brand world or editorial luxury magazine.',
      'Do not let decorative gradients replace product clarity.',
      'Do not flatten everything into one hero plus generic three-column features.',
    ],
    sectionArchetypes: [
      'Trust-heavy product hero with headline, subcopy, and precise CTA structure.',
      'Modular platform or workflow explainer sections.',
      'Infrastructure, API, or payments network proof bands.',
      'Credibility close with ecosystem, metrics, or enterprise trust signals.',
    ],
  },
  'vercel': {
    title: 'Vercel',
    identity:
      'A minimal developer-platform system with sharp typography, calm premium contrast, systematic sections, and strong product clarity.',
    useWhen: [
      'deployment platforms',
      'frontend cloud tools',
      'developer infrastructure',
      'website builders for technical users',
    ],
    rules: [
      'Use severe restraint and strong spacing discipline.',
      'Let hierarchy, copy clarity, and product framing carry the design.',
      'Prefer quiet gradients, crisp panels, and precise product sections.',
      'Keep motion subtle, fast, and structural.',
    ],
    avoid: [
      'consumer-marketplace energy',
      'overillustrated hero sections',
      'soft generic startup cards',
    ],
    signatureMarkers: [
      'Layout DNA: severe minimal technical framing with product surfaces doing most of the persuasion.',
      'Scale behavior: bold but controlled headlines, strong terminal or dashboard frames, and no theatrical over-scaling.',
      'Palette dominance: black, white, graphite, and restrained gradient haze rather than saturated brand fields.',
      'Type tension: sharp contemporary sans hierarchy with disciplined contrast and no decorative editorial collision.',
      'Imagery treatment: code, deploy flows, or product screenshots feel crisp, exact, and modern.',
      'Spacing discipline: exact spacing and hard alignment rather than expressive asymmetry.',
      'Interaction tone: fast, structural, and product-native with subtle motion only.',
    ],
    mustKeep: [
      'Keep the system restrained enough that it feels like a premium developer platform, not a lifestyle brand.',
      'Keep product surfaces and technical legitimacy more important than decorative storytelling.',
      'Keep the page crisp, sparse, and exact.',
    ],
    mustAvoid: [
      'Do not inject playful consumer color logic or editorial weirdness unless the prompt explicitly asks for it.',
      'Do not let the layout drift into card soup or generic SaaS marketing softness.',
      'Do not turn Vercel into Cryzo-loudness.',
    ],
    sectionArchetypes: [
      'Minimal technical hero with deploy or product framing.',
      'Platform capability bands centered on product outcomes.',
      'Workflow or ecosystem proof section.',
      'Sparse close with technical CTA and product confidence.',
    ],
  },
  'notion': {
    title: 'Notion',
    identity:
      'A calm workspace-editorial system with structured content blocks, quiet utility, and document-first clarity.',
    useWhen: [
      'knowledge workspaces',
      'team docs',
      'editorial productivity products',
      'calm operating systems for teams',
    ],
    rules: [
      'Use strong document rhythm, generous whitespace, and quiet utility UI.',
      'Favor modular content blocks over loud marketing spectacle.',
      'Let typography and structure do more work than color.',
      'Keep interactions calm, legible, and system-like.',
    ],
    avoid: [
      'flashy gradients',
      'aggressive motion',
      'luxury product-launch theatrics',
    ],
  },
  'figma': {
    title: 'Figma',
    identity:
      'A collaborative design-tool system with playful confidence, bright clarity, layered product storytelling, and creative-tool energy.',
    useWhen: [
      'interface design tools',
      'creative collaboration products',
      'prototyping systems',
      'team canvas experiences',
    ],
    rules: [
      'Balance product explanation with a sense of creative possibility.',
      'Use playful but disciplined color moments.',
      'Show collaborative workflows, canvases, components, and creative surfaces.',
      'Keep composition modular and product-demo oriented.',
    ],
    avoid: [
      'plain documentation styling',
      'overly corporate enterprise tone',
      'generic SaaS hero stacks',
    ],
  },
  'airbnb': {
    title: 'Airbnb',
    identity:
      'A travel-marketplace system built around inviting imagery, human warmth, soft premium utility, and destination-led browsing.',
    useWhen: [
      'travel marketplaces',
      'stays and rentals',
      'hospitality discovery flows',
      'experience-led booking products',
    ],
    rules: [
      'Use inviting imagery, warm pacing, and human-centered browsing blocks.',
      'Keep search and discovery flows legible and friendly.',
      'Balance practical marketplace UI with aspirational destination storytelling.',
      'Use soft contrast and rounded controls without becoming generic.',
    ],
    avoid: [
      'hard enterprise tone',
      'developer-platform minimalism',
      'luxury car theatrics',
    ],
  },
  'sentry': {
    title: 'Sentry',
    identity:
      'A technical observability system with dark precision, clear issue framing, systematic hierarchy, and no fluff.',
    useWhen: [
      'error tracking platforms',
      'observability products',
      'incident tooling',
      'developer diagnostics experiences',
    ],
    rules: [
      'Keep layout technical, controlled, and signal-rich.',
      'Use severity, alerts, and code-adjacent surfaces as visual anchors.',
      'Prioritize clarity of product value over lifestyle storytelling.',
      'Use restrained accent color for focus, not decoration.',
    ],
    avoid: [
      'friendly consumer-brand softness',
      'luxury magazine composition',
      'generic AI gradients',
    ],
  },
  'warp': {
    title: 'Warp',
    identity:
      'A modern terminal-tool system with compact utility, technical sharpness, and premium developer ergonomics.',
    useWhen: [
      'terminal apps',
      'command-line tools',
      'developer productivity products',
      'desktop power-user workflows',
    ],
    rules: [
      'Use a dense but polished technical layout.',
      'Show command surfaces, blocks, shortcuts, and workflow speed.',
      'Keep typography crisp and modern with minimal decorative noise.',
      'Favor concise panels and tool-focused interactions.',
    ],
    avoid: [
      'consumer marketplace patterns',
      'soft editorial travel tone',
      'oversized generic SaaS features grids',
    ],
  },
  'linear.app': {
    title: 'Linear',
    identity:
      'A premium product-work system with surgical hierarchy, minimal surfaces, and velocity-oriented product clarity.',
    useWhen: [
      'issue trackers',
      'product planning systems',
      'team execution tools',
      'developer-adjacent productivity products',
    ],
    rules: [
      'Use minimal but premium surfaces with strong contrast discipline.',
      'Let product pace and clarity drive the composition.',
      'Keep sections compact, precise, and fast-feeling.',
      'Use restrained animation and no decorative clutter.',
    ],
    avoid: [
      'friendly bubbly consumer styling',
      'heavy editorial moodboards',
      'generic purple AI hero pages',
    ],
  },
  'supabase': {
    title: 'Supabase',
    identity:
      'A developer database platform system with open-source confidence, technical clarity, and calm modern infrastructure aesthetics.',
    useWhen: [
      'backend platforms',
      'postgres developer tools',
      'database products',
      'app infrastructure experiences',
    ],
    rules: [
      'Use technical clarity and product legitimacy over hype.',
      'Show code, auth, database, and platform capabilities in a structured way.',
      'Keep panels modern and product-led, not generic marketing cards.',
      'Use accent color sparingly to support information hierarchy.',
    ],
    avoid: [
      'consumer brand playfulness',
      'editorial luxury magazine styling',
      'generic AI abstractions with no product grounding',
    ],
  },
  'cryzo-1': {
    title: 'Cryzo 1',
    identity:
      'The Cryzo festival-world lane: cinematic, poster-like, immersive, lineup-driven, and emotionally loaded.',
    useWhen: [
      'music festivals',
      'editorial event brands',
      'lineup and ticket pages',
      'high-energy experience microsites',
    ],
    rules: [
      'Build around one dominant atmosphere or event-world scene.',
      'Use poster-scale typography, lineup hierarchy, and cinematic layering.',
      'Let imagery, glow, motion, and composition feel immersive, not templated.',
      'Make sections feel like chapters of an event world rather than SaaS blocks.',
    ],
    avoid: [
      'generic conference-site layouts',
      'plain card grids',
      'quiet developer-platform minimalism',
    ],
  },
  'cryzo-2': {
    title: 'Cryzo 2',
    identity:
      'The Cryzo spatial 3D lane: dark, object-led, immersive, symbolic, and world-first.',
    useWhen: [
      '3D landing pages',
      'artifact-led experiences',
      'futuristic worlds',
      'immersive cinematic brand sites',
    ],
    rules: [
      'Use one dominant object or spatial scene as the center of gravity.',
      'Favor oversized editorial type, atmospheric lighting, and mono/system accents.',
      'Treat depth as mandatory through real or convincingly simulated 3D.',
      'Make the page feel like entering a world, not reading a template.',
    ],
    avoid: [
      'car-launch fallback aesthetics',
      'flat dark SaaS pages',
      'normal hero/features/footer stacks',
    ],
  },
  'cryzo-3': {
    title: 'Cryzo 3',
    identity:
      'The Cryzo furniture-showcase lane: tactile, showroom-led, editorial, soft-luxury, and object-focused.',
    useWhen: [
      'designer furniture brands',
      'interior object showcases',
      'premium home decor experiences',
      'soft gallery commerce',
    ],
    rules: [
      'Treat furniture pieces like art objects in a curated showroom.',
      'Use warm-neutral palettes, editorial rhythm, and generous breathing room.',
      'Favor large imagery, tactile framing, and quiet luxury details.',
      'Keep commerce supportive rather than dominating the composition.',
    ],
    avoid: [
      'generic ecommerce grids',
      'hard-tech developer styling',
      'automotive or festival energy',
    ],
  },
  'cryzo-4': {
    title: 'Cryzo 4',
    identity:
      'The Cryzo restrained editorial automotive lane: classic, image-led, premium, and calmly authoritative.',
    useWhen: [
      'regular car websites',
      'premium automotive brands',
      'classic car rental pages',
      'curated vehicle collection experiences',
    ],
    rules: [
      'Use a dominant vehicle image and giant condensed editorial typography.',
      'Balance dark framing with warm-neutral accents and restrained polish.',
      'Make each section feel curated rather than salesy or flashy.',
      'Keep the tone premium and classic, not hypercar theatrical.',
    ],
    avoid: [
      'generic AI homepages',
      'Tesla-like EV launch tropes',
      'loud motorsport aggression',
    ],
  },
  'cryzo-5': {
    title: 'Cryzo 5',
    identity:
      'The Cryzo performance-machine manifesto lane: brutal typography, cinematic speed, heat, and mythic machine obsession.',
    useWhen: [
      'hypercar pages',
      'performance-manifesto brands',
      'machine-storytelling experiences',
      'speed-led editorial launches',
    ],
    rules: [
      'Build around typographic force, motion tension, and machine reverence.',
      'Use kinetic sections, stats-as-icons, and image-led chapter transitions.',
      'Keep orange or heat-toned accents active and intentional.',
      'Treat the product as a mythic object, not a normal brochure item.',
    ],
    avoid: [
      'tidy luxury brochure patterns',
      'generic black-and-red car ads',
      'plain feature-card marketing',
    ],
  },
  'cryzo-6': {
    title: 'Cryzo 6',
    identity:
      'The Cryzo concierge travel lane: atmospheric, serif-led, guided, warm-luxury, and destination-rich.',
    useWhen: [
      'travel concierge brands',
      'luxury journeys',
      'curated destination services',
      'premium travel planning experiences',
    ],
    rules: [
      'Use destination atmosphere, elegant serif display type, and calm utility.',
      'Balance wonder with service clarity and guided next steps.',
      'Let sections feel curated and credible rather than marketplace-generic.',
      'Use motion softly to deepen mood, not to create noise.',
    ],
    avoid: [
      'OTA booking-engine layouts',
      'generic startup cards',
      'tech-dashboard travel tooling',
    ],
  },
  'cryzo-7': {
    title: 'Cryzo 7',
    identity:
      'The Cryzo dining-nightlife lane: moody, high-contrast, atmospheric, and culturally specific with premium hospitality drama.',
    useWhen: [
      'fine dining websites',
      'nightlife brands',
      'reservation-led hospitality pages',
      'luxury food culture experiences',
    ],
    rules: [
      'Use darkness, contrast, texture, and refined editorial pacing.',
      'Let hero composition feel scene-first and mood-heavy.',
      'Treat menus, reservations, and brand story as curated experiences.',
      'Use typography and imagery with cinematic restraint.',
    ],
    avoid: [
      'generic restaurant templates',
      'bright consumer-app friendliness',
      'developer-product minimalism',
    ],
  },
  'cryzo-8': {
    title: 'Cryzo 8',
    identity:
      'The Cryzo books-editorial lane: calm, literary, atmospheric, serif-rich, and story-world driven.',
    useWhen: [
      'book publishers',
      'author sites',
      'literary brands',
      'editorial story-world experiences',
    ],
    rules: [
      'Favor editorial rhythm, literary pacing, and generous typography.',
      'Let imagery and copy feel contemplative and atmospheric.',
      'Use sections like chapters rather than product cards.',
      'Keep the experience emotionally rich without becoming ornate.',
    ],
    avoid: [
      'generic content grids',
      'SaaS product marketing layouts',
      'loud cinematic tech styling',
    ],
  },
  'cryzo-9': {
    title: 'Cryzo 9',
    identity:
      'The Cryzo luxury-performance automotive lane: cinematic, futuristic, and hypercar-first with prestige and speed.',
    useWhen: [
      'luxury car websites',
      'supercar launches',
      'motorsport-adjacent editorials',
      'performance automotive showcases',
    ],
    rules: [
      'Use a dominant machine image, cinematic framing, and premium performance tension.',
      'Let layout feel like a manifesto or launch chapter, not a dealership site.',
      'Use futuristic detail, sharp contrast, and controlled aggression.',
      'Keep speed, prestige, and product reverence dominant.',
    ],
    avoid: [
      'generic car inventory grids',
      'quiet classic-car tone',
      'developer-tool or AI brand drift',
    ],
  },
  'cryzo-10': {
    title: 'Cryzo 10',
    identity:
      'The Cryzo playful-editorial pet lane: fashion-forward, expressive, premium, and character-rich without becoming childish.',
    useWhen: [
      'pet brands',
      'dog lover websites',
      'pet commerce with editorial taste',
      'animal-care brands with personality',
    ],
    rules: [
      'Use bold editorial framing, playful energy, and character-led moments.',
      'Keep the brand premium and art-directed rather than cartoonish.',
      'Use surprising typography, image crops, and playful composition.',
      'Let product or content blocks feel styled, not generic ecommerce.',
    ],
    avoid: [
      'sterile minimalism',
      'luxury automotive drama',
      'generic pet-store templates',
    ],
    signatureMarkers: [
      'Layout DNA: poster-like vertical chapters with hard section breaks, oversized headline slabs, and deliberately unruly composition.',
      'Scale behavior: acidic giant typography should bully the viewport and compete with the imagery instead of politely sitting beside it.',
      'Palette dominance: hard color-field logic with sour yellow, powder blue, pink, black, and off-white used as confrontational blocks rather than tasteful accents.',
      'Type tension: condensed uppercase punches collide with expressive serif interruptions and occasional awkward line breaks.',
      'Imagery treatment: fashion-editorial dog photography or surreal pet portraits should feel art-directed, cropped hard, and slightly absurd.',
      'Spacing discipline: embrace tension, compression, and strange breathing rhythms rather than balanced premium neatness.',
      'Interaction tone: camp, art-directed, cheeky, and culturally self-aware instead of polished startup friendliness.',
    ],
    mustKeep: [
      'Keep Cryzo 10 weird, poster-first, and art-directed enough that it cannot be mistaken for premium pet ecommerce.',
      'Keep at least one loud typographic moment and at least one confrontational color-field moment.',
      'Keep the dog or pet imagery feeling like editorial casting, not stock lifestyle content.',
      'Keep the section rhythm feeling like manifesto chapters instead of hero/features/testimonials/footer.',
    ],
    mustAvoid: [
      'Do not tidy the composition into a normal centered hero with balanced cards.',
      'Do not soften the palette into tasteful beige-neutral premium branding.',
      'Do not replace fashion-editorial pet imagery with cute consumer pet-shop visuals.',
      'Do not flatten the type into one safe sans-serif system with predictable line lengths.',
    ],
    sectionArchetypes: [
      'Poster hero with giant headline, hard color field, and one surreal pet-fashion image.',
      'Manifesto or attitude chapter using sparse copy and confrontational scale shifts.',
      'Collection, drop, or styling section framed like a fashion spread rather than a store grid.',
      'Editorial story or culture chapter with asymmetric imagery and serif interruption.',
      'Commanding CTA close that still feels like a poster panel, not a generic footer CTA.',
    ],
    failConditions: [
      'the page becomes a tidy premium pet startup instead of an art-directed editorial poster system',
      'the loud yellow / hard field-color logic disappears and the page turns tasteful-safe',
      'the composition resolves into a generic hero plus feature cards plus testimonials cadence',
      'the imagery feels like stock pet ecommerce photography instead of weird fashion-editorial casting',
    ],
  },
};

function extractReferenceMetadata() {
  const source = fs.readFileSync(designSystemPath, 'utf8');
  const match = source.match(
    /const REFERENCE_METADATA: Record<string, DesignReferenceMetadata> = (\{[\s\S]*?\n\});\n\nfunction createExcerpt/,
  );

  if (!match) {
    throw new Error('Could not locate REFERENCE_METADATA in design-system.ts');
  }

  return vm.runInNewContext(`(${match[1]})`, {});
}

function titleCase(value) {
  return value
    .split(/[\s.-]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatName(slug) {
  if (slug === 'linear.app') {
    return 'Linear';
  }

  if (slug === 'x.ai') {
    return 'xAI';
  }

  if (slug === 'mistral.ai') {
    return 'Mistral AI';
  }

  if (slug === 'opencode.ai') {
    return 'OpenCode AI';
  }

  if (slug === 'together.ai') {
    return 'Together AI';
  }

  return titleCase(slug);
}

function joinPhrases(values) {
  return values.filter(Boolean).join(', ');
}

function toBulletList(values, fallback) {
  const items = values.filter(Boolean);
  const safeItems = items.length > 0 ? items : fallback;

  return safeItems.map((item) => `- ${item}`).join('\n');
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function inferFamilyLabel(slug, metadata) {
  return metadata.family || (slug.startsWith('cryzo-') ? 'cryzo' : 'external');
}

function deriveScaleBehavior(metadata) {
  if (metadata.supportsEditorial) {
    return 'Use at least one oversized moment that sets the emotional scale before explanatory content arrives.';
  }

  if (metadata.supportsMinimalShowcase) {
    return 'Keep scale controlled and deliberate so one product frame or one precise headline leads the page.';
  }

  return 'Use hierarchy with obvious focal moments instead of evenly weighted generic sections.';
}

function derivePaletteBehavior(metadata) {
  if ((metadata.styleKeywords || []).includes('playful')) {
    return 'Palette dominance should use one or two assertive brand colors as intentional fields rather than generic accent sprinkles.';
  }

  if ((metadata.styleKeywords || []).includes('minimal')) {
    return 'Palette dominance should stay restrained, tonal, and disciplined, with accent color used sparingly.';
  }

  if ((metadata.styleKeywords || []).includes('luxury')) {
    return 'Palette dominance should feel rich and selective, leaning on premium contrast rather than rainbow variety.';
  }

  return 'Palette dominance should clearly follow the selected reference category rather than a default purple-on-dark fallback.';
}

function deriveTypeTension(metadata) {
  if (metadata.supportsEditorial) {
    return 'Typography should create visible tension through contrast, chapter rhythm, and scale changes rather than staying uniformly polite.';
  }

  if (metadata.supportsMinimalShowcase) {
    return 'Typography should feel exact and restrained, with minimal decorative flourish.';
  }

  return 'Typography should reflect the selected domain and visual attitude instead of using generic startup-safe hierarchy.';
}

function deriveImageryTreatment(slug, metadata) {
  if ((metadata.categories || []).includes('automotive')) {
    return 'Imagery should be vehicle-led, cropped with intent, and treated as the page’s emotional anchor instead of a supporting thumbnail.';
  }

  if ((metadata.categories || []).includes('travel')) {
    return 'Imagery should be destination-led and atmospheric, carrying mood and aspiration rather than acting as generic filler.';
  }

  if ((metadata.categories || []).includes('hardware')) {
    return 'Imagery should center the product object and make the hardware feel tangible, premium, and hero-worthy.';
  }

  if (slug === 'cryzo-10' || (metadata.keywords || []).some((keyword) => keyword.includes('pet') || keyword.includes('dog'))) {
    return 'Imagery should feel character-led, art-directed, and specific to the selected pet-fashion or pet-brand tone.';
  }

  if ((metadata.categories || []).includes('developer') || (metadata.categories || []).includes('database')) {
    return 'Imagery should privilege product surfaces, code-adjacent UI, diagrams, or technical framing over lifestyle stock scenes.';
  }

  return "Imagery should behave like part of the design system's DNA, not a last-minute decorative filler layer.";
}

function deriveInteractionTone(metadata) {
  if ((metadata.categories || []).includes('developer') || (metadata.categories || []).includes('database')) {
    return 'Interaction tone should feel precise, fast, and product-native rather than playful for its own sake.';
  }

  if (metadata.supportsEditorial) {
    return 'Interaction tone should reinforce chapter transitions, reveals, and editorial pacing instead of defaulting to generic app microinteractions.';
  }

  return 'Interaction tone should stay faithful to the selected reference and avoid interchangeable startup motion language.';
}

function deriveSignatureMarkers(slug, metadata, blueprint) {
  const styleKeywords = joinPhrases(metadata.styleKeywords || []) || blueprint.title;

  return dedupe([
    `Layout DNA: build around ${styleKeywords} composition logic native to ${blueprint.title}, not a generic marketing template.`,
    `Scale behavior: ${deriveScaleBehavior(metadata)}`,
    `Palette dominance: ${derivePaletteBehavior(metadata)}`,
    `Type tension: ${deriveTypeTension(metadata)}`,
    `Imagery treatment: ${deriveImageryTreatment(slug, metadata)}`,
    metadata.supportsEditorial
      ? 'Spacing discipline: let sections breathe or collide like editorial chapters instead of evenly repeating feature blocks.'
      : 'Spacing discipline: keep spacing purposeful and category-correct instead of drifting into generic SaaS rhythm.',
    `Interaction tone: ${deriveInteractionTone(metadata)}`,
  ]);
}

function deriveMustKeep(metadata, blueprint) {
  return dedupe([
    'Keep the selected primary reference in charge of composition, type attitude, palette distribution, imagery framing, and section rhythm.',
    metadata.supportsEditorial
      ? 'Keep the section rhythm chaptered and reference-native rather than collapsing into hero/features/testimonials/footer.'
      : 'Keep the layout native to the reference category rather than using a one-size-fits-all startup structure.',
    blueprint.rules?.[0] || 'Keep the most recognizable behavior of the reference visibly present.',
    blueprint.rules?.[1] || '',
  ]);
}

function deriveMustAvoid(metadata, blueprint) {
  return dedupe([
    'Do not normalize the selected reference into a tidier generic startup homepage just because the prompt is broad.',
    ...((blueprint.avoid || []).slice(0, 4)).map((item) => `Do not drift into ${item}.`),
    metadata.supportsEditorial ? 'Do not flatten the page into balanced cards and polite spacing if the reference depends on tension.' : '',
    'Do not let runtime overrides overpower the selected primary reference.',
  ]);
}

function deriveSectionArchetypes(slug, metadata) {
  if (slug === 'cryzo-10') {
    return [
      'Poster hero with confrontational type and one dominant art-directed pet image.',
      'Manifesto or attitude chapter with sparse, high-tension copy.',
      'Collection or culture spread that feels editorial rather than ecommerce-generic.',
      'Commanding close that still behaves like a poster panel.',
    ];
  }

  if ((metadata.categories || []).includes('automotive')) {
    return [
      'Image-led hero with one dominant vehicle or machine frame.',
      'Story or performance chapter rather than a generic features grid.',
      'Collection, gallery, or ownership section with curated product emphasis.',
      'Booking, inquiry, or launch close with premium restraint.',
    ];
  }

  if ((metadata.categories || []).includes('hardware')) {
    return [
      'Keynote-style hero focused on one product object.',
      'Capability bands or product detail callouts.',
      'Gallery, finish, or ecosystem story section.',
      'Purchase, compare, or learn-more close.',
    ];
  }

  if ((metadata.categories || []).includes('travel') || (metadata.categories || []).includes('hospitality')) {
    return [
      'Atmospheric destination hero.',
      'Curated journey or collection chapter.',
      'Trust, process, or concierge/service proof band.',
      'Plan or book close with calm guidance.',
    ];
  }

  if ((metadata.categories || []).includes('developer') || (metadata.categories || []).includes('database') || (metadata.categories || []).includes('infra')) {
    return [
      'Technical product hero.',
      'Platform capability or workflow explainer band.',
      'Proof, ecosystem, or integration chapter.',
      'Focused product CTA close.',
    ];
  }

  if (metadata.supportsEditorial) {
    return [
      'Scene-setting hero chapter.',
      'Editorial story or manifesto section.',
      'Collection, showcase, or narrative spread.',
      'Closing chapter that preserves the reference tone.',
    ];
  }

  return [
    'Primary hero aligned to the selected reference.',
    'Reference-native proof or capability section.',
    'A supporting showcase or narrative section.',
    'A close that still preserves the chosen system.',
  ];
}

function deriveFailConditions(metadata, blueprint) {
  return dedupe([
    'the result could be mistaken for a generic AI-generated startup landing page',
    metadata.supportsEditorial ? 'the section rhythm collapses into a neat hero/features/testimonials/footer template' : '',
    metadata.supportsMinimalShowcase ? 'the composition becomes cluttered and loses the restraint expected from the reference' : '',
    blueprint.avoid?.[0] ? `the output drifts into ${blueprint.avoid[0]}` : '',
  ]);
}

function deriveHeroStructure(slug, metadata) {
  if (slug === 'cryzo-10') {
    return 'Build a poster-field hero with one dominant surreal pet-fashion image, a hard color block, and giant condensed type that overlaps the subject instead of sitting in a safe adjacent column.';
  }

  if (metadata.supportsEditorial) {
    return 'Build a chapter-like hero with one dominant visual field, aggressive display hierarchy, and enough compositional tension that the page cannot be mistaken for a generic startup homepage.';
  }

  if ((metadata.categories || []).includes('hardware')) {
    return 'Build a keynote-style hero anchored by one dominant product object, quiet negative space, and a compact copy block that frames the object rather than competing with it.';
  }

  if (
    (metadata.categories || []).includes('developer') ||
    (metadata.categories || []).includes('database') ||
    (metadata.categories || []).includes('infra')
  ) {
    return 'Build a technical product hero around one crisp product frame or UI surface, with severe hierarchy and no decorative lifestyle composition.';
  }

  if ((metadata.categories || []).includes('travel') || (metadata.categories || []).includes('hospitality')) {
    return 'Build an atmospheric destination-led hero with one dominant scene and enough editorial restraint that service guidance feels curated rather than marketplace-generic.';
  }

  return 'Build a reference-native hero with one dominant focal moment, strong hierarchy, and no fallback to generic text-left image-right startup composition.';
}

function deriveHeadlineImageRelationship(slug, metadata) {
  if (slug === 'cryzo-10') {
    return 'Place the oversized headline in front of or directly over the hero subject so the type and image visibly compete; the subject should remain legible behind the typography instead of being isolated in a separate panel.';
  }

  if (metadata.supportsEditorial) {
    return 'Allow direct overlap or hard adjacency between headline and imagery when that preserves the reference tension; do not split them into disconnected polite columns.';
  }

  if ((metadata.categories || []).includes('hardware')) {
    return 'Keep the headline framing the product from above, beside, or just over the object with disciplined restraint; only use overlap when it strengthens the product keynote feel.';
  }

  if (
    (metadata.categories || []).includes('developer') ||
    (metadata.categories || []).includes('database') ||
    (metadata.categories || []).includes('infra')
  ) {
    return 'Keep the headline structurally tied to the product surface or code frame, but avoid loud overlap that would make the page feel editorial instead of technical.';
  }

  return 'Tie the headline closely to the hero imagery so they read as one composition instead of two unrelated blocks.';
}

function deriveLayeringRules(slug, metadata) {
  const baseRules = [
    'Use one dominant foreground relationship and one subordinate supporting layer; do not stack decorative layers without purpose.',
    'Every overlap, crop, or z-index shift should strengthen the selected reference rather than adding generic drama.',
  ];

  if (slug === 'cryzo-10') {
    return dedupe([
      'Keep the hero subject partially behind the giant display type or inside a hard poster field instead of isolated in a clean adjacent panel.',
      'Let color fields, image planes, and typography create visible depth even before motion is applied.',
      ...baseRules,
    ]);
  }

  if (metadata.supportsEditorial) {
    return dedupe([
      'Use overlap, crop tension, or chapter-field layering to keep the composition visibly art-directed.',
      ...baseRules,
    ]);
  }

  if (metadata.supportsMinimalShowcase) {
    return dedupe([
      'Keep layering sparse and exact so the product remains dominant and the composition stays severe.',
      ...baseRules,
    ]);
  }

  return baseRules;
}

function deriveTypeSystemBehaviorList(metadata) {
  return dedupe([
    metadata.supportsEditorial
      ? 'Use display type with visible scale tension and chapter rhythm instead of evenly weighted marketing hierarchy.'
      : 'Use typography to reinforce the product category and reference family rather than generic startup-safe hierarchy.',
    metadata.supportsMinimalShowcase
      ? 'Keep the type system restrained, exact, and highly disciplined.'
      : 'Allow one or two dominant type moments to set the emotional scale of the page.',
    (metadata.categories || []).includes('developer') || (metadata.categories || []).includes('database')
      ? 'Keep supporting typography crisp, technical, and structurally informative.'
      : 'Keep supporting typography subordinate to the primary visual system instead of flattening everything into one neutral sans rhythm.',
  ]);
}

function derivePaletteBehaviorList(metadata) {
  return dedupe([
    derivePaletteBehavior(metadata),
    metadata.supportsEditorial
      ? 'Use color as a real field or chapter device, not just an accent sprinkled over otherwise generic layout.'
      : 'Use color to support hierarchy and domain clarity before decoration.',
    (metadata.categories || []).includes('developer') || (metadata.categories || []).includes('database')
      ? 'Keep accents sparse and product-led rather than cinematic or lifestyle-driven.'
      : 'Keep palette choices visibly native to the selected reference family.',
  ]);
}

function deriveAllowedVariation(metadata) {
  return dedupe([
    'Content, brand naming, and product specifics may change freely as long as the composition DNA remains recognizably native to the selected reference family.',
    metadata.supportsEditorial
      ? 'You may vary the exact crop, chapter sequencing, or copy cadence, but the page must stay visibly editorial and reference-led.'
      : 'You may vary product details and supporting section order, but not the core restraint or system logic of the reference.',
    'Do not use variety as an excuse to fall back to generic AI-generated landing-page patterns.',
  ]);
}

function deriveExemplarCues(slug, metadata) {
  if (slug === 'cryzo-10') {
    return [
      {
        id: 'poster-overlap',
        label: 'Poster overlap hero',
        cues: [
          'Oversized condensed headline sits in front of the subject.',
          'Hero subject remains readable behind typography instead of living in a detached panel.',
          'Hard color fields and image planes create immediate poster tension.',
        ],
      },
      {
        id: 'editorial-chapters',
        label: 'Editorial chapter rhythm',
        cues: [
          'Use hard section breaks and chapter-like pacing rather than feature-card repetition.',
          'Let at least one section feel sparse and attitude-led instead of explanatory.',
        ],
      },
    ];
  }

  if ((metadata.categories || []).includes('hardware')) {
    return [
      {
        id: 'keynote-object',
        label: 'Keynote object framing',
        cues: [
          'One hero object dominates the viewport.',
          'Headline and copy frame the object with severe restraint.',
          'Supporting sections stay quieter than the hero.',
        ],
      },
    ];
  }

  if (
    (metadata.categories || []).includes('developer') ||
    (metadata.categories || []).includes('database') ||
    (metadata.categories || []).includes('infra')
  ) {
    return [
      {
        id: 'technical-product-frame',
        label: 'Technical product framing',
        cues: [
          'Use crisp product surfaces or code-adjacent frames as the hero anchor.',
          'Favor modular product chapters over decorative storytelling.',
          'Keep the system exact, sparse, and structurally legible.',
        ],
      },
    ];
  }

  if (metadata.supportsEditorial) {
    return [
      {
        id: 'editorial-hero',
        label: 'Editorial hero composition',
        cues: [
          'Use one dominant image field and one dominant display-type move.',
          'Keep the composition tense enough that it avoids generic startup symmetry.',
          'Let section rhythm feel chaptered rather than repetitively modular.',
        ],
      },
    ];
  }

  return [
    {
      id: 'reference-default',
      label: 'Reference-default composition',
      cues: [
        'Keep one dominant focal moment per viewport.',
        'Tie text hierarchy directly to the primary visual system.',
        'Avoid generic text-left image-right marketing defaults.',
      ],
    },
  ];
}

function buildReferenceJson(slug, metadata) {
  const blueprint = SPECIAL_BLUEPRINTS[slug] || buildGenericBlueprint(slug, metadata);
  const sectionArchetypes = dedupe(blueprint.sectionArchetypes || deriveSectionArchetypes(slug, metadata));

  return {
    slug,
    title: blueprint.title,
    visualIntent: blueprint.identity,
    compositionRecipes: [
      {
        id: 'default',
        label: `${blueprint.title} default`,
        whenToUse: `Use this as the default build recipe whenever ${blueprint.title} is the locked primary reference.`,
        heroStructure: deriveHeroStructure(slug, metadata),
        sectionOrder: sectionArchetypes,
        headlineImageRelationship: deriveHeadlineImageRelationship(slug, metadata),
        layeringRules: deriveLayeringRules(slug, metadata),
        typeScaleRelationship: deriveScaleBehavior(metadata),
        paletteDistribution: derivePaletteBehavior(metadata),
        imageFraming: deriveImageryTreatment(slug, metadata),
        asymmetry:
          metadata.supportsEditorial
            ? 'Allow tension, crop pressure, and asymmetry when it preserves the reference family.'
            : 'Keep asymmetry restrained and category-correct rather than theatrical for its own sake.',
        ctaPosture:
          metadata.supportsMinimalShowcase || (metadata.categories || []).includes('developer')
            ? 'Keep CTAs sparse, exact, and product-native.'
            : 'Make CTAs feel native to the reference family instead of generic bright buttons.',
      },
    ],
    headlineImageRelationships: [deriveHeadlineImageRelationship(slug, metadata)],
    layeringRules: deriveLayeringRules(slug, metadata),
    typeSystemBehavior: deriveTypeSystemBehaviorList(metadata),
    paletteBehavior: derivePaletteBehaviorList(metadata),
    sectionSkeletons: sectionArchetypes,
    antiPatterns: dedupe(blueprint.mustAvoid || deriveMustAvoid(metadata, blueprint)),
    allowedVariation: deriveAllowedVariation(metadata),
    exemplarCues: deriveExemplarCues(slug, metadata),
  };
}

function buildGenericBlueprint(slug, metadata) {
  const name = formatName(slug);
  const categories = joinPhrases(metadata.categories || []);
  const industries = joinPhrases(metadata.industries || []);
  const productTypes = joinPhrases(metadata.productTypes || []);
  const styleKeywords = joinPhrases(metadata.styleKeywords || []);
  const useWhen = [
    ...(metadata.productTypes || []).slice(0, 2),
    ...(metadata.keywords || []).slice(0, 4),
    ...(metadata.industries || []).slice(0, 2),
  ];
  const rules = [
    categories ? `Keep the composition faithful to ${categories} expectations.` : '',
    styleKeywords ? `Let ${styleKeywords} shape typography, spacing, surfaces, and motion.` : '',
    industries ? `Make the result feel native to ${industries} rather than generic premium marketing.` : '',
    metadata.supports3D ? 'Use spatial depth or 3D treatment when the prompt benefits from immersion.' : '',
    metadata.supportsEditorial ? 'Favor editorial pacing and chapter-like sections over generic feature grids.' : '',
    metadata.supportsMinimalShowcase ? 'Keep the layout restrained and minimal when product clarity matters more than ornament.' : '',
  ];
  const avoid = [
    ...((metadata.negativeKeywords || []).slice(0, 4)),
    'generic AI-generated SaaS hero stacks',
    'purple-on-dark Bolt defaults',
  ];

  return {
    title: name,
    identity: `${name} should be treated as a category-correct reference system for ${productTypes || categories || 'its domain'}, using ${styleKeywords || 'clear visual hierarchy'} as the guiding visual attitude.`,
    useWhen,
    rules,
    avoid,
  };
}

function createMarkdown(slug, metadata) {
  const blueprint = SPECIAL_BLUEPRINTS[slug] || buildGenericBlueprint(slug, metadata);
  const compatibleSupports = (metadata.compatibleSupports || []).slice(0, 4);
  const capabilityNotes = [
    metadata.supports3D ? 'Supports spatial or 3D-led composition when the prompt calls for immersion.' : '',
    metadata.supportsEditorial ? 'Supports editorial pacing, chaptered storytelling, and image-first narrative rhythm.' : '',
    metadata.supportsMinimalShowcase ? 'Supports severe restraint and minimal product-showcase framing.' : '',
  ].filter(Boolean);
  const signatureMarkers = dedupe(blueprint.signatureMarkers || deriveSignatureMarkers(slug, metadata, blueprint));
  const mustKeep = dedupe(blueprint.mustKeep || deriveMustKeep(metadata, blueprint));
  const mustAvoid = dedupe(blueprint.mustAvoid || deriveMustAvoid(metadata, blueprint));
  const sectionArchetypes = dedupe(blueprint.sectionArchetypes || deriveSectionArchetypes(slug, metadata));
  const failConditions = dedupe(blueprint.failConditions || deriveFailConditions(metadata, blueprint));
  const familyLabel = inferFamilyLabel(slug, metadata);

  return `# ${blueprint.title}

## Identity
${blueprint.identity}

## Use When
${toBulletList(blueprint.useWhen, ['Use this reference when the prompt clearly aligns with this product, category, or house lane.'])}

## Signature Markers
${toBulletList(signatureMarkers, ['Treat this reference like a binding visual DNA system, not a generic moodboard.'])}

## Core Visual Rules
${toBulletList(blueprint.rules, ['Keep every major visual decision aligned with the selected reference.'])}

## Must Keep
${toBulletList(mustKeep, ['Keep the most recognizable behaviors of the selected reference clearly visible in the final result.'])}

## Must Avoid
${toBulletList(mustAvoid, ['Do not let the selected reference drift into generic template output.'])}

## Section Archetypes
${toBulletList(sectionArchetypes, ['Use reference-native sections instead of defaulting to a generic marketing stack.'])}

## Category Alignment
- Family: ${familyLabel}
- Categories: ${joinPhrases(metadata.categories || []) || 'not specified'}
- Industries: ${joinPhrases(metadata.industries || []) || 'not specified'}
- Product types: ${joinPhrases(metadata.productTypes || []) || 'not specified'}
- Style keywords: ${joinPhrases(metadata.styleKeywords || []) || 'not specified'}

## Capabilities
${toBulletList(capabilityNotes, ['No special capability flags are defined beyond the standard reference behavior.'])}

## Compatible Support Systems
${toBulletList(
  compatibleSupports.map((support) => `${formatName(support)} can be referenced only for minor supporting polish, never as an overpowering second primary.`),
  ['Do not blend multiple primaries. Keep this reference dominant if it is selected.'],
)}

## Anti-Drift Fail Conditions
${toBulletList(failConditions, ['Treat the result as failed if it drifts into unrelated brand territory or generic AI slop.'])}

## Prompting Note
- If this reference is selected as the primary system, it controls composition, typography attitude, palette behavior, CTA styling, imagery direction, and motion language.
- The selected reference must also control section rhythm, page balance, and the acceptable level of weirdness or restraint.
- Use the signature markers, must-keep rules, must-avoid rules, and section archetypes as binding guardrails.
- Do not describe the output as inspired by another brand unless that other brand was explicitly selected instead.
- Treat this file as binding build guidance, not as an optional moodboard.
`;
}

const metadataBySlug = extractReferenceMetadata();
const slugs = Object.keys(metadataBySlug).sort((left, right) => left.localeCompare(right));

fs.mkdirSync(outputRoot, { recursive: true });

for (const slug of slugs) {
  const markdown = createMarkdown(slug, metadataBySlug[slug]);
  const referenceJson = buildReferenceJson(slug, metadataBySlug[slug]);
  const slugDir = path.join(outputRoot, slug);
  const outputPath = path.join(slugDir, 'DESIGN.md');
  const referencePath = path.join(slugDir, 'REFERENCE.json');
  fs.mkdirSync(slugDir, { recursive: true });
  fs.writeFileSync(outputPath, markdown.trim() + '\n', 'utf8');
  fs.writeFileSync(referencePath, JSON.stringify(referenceJson, null, 2) + '\n', 'utf8');
}

console.log(`Synced ${slugs.length} design references into ${outputRoot}`);
