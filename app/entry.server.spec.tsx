import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@remix-run/react', () => ({
  RemixServer: ({ url }: { url: string }) => <div data-url={url}>SSR payload</div>,
}));

vi.mock('isbot', () => ({
  isbot: () => false,
}));

vi.mock('remix-island', () => ({
  renderHeadToString: () => '<meta name="test-head" content="ok" />',
}));

vi.mock('./root', () => ({
  Head: () => null,
}));

vi.mock('react-dom/server.browser', () => ({
  renderToReadableStream: vi.fn(() =>
    Promise.resolve(
      Object.assign(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('<main>Rendered app</main>'));
            controller.close();
          },
        }),
        {
          allReady: Promise.resolve(),
        },
      ),
    ),
  ),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('entry.server', () => {
  it('loads and returns an html response using the browser server renderer', async () => {
    const { default: handleRequest } = await import('./entry.server');

    const response = await handleRequest(
      new Request('http://localhost:5173/'),
      200,
      new Headers(),
      {} as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBeNull();
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');

    const body = await response.text();

    expect(body).toContain('<!DOCTYPE html>');
    expect(body).toContain('<meta name="test-head" content="ok" />');
    expect(body).toContain('<main>Rendered app</main>');
    expect(body).toContain('<div id="root"');
  });
});
