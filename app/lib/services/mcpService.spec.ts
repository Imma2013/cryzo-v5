import { describe, expect, it } from 'vitest';
import {
  ENV_MANAGED_COMPOSIO_MCP_SERVER,
  getEnvManagedMcpConfig,
  mergeMcpConfigWithEnv,
  toPublicMcpServerTools,
  type MCPServerTools,
} from './mcpService';

describe('MCP env-managed configuration', () => {
  it('builds a locked Composio MCP server from runtime env', () => {
    expect(
      getEnvManagedMcpConfig({
        COMPOSIO_MCP_API_KEY: 'mcp-key',
        COMPOSIO_MCP_SERVER_URL: 'https://backend.composio.dev/tool_router/trs_test/mcp',
      } as any),
    ).toEqual({
      mcpServers: {
        [ENV_MANAGED_COMPOSIO_MCP_SERVER]: {
          type: 'streamable-http',
          url: 'https://backend.composio.dev/tool_router/trs_test/mcp',
          headers: {
            'x-api-key': 'mcp-key',
          },
        },
      },
    });
  });

  it('keeps env-managed Composio from being overridden by user JSON', () => {
    const merged = mergeMcpConfigWithEnv(
      {
        mcpServers: {
          composio: {
            type: 'streamable-http',
            url: 'https://example.com/unsafe',
          },
          docs: {
            type: 'streamable-http',
            url: 'https://mcp.deepwiki.com/mcp',
          },
        },
      },
      {
        COMPOSIO_MCP_API_KEY: 'mcp-key',
        COMPOSIO_MCP_SERVER_URL: 'https://backend.composio.dev/tool_router/trs_test/mcp',
      } as any,
    );

    expect(merged.mcpServers.composio).toMatchObject({
      type: 'streamable-http',
      url: 'https://backend.composio.dev/tool_router/trs_test/mcp',
    });
    expect(merged.mcpServers.docs).toMatchObject({
      type: 'streamable-http',
      url: 'https://mcp.deepwiki.com/mcp',
    });
  });

  it('omits live MCP clients from public route payloads', () => {
    const publicTools = toPublicMcpServerTools({
      composio: {
        status: 'available',
        client: {
          close: async () => undefined,
          serverName: 'composio',
          tools: async () => ({}),
        },
        config: {
          type: 'streamable-http',
          url: 'https://backend.composio.dev/tool_router/trs_test/mcp',
        },
        tools: {
          COMPOSIO_SEARCH_TOOLS: {
            description: 'Search tools',
          } as any,
        },
      },
    } satisfies MCPServerTools);

    expect(publicTools.composio).toMatchObject({
      status: 'available',
      client: null,
    });
  });
});
