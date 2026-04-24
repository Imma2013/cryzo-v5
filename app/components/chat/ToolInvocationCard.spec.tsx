import { describe, expect, it } from 'vitest';
import { extractToolInvocationUrl } from './ToolInvocationCard';

describe('extractToolInvocationUrl', () => {
  it('supports docs-style redirect URL variants used by Composio auth results', () => {
    expect(
      extractToolInvocationUrl({
        response: {
          data: {
            redirectUri: 'https://platform.composio.dev/connect/gmail',
          },
        },
      }),
    ).toBe('https://platform.composio.dev/connect/gmail');

    expect(
      extractToolInvocationUrl({
        connectionRequest: {
          redirectURI: 'https://platform.composio.dev/connect/github',
        },
      }),
    ).toBe('https://platform.composio.dev/connect/github');

    expect(
      extractToolInvocationUrl({
        authorizeUrl: 'https://platform.composio.dev/connect/stripe',
      }),
    ).toBe('https://platform.composio.dev/connect/stripe');
  });
});
