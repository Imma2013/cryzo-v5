import type { DesignScheme } from '~/types/design-scheme';
import { stripIndents } from '~/utils/stripIndent';

export interface DesignPromptReference {
  slug: string;
  relativePath: string;
  excerpt: string;
}

function hasOverrides(designScheme?: DesignScheme) {
  if (!designScheme) {
    return false;
  }

  return (
    Object.keys(designScheme.palette ?? {}).length > 0 ||
    (designScheme.features?.length ?? 0) > 0 ||
    (designScheme.font?.length ?? 0) > 0
  );
}

export function formatDesignSchemeOverrides(designScheme?: DesignScheme) {
  if (!hasOverrides(designScheme)) {
    return 'None provided.';
  }

  return stripIndents`
    FONT: ${JSON.stringify(designScheme?.font ?? [])}
    PALETTE: ${JSON.stringify(designScheme?.palette ?? {})}
    FEATURES: ${JSON.stringify(designScheme?.features ?? [])}
  `;
}

export function buildCanonicalDesignPreamble(options: {
  libraryPath?: string;
  availableReferences?: string[];
  selectedReferences?: DesignPromptReference[];
  designScheme?: DesignScheme;
}) {
  const { libraryPath, availableReferences = [], selectedReferences = [], designScheme } = options;
  const overrideSummary = formatDesignSchemeOverrides(designScheme);
  const hasReferenceLibrary = !!libraryPath && availableReferences.length > 0 && selectedReferences.length > 0;
  const selectedSlugs = selectedReferences.map((reference) => reference.slug.toLowerCase());
  const hasCryzoReference = selectedSlugs.some((slug) => slug.startsWith('cryzo-'));
  const hasCryzo2Reference = selectedSlugs.includes('cryzo-2');
  const hasCryzo4Reference = selectedSlugs.includes('cryzo-4');
  const hasCryzo5Reference = selectedSlugs.includes('cryzo-5');
  const hasCryzo6Reference = selectedSlugs.includes('cryzo-6');
  const hasCryzo7Reference = selectedSlugs.includes('cryzo-7');
  const hasCryzo10Reference = selectedSlugs.includes('cryzo-10');

  if (!hasReferenceLibrary) {
    if (!hasOverrides(designScheme)) {
      return '';
    }

    return stripIndents`
      <design_override_layer>
        Optional runtime design overrides:
        ${overrideSummary}

        Treat these as secondary hints only.
        Do not fall back to generic purple-on-dark Bolt aesthetics or interchangeable SaaS layouts.
      </design_override_layer>
    `;
  }

  return stripIndents`
    <design_system_priority>
      CRITICAL: \`${libraryPath}\` is the canonical generic design reference library for generated app output.
      Treat this library as the highest-priority default visual reference for build requests.
      Select the closest matching reference from the library and synthesize from it before falling back to generic bolt.diy aesthetics.
      Always evaluate the full reference library before choosing a design direction.
      A valid build result must have a concrete primary reference from this library. Do not generate a generic design brief or generic landing page direction without first locking a primary reference.
      Do not repeatedly default to Ferrari, Vercel, or any other familiar premium reference unless the prompt clearly matches them better than the rest of the library.
      If a Cryzo reference is a strong or near-strong fit, prefer the best-fit Cryzo reference as the primary system.
      Do NOT default to generic AI-generated landing pages, stock SaaS dashboards, purple-on-dark palettes, or interchangeable hero sections unless the selected design reference explicitly supports them.
      Optional runtime overrides may refine the result only when they do not conflict with the selected design references.
      Every major visual decision must align with the chosen reference system first.
    </design_system_priority>

    <design_reference_library>
      Path: ${libraryPath}
      Available references: ${availableReferences.join(', ')}
      Use the first selected reference as primary. Use additional references only for compatible supporting ideas.
      Primary reference controls composition, hero direction, typography attitude, palette behavior, CTA styling, and motion language.
      Supporting references may refine spacing, polish, grid logic, or restraint, but must never overpower the primary.
      If a primary reference is selected, enforce it in the final output instead of summarizing it as an optional suggestion.
      Do not describe the output as Apple-inspired, Stripe-inspired, Ferrari-inspired, or similar unless that exact reference is the selected primary or the user explicitly requested it.
      If the primary reference conflicts with generic premium instincts from the base prompt, follow the primary reference and ignore the generic premium instinct.
    </design_reference_library>

    ${selectedReferences
      .map(
        (reference) => stripIndents`
          <selected_design_reference slug="${reference.slug}" path="${reference.relativePath}">
          ${reference.excerpt}
          </selected_design_reference>
        `,
      )
      .join('\n\n')}

    ${
      hasCryzoReference
        ? stripIndents`
          <cryzo_family_priority>
            The Cryzo family is the preferred house design family.
            Do not treat Cryzo references as optional moodboards. They are intended to shape the actual output.
            When a Cryzo reference is selected, keep its defining composition rules, visual logic, and motion language dominant.
          </cryzo_family_priority>
        `
        : ''
    }

    ${
      hasCryzo2Reference
        ? stripIndents`
          <cryzo_2_enforcement>
            Cryzo 2 is the spatial 3D lane. It is not a generic futuristic premium design system.
            Do not let Cryzo 2 collapse into a concept-car landing page, premium EV launch page, neat dark SaaS homepage, glossy product brochure, or Ferrari-with-neon fallback.
            If the user prompt does not explicitly mention vehicles, do not introduce cars, cockpits, torque stats, speed metrics, or automotive feature sections.
            Cryzo 2 should feel like entering a world, archive, or controlled system.
            Prioritize one dominant symbolic object or artifact, strong dark foundations, oversized editorial typography, mono/system metadata, atmospheric depth, scanner or warning states, and scene-first composition.
          </cryzo_2_enforcement>

          <cryzo_2_3d_mode_selector>
            Before generating, decide whether Cryzo 2 should use true 3D mode or simulated 3D mode.
            Choose true 3D mode when the prompt implies an immersive landing page, interactive artifact, futuristic object, mythic object, spatial storytelling, experimental brand world, cinematic hero centerpiece, or concept-object showcase.
            Choose simulated 3D mode when the page is content-heavy, when performance simplicity matters, or when layered depth can be conveyed through CSS transforms, parallax, gradients, and lighting without full WebGL.
            In true 3D mode, prefer real implementation with three, @react-three/fiber, and @react-three/drei when appropriate.
            A valid true 3D Cryzo 2 result should include a dominant object, camera framing, atmospheric lighting, material treatment, and subtle animation or interaction.
            In simulated 3D mode, preserve spatial depth through layered planes, perspective transforms, glows, scanlines, hover tilt, and atmospheric motion. Do not call a flat dark page "3D".
          </cryzo_2_3d_mode_selector>

          <cryzo_2_fail_conditions>
            Reject and rework the result if any of the following are true:
            - it could plausibly be mistaken for a generic futuristic car site
            - it feels like dark premium SaaS rather than a spatial world
            - the dominant object or artifact is missing
            - the composition is a normal hero/features/footer stack without strong scene presence
            - the page is visually flat even though Cryzo 2 is active
          </cryzo_2_fail_conditions>
        `
        : ''
    }

    ${
      hasCryzo4Reference
        ? stripIndents`
          <cryzo_4_enforcement>
            Cryzo 4 is the restrained editorial automotive lane extracted from Klassik Kars.
            It is not a generic futuristic AI brand system, not a neural-compute landing page, not a dark SaaS template, and not a cyberpunk interface.
            Do not invent AI infrastructure branding, abstract compute clusters, glowing dashboards, developer-platform navigation, or generic "future of AI" hero copy.
            Cryzo 4 should feel like a classic-car rental or curated automotive brand page built around real vehicle photography and muted premium contrast.
            Prioritize:
            - a dark or darkened full-bleed automotive hero image
            - giant condensed uppercase display typography
            - one dominant vehicle image panel or photograph-led section at a time
            - compact utility-style navigation
            - muted taupe, beige, metallic, and off-white interface accents
            - curated sections for brand story, rental categories, vehicle collection, featured car, and contact or booking prompts
            - strong editorial contrast between dark framing, warm-neutral UI tones, and cropped vehicle imagery
            Do not collapse Cryzo 4 into:
            - a generic dark AI homepage
            - a generic white startup hero with centered headline and detached CTA
            - Cryzo 3 with cars
            - Ferrari, Tesla, or premium-EV launch tropes
            - loud supercar hype, racing-red aggression, or glossy concept-car spectacle
          </cryzo_4_enforcement>

          <cryzo_4_fail_conditions>
            Treat the output as failed if any of the following are true:
            - the page reads like AI infrastructure, neural compute, or developer tooling
            - the hero lacks a dominant vehicle image or clear image-led composition
            - the hero becomes a generic white text-first layout
            - the page loses its restrained classic-automotive tone and starts reading like a flashy supercar launch page
            - the vehicle collection stops feeling curated and instead looks like a generic ecommerce card grid
          </cryzo_4_fail_conditions>
        `
        : ''
    }

    ${
      hasCryzo5Reference
        ? stripIndents`
          <cryzo_5_enforcement>
            Cryzo 5 is the extreme editorial performance-machine lane extracted from HF-11.
            It is not a generic futuristic AI brand system, not a dark SaaS template, not a normal luxury brochure, and not a clean supercar configurator.
            Do not invent AI infrastructure branding, app-dashboard chrome, startup-style feature grids, or polished premium-EV launch cliches.
            Cryzo 5 should feel like a mythic machine manifesto built around kinetic automotive imagery, oversized typography, and obsessive brand language.
            Prioritize:
            - a dark or motion-heavy automotive hero image
            - giant white display typography with aggressive scale
            - sharp orange or heat-toned action accents
            - compact utility navigation overpowered by the hero composition
            - visible performance stats treated like sacred machine numbers
            - chapter-based sections for manifesto, machine story, ownership, and image-driven galleries
            - drag, carousel, echo-text, or kinetic editorial motion when appropriate
            - strong tension between brutal typography and cinematic vehicle imagery
            Do not collapse Cryzo 5 into:
            - a generic dark AI homepage
            - a tidy luxury-car brochure with ordinary hero copy
            - a generic black-and-red supercar ad
            - Cryzo 4 with a louder car
            - a normal ecommerce product page or standard lead-gen landing page
          </cryzo_5_enforcement>

          <cryzo_5_fail_conditions>
            Treat the output as failed if any of the following are true:
            - the page reads like AI infrastructure, neural compute, or developer tooling
            - the hero lacks oversized typographic force or strong image-led speed
            - the composition feels like a normal brochure instead of a manifesto chapter
            - the orange accent energy disappears and the page becomes visually passive
            - the machine feels like a catalog product instead of a mythic object
          </cryzo_5_fail_conditions>
        `
        : ''
    }

    ${
      hasCryzo6Reference
        ? stripIndents`
          <cryzo_6_enforcement>
            Cryzo 6 is the concierge travel lane extracted from Access Travel.
            It is not a generic booking engine, not a startup SaaS homepage, not a hard luxury fashion layout, and not a futuristic travel-tech dashboard.
            Do not invent flight-search chrome, app-like pricing tables, generic tourism cards, AI-planner branding, or crypto-travel aesthetics.
            Cryzo 6 should feel like an effortless-luxury travel brand built around atmosphere, editorial serif headlines, curated journeys, and clear guided service.
            Prioritize:
            - a dark atmospheric or destination-led hero with soft luminous color
            - large elegant serif display typography
            - rounded CTA treatments and calm utility controls
            - structured sections for curated journeys, concierge process, testimonials, founder credibility, and planning prompts
            - a balance between wonder-driven imagery and practical service clarity
            - warm human illustration or travel-lifestyle support when appropriate
            - clean trust-building logo, review, and brand-proof sections
            Do not collapse Cryzo 6 into:
            - a generic airline or OTA booking interface
            - a generic white startup hero with app-style feature cards
            - glossy black luxury-fashion minimalism
            - a loud adventure-tour operator page
            - Cryzo 5 with destinations
          </cryzo_6_enforcement>

          <cryzo_6_fail_conditions>
            Treat the output as failed if any of the following are true:
            - the page reads like AI tooling, SaaS, or travel-tech software
            - the hero loses its editorial travel atmosphere and becomes a plain stock-banner layout
            - the service flow is unclear or missing and the page stops feeling concierge-led
            - the typography loses serif elegance and becomes generic utility UI
            - the page feels like a commodity booking list instead of a guided premium-travel brand
          </cryzo_6_fail_conditions>
        `
        : ''
    }

    ${
      hasCryzo7Reference
        ? stripIndents`
          <cryzo_7_enforcement>
            Cryzo 7 is the Japanese fine-dining nightlife lane extracted from Ronin Dubai.
            It is not a generic restaurant listing page, not a hotel brochure, not a food-delivery interface, and not a startup-style hospitality homepage.
            Do not invent coupon banners, delivery-app controls, noisy reservation widgets, bright lifestyle palettes, or generic luxury-hotel minimalism.
            Cryzo 7 should feel like an immersive premium dining world built around cinematic food imagery, dark black-red contrast, editorial prestige typography, and sharp booking intent.
            Prioritize:
            - a dark cinematic food or chef-led hero image
            - elegant serif display typography with Michelin or prestige signaling
            - compact red booking controls and sparse utility navigation
            - structured sections for menu, ambiance, experiences, awards, social proof, and venue details
            - strong contrast between black lacquer framing, warm ivory type, and vivid red accents
            - image-led menu and experience browsing rather than plain text lists
            - a sensual, nocturnal, high-end restaurant atmosphere
            Do not collapse Cryzo 7 into:
            - a generic restaurant directory page
            - a generic luxury hotel landing page
            - a casual sushi chain website
            - a generic black-and-gold fine dining cliche without imagery-led drama
            - Cryzo 6 with food
          </cryzo_7_enforcement>

          <cryzo_7_fail_conditions>
            Treat the output as failed if any of the following are true:
            - the page reads like SaaS, booking software, or delivery tooling
            - the hero lacks strong food or dining imagery and prestige-driven composition
            - the red-black-ivory contrast disappears and the page becomes visually bland
            - the experience feels like a normal restaurant template instead of an immersive venue brand
            - the booking action is weak or buried instead of feeling immediate and intentional
          </cryzo_7_fail_conditions>
        `
        : ''
    }

    ${
      hasCryzo10Reference
        ? stripIndents`
          <cryzo_10_enforcement>
            Cryzo 10 is the loud playful editorial-agency lane extracted from Bark Studio.
            It is not a generic creative-agency landing page, not a pet ecommerce site, not a cute lifestyle brand, and not a tidy startup homepage.
            Do not replace the weirdness with polite corporate copy, tasteful balancing, neutral SaaS structure, or generic design-studio minimalism.
            Cryzo 10 should feel like a camp fashion poster for a design studio built around surreal dog photography, oversized condensed display type, cheeky brand copy, and candy-color contrast.
            Prioritize:
            - a full-bleed dog-fashion or similarly weird editorial hero image
            - giant acid-yellow condensed display typography with aggressive scale
            - pink as a real field color, not a tiny accent
            - serif counterpoint used as glamorous interruption rather than the dominant voice
            - poster-like chapter sections instead of normal feature-card or testimonial-grid patterns
            - sparse support copy with playful, slightly absurd brand language
            - restrained 3D-first depth through layered image planes, parallax, and typographic depth rather than a literal hero object
            Do not collapse Cryzo 10 into:
            - a normal creative-agency site
            - a pet store, dog grooming page, or cute animal brand
            - a balanced premium editorial homepage with all the weird edges sanded off
            - a standard SaaS hero/features/footer stack
          </cryzo_10_enforcement>

          <cryzo_10_fail_conditions>
            Treat the output as failed if any of the following are true:
            - the page reads like a generic agency or startup landing page
            - the loud yellow display type is missing or visually subordinate
            - the composition becomes neat, card-based, or conventionally balanced
            - the imagery loses its surreal fashion-editorial attitude and starts reading like pet ecommerce or stock lifestyle content
            - 3D treatment becomes the main spectacle instead of supporting the photography and graphic type
          </cryzo_10_fail_conditions>
        `
        : ''
    }

    <design_override_layer>
      Optional runtime design overrides:
      ${overrideSummary}

      If an override conflicts with the selected design references, ignore the override and follow the canonical library reference.
    </design_override_layer>

    <visual_quality_gate>
      Do not consider a generated design complete unless it is visually implemented, coherent, and properly styled.
      Reject outputs that are mostly unstyled HTML, missing CSS, broken layout styling, raw text in default browser flow, or incomplete placeholder-heavy scaffolds.
      Before finalizing, verify that styles are applied, sections are visibly composed, typography and spacing systems are present, and the page reads as intentional design rather than scaffold output.
      If the page appears as bare text or default HTML rendering, it has failed implementation and must be revised before presenting it.
    </visual_quality_gate>
  `;
}
