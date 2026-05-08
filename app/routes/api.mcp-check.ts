import type { LoaderFunctionArgs } from '@remix-run/cloudflare';

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const serverUrl = url.searchParams.get('url');
  const serverType = url.searchParams.get('type') as 'streamable-http' | 'sse' | null;

  if (!serverUrl || !serverType) {
    return json({ error: 'Missing url or type query param.' }, 400);
  }

  if (serverType !== 'streamable-http' && serverType !== 'sse') {
    // stdio servers can't be health-checked from the browser
    return json({ status: 'unavailable', reason: 'stdio servers cannot be checked remotely.' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(serverUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/event-stream' },
    });

    clearTimeout(timeout);

    return json({ status: response.ok ? 'available' : 'unavailable', httpStatus: response.status });
  } catch {
    return json({ status: 'unavailable' });
  }
}
