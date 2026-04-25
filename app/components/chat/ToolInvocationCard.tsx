import { useState } from 'react';
import { generateId, type Message } from 'ai';

type ToolInvocationCardProps = {
  append?: (message: Message) => void;
  invocation: any;
};

function extractResult(invocation: any) {
  return invocation?.result ?? invocation?.output ?? invocation?.toolResult ?? invocation?.output?.result;
}

export function extractToolInvocationUrl(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedUrl = extractToolInvocationUrl(item);

      if (nestedUrl) {
        return nestedUrl;
      }
    }

    return undefined;
  }

  if (typeof value === 'string') {
    const match = value.match(/https?:\/\/[^\s)]+/);
    return match?.[0];
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of [
    'authUrl',
    'authUri',
    'redirectUrl',
    'redirect_url',
    'redirectUri',
    'redirectURI',
    'authorizationUrl',
    'authorizeUrl',
    'url',
    'link',
    'text',
  ]) {
    const candidate = record[key];

    const directUrl = extractToolInvocationUrl(candidate);

    if (directUrl) {
      return directUrl;
    }
  }

  for (const nestedKey of ['data', 'result', 'response', 'connectionRequest', 'connection', 'content', 'value', 'toolResult', 'structuredContent']) {
    const nestedUrl = extractToolInvocationUrl(record[nestedKey]);

    if (nestedUrl) {
      return nestedUrl;
    }
  }

  return undefined;
}

function isPending(invocation: any) {
  const state = invocation?.state;
  return (
    state === 'partial-call' ||
    state === 'call' ||
    state === 'running' ||
    state === 'input-streaming' ||
    state === 'input-available' ||
    state == null
  );
}

function getDisplayStatus(invocation: any, result: any, authUrl?: string) {
  const state = invocation?.state;
  const status = result?.status;

  if (status) {
    return status;
  }

  if (authUrl) {
    return 'auth_required';
  }

  if (state === 'result' || state === 'output-available' || result != null) {
    return 'completed';
  }

  if (state === 'output-error' || state === 'error') {
    return 'error';
  }

  if (isPending(invocation)) {
    return 'running';
  }

  return state || 'completed';
}

export function ToolInvocationCard({ append, invocation }: ToolInvocationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const result = extractResult(invocation);
  const toolName = invocation?.toolName || 'tool';
  const pending = isPending(invocation) && result == null;
  const status = result?.status;
  const authUrl = extractToolInvocationUrl(result);
  const displayStatus = getDisplayStatus(invocation, result, authUrl);
  const confirmationToken =
    typeof result?.confirmationToken === 'string' ? result.confirmationToken : undefined;

  const requestConfirmation = () => {
    if (!append || !confirmationToken) {
      return;
    }

    append({
      id: generateId(),
      role: 'user',
      content: `I confirm the external action for tool ${toolName}. Use confirmation token ${confirmationToken} and rerun it with confirmed=true using the same input.`,
    });
  };

  return (
    <div className="my-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
        <div
          className={
            pending
              ? 'i-ph:spinner-gap animate-spin text-base'
              : status === 'completed'
                ? 'i-ph:check-circle text-base text-green-500'
                : displayStatus === 'completed'
                  ? 'i-ph:check-circle text-base text-green-500'
                  : displayStatus === 'error'
                    ? 'i-ph:x-circle text-base text-red-500'
                : status === 'auth_required' || authUrl
                  ? 'i-ph:link text-base text-blue-500'
                  : status === 'confirmation_required'
                    ? 'i-ph:warning-circle text-base text-amber-500'
                    : 'i-ph:wrench text-base'
          }
        />
        <code>{toolName}</code>
        <span className="ml-auto uppercase tracking-wide">{displayStatus}</span>
      </div>

      {result?.message && <p className="mt-2 text-sm text-bolt-elements-textPrimary">{result.message}</p>}

      <div className="mt-2 flex flex-wrap gap-2">
        {authUrl && (
          <a
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-500"
          >
            Connect app
          </a>
        )}
        {confirmationToken && status === 'confirmation_required' && (
          <button
            type="button"
            onClick={requestConfirmation}
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-500"
          >
            Confirm action
          </button>
        )}
        {result && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-xs text-bolt-elements-textSecondary"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        )}
      </div>

      {expanded && result && (
        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-md bg-bolt-elements-background px-3 py-2 text-xs text-bolt-elements-textSecondary">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
