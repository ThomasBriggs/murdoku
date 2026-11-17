import { createWorkerState, handleRequest } from './handler';
import type { EngineRequest, EngineResponse } from './protocol';
import type { WorkerLike } from './client';

/**
 * A WorkerLike that runs the handler in the current thread. For tests only:
 * it keeps the solution in the caller's thread.
 */
export function createInProcessWorker(): WorkerLike {
  const state = createWorkerState();
  const listeners = new Set<(ev: { data: EngineResponse }) => void>();
  return {
    postMessage(msg: EngineRequest) {
      void handleRequest(state, msg).then((res) => listeners.forEach((l) => l({ data: res })));
    },
    addEventListener(type, l) {
      if (type === 'message') listeners.add(l as (ev: { data: EngineResponse }) => void);
    },
    terminate() {
      listeners.clear();
    },
  };
}
