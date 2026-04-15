import { useState } from 'react';
import { generateId, type Message } from 'ai';

type ToolInvocationCardProps = {
  append?: (message: Message) => void;
  invocation: any;
};

function extractResult(invocation: any) {
  return invocation?.result ?? invocation?.output ?? invocation?.toolResult;
}

function isPending(invocation: any) {
  const state = invocation?.state;
  return state === 'partial-call' || state === 'call' || state === 'running' || state == null;
}

export function ToolInvocationCard({ append, invocation }: ToolInvocationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const result = extractResult(invocation);
  const toolName = invocation?.toolName || 'tool';
  const pending = isPending(invocation) && result == null;
  const status = result?.status;
  const authUrl = typeof result?.authUrl === 'string' ? result.authUrl : undefined;
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
                : status === 'auth_required'
                  ? 'i-ph:link text-base text-blue-500'
                  : status === 'confirmation_required'
                    ? 'i-ph:warning-circle text-base text-amber-500'
                    : 'i-ph:wrench text-base'
          }
        />
        <code>{toolName}</code>
        <span className="ml-auto uppercase tracking-wide">
          {pending ? 'running' : status || invocation?.state || 'completed'}
        </span>
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
