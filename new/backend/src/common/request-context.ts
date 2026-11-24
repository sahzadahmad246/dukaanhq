import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  queries: number;
  queryMs: number;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export async function timedQuery<T>(operation: () => Promise<T>): Promise<T> {
  const context = requestContext.getStore();
  const started = performance.now();
  if (context) context.queries++;
  try {
    return await operation();
  } finally {
    if (context) context.queryMs += performance.now() - started;
  }
}
