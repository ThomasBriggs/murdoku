/// <reference lib="webworker" />
import { createWorkerState, handleRequest } from './handler';
import type { EngineRequest, EngineResponse } from './protocol';

// Thin wrapper: the game state (including the solution) lives only in this
// worker's module scope.
const state = createWorkerState();

self.onmessage = (ev: MessageEvent<EngineRequest>) => {
  void handleRequest(state, ev.data).then((res: EngineResponse) => self.postMessage(res));
};
