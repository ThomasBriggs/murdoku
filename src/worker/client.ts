import type { Difficulty, PersonId, PuzzleView } from '../engine/types';
import type {
  EngineRequest,
  EngineResponse,
  ErrorCode,
  Placements,
  RequestBody,
  ResponseFor,
} from './protocol';

/** The slice of the Worker API the client needs (lets tests inject a fake). */
export interface WorkerLike {
  postMessage(msg: EngineRequest): void;
  addEventListener(
    type: 'message' | 'error',
    listener: (ev: { data: EngineResponse }) => void,
  ): void;
  terminate(): void;
}

export class EngineError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

export interface EngineClient {
  generate(seed: string, difficulty: Difficulty): Promise<PuzzleView>;
  check(placements: Placements): Promise<{ correct: PersonId[]; wrong: PersonId[] }>;
  accuse(
    placements: Placements,
    suspectId: PersonId,
  ): Promise<{ placementCorrect: boolean; accusationCorrect: boolean; won: boolean }>;
  terminate(): void;
}

export interface EngineClientOptions {
  /** Creates the worker lazily on the first request. Defaults to the real Vite worker. */
  workerFactory?: () => WorkerLike;
  /** Timeout for generate (default 60 s). */
  generateTimeoutMs?: number;
  /** Timeout for check/accuse (default 15 s). */
  timeoutMs?: number;
}

function defaultWorkerFactory(): WorkerLike {
  return new Worker(new URL('./engine.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}

interface Pending {
  resolve: (r: EngineResponse) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createEngineClient(options: EngineClientOptions = {}): EngineClient {
  const factory = options.workerFactory ?? defaultWorkerFactory;
  const generateTimeout = options.generateTimeoutMs ?? 60_000;
  const timeout = options.timeoutMs ?? 15_000;
  const pending = new Map<number, Pending>();
  let worker: WorkerLike | null = null;
  let nextId = 1;

  function failAll(err: Error) {
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      pending.delete(id);
      p.reject(err);
    }
  }

  function ensureWorker(): WorkerLike {
    if (worker) return worker;
    const w = factory();
    w.addEventListener('message', (ev) => {
      const res = ev.data;
      const p = pending.get(res.id);
      if (!p) return; // late reply after timeout/terminate
      pending.delete(res.id);
      clearTimeout(p.timer);
      if (res.type === 'error') p.reject(new EngineError(res.code, res.message));
      else p.resolve(res);
    });
    w.addEventListener('error', () => failAll(new EngineError('internal', 'Worker crashed.')));
    worker = w;
    return w;
  }

  function request<T extends EngineRequest['type']>(
    body: RequestBody & { type: T },
    ms: number,
  ): Promise<ResponseFor<T>> {
    return new Promise((resolve, reject) => {
      let w: WorkerLike;
      try {
        w = ensureWorker();
      } catch (e) {
        reject(new EngineError('internal', e instanceof Error ? e.message : String(e)));
        return;
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new EngineError('timeout', `Engine request "${body.type}" timed out.`));
      }, ms);
      pending.set(id, { resolve: resolve as (r: EngineResponse) => void, reject, timer });
      w.postMessage({ ...body, id } as EngineRequest);
    });
  }

  return {
    async generate(seed, difficulty) {
      return (await request({ type: 'generate', seed, difficulty }, generateTimeout)).puzzle;
    },
    async check(placements) {
      const r = await request({ type: 'check', placements }, timeout);
      return { correct: r.correct, wrong: r.wrong };
    },
    async accuse(placements, suspectId) {
      const r = await request({ type: 'accuse', placements, suspectId }, timeout);
      return {
        placementCorrect: r.placementCorrect,
        accusationCorrect: r.accusationCorrect,
        won: r.won,
      };
    },
    terminate() {
      failAll(new EngineError('internal', 'Engine terminated.'));
      worker?.terminate();
      worker = null;
    },
  };
}
