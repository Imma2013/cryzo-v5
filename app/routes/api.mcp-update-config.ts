import type { ActionFunctionArgs } from '@remix-run/cloudflare';

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  try {
    const body = await request.json();

    if (!body || typeof body !== 'object' || !('mcpServers' in body)) {
      return json({ error: 'Invalid config: must have mcpServers key.' }, 400);
    }

    return json({ ok: true });
  } catch {
    return json({ error: 'Failed to parse request body.' }, 400);
  }
}
