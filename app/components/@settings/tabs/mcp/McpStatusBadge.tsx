import { classNames } from '~/utils/classNames';
import type { McpServerStatus } from '~/lib/stores/mcp';

interface McpStatusBadgeProps {
  status: McpServerStatus;
}

const STATUS_CONFIG: Record<McpServerStatus, { label: string; classes: string }> = {
  idle: { label: 'Idle', classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  checking: { label: 'Checking…', classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  available: { label: 'Available', classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  unavailable: { label: 'Unavailable', classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export function McpStatusBadge({ status }: McpStatusBadgeProps) {
  const { label, classes } = STATUS_CONFIG[status];

  return (
    <span className={classNames('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', classes)}>
      {status === 'checking' && (
        <span className="mr-1 w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
      )}
      {label}
    </span>
  );
}
