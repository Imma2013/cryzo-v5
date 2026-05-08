import { useStore } from '@nanostores/react';
import { mcpConfigStore, mcpServerStatusStore, updateMcpConfig, setMcpServerStatus } from '~/lib/stores/mcp';
import { McpServerListItem } from './McpServerListItem';

interface McpServerListProps {
  serverTools: Record<string, string[]>;
}

export function McpServerList({ serverTools }: McpServerListProps) {
  const config = useStore(mcpConfigStore);
  const statuses = useStore(mcpServerStatusStore);
  const entries = Object.entries(config.mcpServers);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-bolt-elements-textSecondary text-center py-4">
        No MCP servers configured. Paste a config above and click Save.
      </p>
    );
  }

  const handleRemove = (name: string) => {
    const next = { ...config.mcpServers };
    delete next[name];
    updateMcpConfig({ mcpServers: next });
  };

  const handleCheck = async (name: string) => {
    const server = config.mcpServers[name];

    if (!server || server.type === 'stdio') {
      return;
    }

    setMcpServerStatus(name, 'checking');

    try {
      const params = new URLSearchParams({ url: server.url, type: server.type });
      const res = await fetch(`/api/mcp-check?${params}`);
      const data = (await res.json()) as { status?: string };
      setMcpServerStatus(name, data.status === 'available' ? 'available' : 'unavailable');
    } catch {
      setMcpServerStatus(name, 'unavailable');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {entries.map(([name, serverConfig]) => (
        <McpServerListItem
          key={name}
          name={name}
          config={serverConfig}
          status={statuses[name] ?? 'idle'}
          tools={serverTools[name] ?? []}
          onRemove={handleRemove}
          onCheck={handleCheck}
        />
      ))}
    </div>
  );
}
