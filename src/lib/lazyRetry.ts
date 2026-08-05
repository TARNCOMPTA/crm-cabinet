import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'chunk-reload-attempted';

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes("'text/html' is not a valid javascript mime type")
  );
}

function forceReload(): never {
  sessionStorage.setItem(RELOAD_KEY, Date.now().toString());
  window.location.reload();
  throw new Error('Reloading page due to stale chunks');
}

function retryImport<T>(
  importFn: () => Promise<T>,
  retries = 2,
  delay = 1000
): Promise<T> {
  return importFn().catch((error) => {
    if (isChunkLoadError(error)) {
      const lastReload = sessionStorage.getItem(RELOAD_KEY);
      const reloadedRecently = lastReload && Date.now() - Number(lastReload) < 30_000;
      if (!reloadedRecently) {
        forceReload();
      }
      throw error;
    }

    if (retries <= 0) throw error;
    return new Promise<T>((resolve) =>
      setTimeout(() => resolve(retryImport(importFn, retries - 1, delay)), delay)
    );
  });
}

export function lazyRetry(
  importFn: () => Promise<{ default: ComponentType<unknown> }>
) {
  return lazy(() => retryImport(importFn));
}

export function lazyRetryNamed<K extends string>(
  importFn: () => Promise<Record<K, ComponentType<unknown>>>,
  name: K
) {
  return lazy(() =>
    retryImport(importFn).then((m) => ({ default: m[name] }))
  );
}
