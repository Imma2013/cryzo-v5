import type { AppLoadContext, EntryContext } from '@remix-run/cloudflare';
import { RemixServer } from '@remix-run/react';
import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server.browser';
import { renderHeadToString } from 'remix-island';
import { Head } from './root';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  const appStream = await renderToReadableStream(<RemixServer context={remixContext} url={request.url} />, {
    signal: request.signal,
    onError(error: unknown) {
      console.error(error);
      responseStatusCode = 500;
    },
  });

  if (isbot(request.headers.get('user-agent') || '')) {
    await appStream.allReady;
  }

  const head = renderHeadToString({ request, remixContext, Head });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(`<!DOCTYPE html><html lang="en"><head>${head}</head><body><div id="root" class="w-full h-full">`),
      );

      const reader = appStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          controller.enqueue(value);
        }

        controller.enqueue(encoder.encode('</div></body></html>'));
        controller.close();
      } catch (error) {
        controller.error(error);
        reader.cancel(error);
      }
    },
    cancel() {
      appStream.cancel();
    },
  });

  responseHeaders.set('Content-Type', 'text/html');
  responseHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
  responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

  return new Response(stream, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
