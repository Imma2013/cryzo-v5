import { useState } from 'react';
import { classNames } from '~/utils/classNames';
import { McpStatusBadge } from './McpStatusBadge';
import type { McpServerConfig, McpServerStatus } from '~/lib/stores/mcp';

interface McpServerListItemProps {
  name: string;
  config: McpServerConfig;
  status: McpServerStatus;
  tools: string[];
  onRemove: (name: string) => void;
  onCheck: (name: string) => void;
}

export function McpServerListItem({ name, config, status, tools, onRemove, onCheck }: McpServerListItemProps) {
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const endpoint =
    config.type === 'stdio'
      ? `${config.command}${config.args?.length ? ' ' + config.args.join(' ') : ''}`
      : config.url;

  return (
    <div className="border border-bolt-elements-borderColor rounded-lg p-4 bg-bolt-elements-background-depth-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-bolt-elements-textPrimary truncate">{name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary font-mono">
              {config.type}
            </span>
            <McpStatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary font-mono truncate">{endpoint}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onCheck(name)}
            disabled={status === 'checking' || config.type === 'stdio'}
            title={config.type === 'stdio' ? 'stdio servers cannot be checked remotely' : 'Check server availability'}
            className={classNames(
              'text-xs px-2 py-1 rounded border transition-colors',
              'border-bolt-elements-borderColor',
              'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            Check
          </button>
          <button
            onClick={() => onRemove(name)}
            className="text-xs px-2 py-1 rounded border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>

      {tools.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setToolsExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
          >
            <div className={classNames('i-ph:caret-right w-3 h-3 transition-transform', toolsExpanded ? 'rotate-90' : '')} />
            {tools.length} tool{tools.length !== 1 ? 's' : ''} available
          </button>

          {toolsExpanded && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tools.map((tool) => (
                <span
                  key={tool}
                  className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-mono"
                >
                  {tool}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
