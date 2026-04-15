import type { AppToolkit } from './AppsDashboard';

export function ensureToolkitArray(value: unknown): AppToolkit[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((toolkit): toolkit is AppToolkit => {
    if (!toolkit || typeof toolkit !== 'object') {
      return false;
    }

    const candidate = toolkit as Partial<AppToolkit>;

    return (
      typeof candidate.slug === 'string' &&
      typeof candidate.name === 'string' &&
      typeof candidate.isConnected === 'boolean' &&
      (candidate.isAvailable === undefined || typeof candidate.isAvailable === 'boolean')
    );
  });
}
