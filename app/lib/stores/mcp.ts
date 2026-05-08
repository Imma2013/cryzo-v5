import { atom } from 'nanostores';
import { create } from 'zustand';

export type McpServerTransport =
  | { type: 'streamable-http'; url: string; headers?: Record<string, string> }
  | { type: 'sse'; url: string; headers?: Record<string, string> }
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> };

export type McpServerConfig = McpServerTransport & { enabled?: boolean };

export type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

export type McpServerStatus = 'idle' | 'checking' | 'available' | 'unavailable';

const MCP_STORAGE_KEY = 'bolt_mcp_config';
const MCP_MAX_STEPS_KEY = 'bolt_mcp_max_steps';
const DEFAULT_MAX_STEPS = 5;

function loadFromStorage(): McpConfig {
  if (typeof window === 'undefined') {
    return { mcpServers: {} };
  }

  try {
    const raw = localStorage.getItem(MCP_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as McpConfig) : { mcpServers: {} };
  } catch {
    return { mcpServers: {} };
  }
}

function loadMaxSteps(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_MAX_STEPS;
  }

  try {
    const raw = localStorage.getItem(MCP_MAX_STEPS_KEY);
    const parsed = raw ? parseInt(raw, 10) : DEFAULT_MAX_STEPS;
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 20 ? parsed : DEFAULT_MAX_STEPS;
  } catch {
    return DEFAULT_MAX_STEPS;
  }
}

export const mcpConfigStore = atom<McpConfig>(loadFromStorage());
export const mcpMaxStepsStore = atom<number>(loadMaxSteps());
export const mcpServerStatusStore = atom<Record<string, McpServerStatus>>({});

export function updateMcpConfig(config: McpConfig) {
  mcpConfigStore.set(config);
  mcpServerStatusStore.set({});

  if (typeof window !== 'undefined') {
    localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(config));
  }

  fetch('/api/mcp-update-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).catch(() => undefined);
}

export function updateMcpMaxSteps(steps: number) {
  const clamped = Math.max(1, Math.min(20, steps));
  mcpMaxStepsStore.set(clamped);

  if (typeof window !== 'undefined') {
    localStorage.setItem(MCP_MAX_STEPS_KEY, String(clamped));
  }
}

export function setMcpServerStatus(name: string, status: McpServerStatus) {
  const current = mcpServerStatusStore.get();
  mcpServerStatusStore.set({ ...current, [name]: status });
}

type MCPStoreState = {
  settings: {
    maxLLMSteps: number;
    mcpConfig: McpConfig;
  };
  setMaxLLMSteps: (steps: number) => void;
  setMcpConfig: (config: McpConfig) => void;
};

export const useMCPStore = create<MCPStoreState>((set) => ({
  settings: {
    maxLLMSteps: loadMaxSteps(),
    mcpConfig: loadFromStorage(),
  },
  setMaxLLMSteps: (steps) => {
    const clamped = Math.max(1, Math.min(20, steps));
    set((s) => ({ settings: { ...s.settings, maxLLMSteps: clamped } }));
    updateMcpMaxSteps(clamped);
  },
  setMcpConfig: (config) => {
    set((s) => ({ settings: { ...s.settings, mcpConfig: config } }));
    updateMcpConfig(config);
  },
}))
