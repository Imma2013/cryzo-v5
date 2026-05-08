import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { Button } from '~/components/ui/Button';
import { mcpConfigStore, mcpMaxStepsStore, updateMcpConfig, updateMcpMaxSteps, type McpConfig } from '~/lib/stores/mcp';
import { McpServerList } from './McpServerList';

const EXAMPLE_CONFIG: McpConfig = {
  mcpServers: {
    deepwiki: {
      type: 'streamable-http',
      url: 'https://mcp.deepwiki.com/mcp',
    },
    'local-sse': {
      type: 'sse',
      url: 'http://localhost:8000/sse',
      headers: {
        Authorization: 'Bearer mytoken123',
      },
    },
  },
};

export default function McpTab() {
  const config = useStore(mcpConfigStore);
  const maxSteps = useStore(mcpMaxStepsStore);

  const [editorValue, setEditorValue] = useState(() => JSON.stringify(config, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const [serverTools] = useState<Record<string, string[]>>({});

  const handleEditorChange = (value: string) => {
    setEditorValue(value);

    try {
      JSON.parse(value);
      setParseError(null);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  const handleSave = () => {
    try {
      const parsed = JSON.parse(editorValue) as McpConfig;

      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
        toast.error('Config must have a "mcpServers" object.');
        return;
      }

      updateMcpConfig(parsed);
      toast.success('MCP configuration saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  const handleLoadExample = () => {
    const value = JSON.stringify(EXAMPLE_CONFIG, null, 2);
    setEditorValue(value);
    setParseError(null);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <motion.div
        className="flex items-center gap-3"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">
          <div className="i-ph:plug w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">MCP Servers</h2>
          <p className="text-sm text-bolt-elements-textSecondary">
            Connect external Model Context Protocol servers to extend available tools.
          </p>
        </div>
      </motion.div>

      {/* Config editor */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-bolt-elements-textPrimary">Server Configuration (JSON)</label>
          <button
            onClick={handleLoadExample}
            className="text-xs text-purple-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
          >
            Load example
          </button>
        </div>

        <textarea
          value={editorValue}
          onChange={(e) => handleEditorChange(e.target.value)}
          rows={14}
          spellCheck={false}
          className={classNames(
            'w-full rounded-lg border p-3 font-mono text-sm resize-y',
            'bg-bolt-elements-background-depth-2',
            'text-bolt-elements-textPrimary placeholder-bolt-elements-textSecondary',
            'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
            parseError
              ? 'border-red-400 dark:border-red-600'
              : 'border-bolt-elements-borderColor',
          )}
          placeholder='{"mcpServers": {}}'
        />

        {parseError && (
          <p className="text-xs text-red-500 dark:text-red-400">{parseError}</p>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!!parseError}
            variant="default"
            className="px-5"
          >
            Save
          </Button>
        </div>
      </div>

      {/* Max LLM steps */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-bolt-elements-textPrimary">
          Max sequential LLM steps: <span className="text-purple-500">{maxSteps}</span>
        </label>
        <input
          type="range"
          min={1}
          max={20}
          value={maxSteps}
          onChange={(e) => updateMcpMaxSteps(Number(e.target.value))}
          className="w-full accent-purple-500"
        />
        <p className="text-xs text-bolt-elements-textSecondary">
          Controls how many tool-call rounds the LLM can make in one response (1–20).
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-bolt-elements-borderColor" />

      {/* Server list */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Configured Servers</h3>
        <McpServerList serverTools={serverTools} />
      </div>
    </div>
  );
}
