import { type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getGeneratedImage } from '~/lib/.server/images/generated-image-store';

export async function loader({ params }: LoaderFunctionArgs) {
  const id = params.id;

  if (!id) {
    return new Response('Missing image id.', { status: 400 });
  }

  const image = getGeneratedImage(id);

  if (!image) {
    return new Response('Image not found.', { status: 404 });
  }

  const bytes = Uint8Array.from(atob(image.data), (char) => char.charCodeAt(0));

  return new Response(bytes, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': image.mimeType,
    },
  });
}
