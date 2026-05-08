import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';
import { MCPService, toPublicMcpServerTools, type MCPConfig } from '~/lib/services/mcpService';
import { getServerEnv } from '~/lib/server-env';

const logger = createScopedLogger('api.mcp-update-config');

export async function action({ context, request }: ActionFunctionArgs) {
  try {
    const mcpConfig = (await request.json()) as MCPConfig;

    if (!mcpConfig || typeof mcpConfig !== 'object') {
      return Response.json({ error: 'Invalid MCP servers configuration' }, { status: 400 });
    }

    const mcpService = MCPService.getInstance();
    const serverTools = await mcpService.updateConfig(mcpConfig, getServerEnv(context as any) as any);

    return Response.json(toPublicMcpServerTools(serverTools));
  } catch (error) {
    logger.error('Error updating MCP config:', error);
    return Response.json({ error: 'Failed to update MCP config' }, { status: 500 });
  }
}
