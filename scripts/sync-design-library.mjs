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

  return `# ${blueprint.title}

## Identity
${blueprint.identity}

## Use When
${toBulletList(blueprint.useWhen, ['Use this reference when the prompt clearly aligns with this product, category, or house lane.'])}

## Core Visual Rules
${toBulletList(blueprint.rules, ['Keep every major visual decision aligned with the selected reference.'])}

## Category Alignment
- Family: ${metadata.family || (slug.startsWith('cryzo-') ? 'cryzo' : 'external')}
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

## Avoid
${toBulletList(blueprint.avoid, ['Avoid unrelated brand drift and generic template output.'])}

## Prompting Note
- If this reference is selected as the primary system, it controls composition, typography attitude, palette behavior, CTA styling, imagery direction, and motion language.
- Do not describe the output as inspired by another brand unless that other brand was explicitly selected instead.
- Treat this file as binding build guidance, not as an optional moodboard.
`;
}

const metadataBySlug = extractReferenceMetadata();
const slugs = Object.keys(metadataBySlug).sort((left, right) => left.localeCompare(right));

fs.mkdirSync(outputRoot, { recursive: true });

for (const slug of slugs) {
  const markdown = createMarkdown(slug, metadataBySlug[slug]);
  const slugDir = path.join(outputRoot, slug);
  const outputPath = path.join(slugDir, 'DESIGN.md');
  fs.mkdirSync(slugDir, { recursive: true });
  fs.writeFileSync(outputPath, markdown.trim() + '\n', 'utf8');
}

console.log(`Synced ${slugs.length} design references into ${outputRoot}`);
