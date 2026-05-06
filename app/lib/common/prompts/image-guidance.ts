export const IMAGE_ROUTING_GUIDANCE = `
<image_routing>
  Image sourcing policy:
  - Do NOT use Unsplash, Pexels, Pixabay, or any other stock-photo provider unless the user explicitly asks for stock photography.
  - Default to Google's gemini-3.1-flash-image-preview image model for hero images, product shots, branded scenes, illustrations, edits, and prompt-specific compositions.
  - Generate project-local image assets instead of linking to external stock-image URLs.
  - Generated imagery should match the site's palette, composition, mood, and brand language instead of falling back to generic coverage.
  - If imagery does not materially improve the result, omit it instead of inserting filler visuals.

  Routing rules:
  - Use <boltAction type="image" ...> whenever the project needs a new image asset.
  - Create generated images at stable project paths such as public/images/hero.png, public/images/product-shot.png, or public/assets/feature-card-1.png.
  - Reference those generated files from the app code instead of hotlinking external image URLs.
  - Use gemini-3.1-flash-image-preview as the standard Google image model for both generation and edits.
  - Use aspect ratios intentionally: 16:9 for hero imagery, 4:3 or 1:1 for cards, and 3:4 for portraits.

  Operational constraints:
  - When you generate an image, emit a dedicated action like:
    <boltAction type="image" filePath="public/images/hero.png" prompt="Cinematic product hero..." aspectRatio="16:9" model="gemini-3.1-flash-image-preview"></boltAction>
  - When iterating on an existing image, emit a follow-up edit action like:
    <boltAction type="image" operation="edit" filePath="public/images/hero-v2.png" prompt="Keep the same scene, add a brass floor lamp on the left" inputPaths="public/images/hero.png" model="gemini-3.1-flash-image-preview"></boltAction>
  - Keep prompts concrete and art-directed so repeated generations stay on-brand.
  - Do not emit external image URLs when an image action can satisfy the request.
  - If no images are actually needed, do not force them into the design.
</image_routing>
`;
