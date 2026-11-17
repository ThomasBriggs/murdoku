import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEngineClient, EngineError, type WorkerLike } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';
import type { EngineRequest, EngineResponse } from '../../src/worker/protocol';

function fakeWorker() {
  const sent: EngineRequest[] = [];
  let listener: (ev: { data: EngineResponse }) => void = () => {};
  let errorListener: (ev: { data: EngineResponse }) => void = () => {};
  const w: WorkerLike & { terminated: boolean } = {
    terminated: false,
    postMessage: (m) => void sent.push(m),
    addEventListener: (t, l) => (t === 'message' ? (listener = l) : (errorListener = l)),
    terminate() {
      this.terminated = true;
    },
  };
  return {
    w,
    sent,
    reply: (r: EngineResponse) => listener({ data: r }),
    crash: () => errorListener({ data: undefined as never }),
  };
}

afterEach(() => vi.useRealTimers());

describe('engine client', () => {
  it('correlates out-of-order responses by id', async () => {
    const f = fakeWorker();
    const c = createEngineClient({ workerFactory: () => f.w });
    const a = c.check({ 0: 1 });
    const b = c.check({ 0: 2 });
    expect(f.sent.map((s) => s.id)).toEqual([1, 2]);
    f.reply({ id: 2, type: 'check', correct: [], wrong: [0] });
    f.reply({ id: 1, type: 'check', correct: [0], wrong: [] });
    expect(await a).toEqual({ correct: [0], wrong: [] });
    expect(await b).toEqual({ correct: [], wrong: [0] });
  });

  it('rejects typed errors', async () => {
    const f = fakeWorker();
    const c = createEngineClient({ workerFactory: () => f.w });
    const p = c.hint({});
    f.reply({ id: 1, type: 'error', code: 'not-generated', message: 'nope' });
    await expect(p).rejects.toMatchObject({ name: 'EngineError', code: 'not-generated' });
  });

  it('times out and ignores late replies', async () => {
    vi.useFakeTimers();
    const f = fakeWorker();
    const c = createEngineClient({ workerFactory: () => f.w, timeoutMs: 100 });
    const p = c.check({});
    const assertion = expect(p).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
    expect(() => f.reply({ id: 1, type: 'check', correct: [], wrong: [] })).not.toThrow();
  });

  it('terminate rejects pending requests and terminates the worker', async () => {
    const f = fakeWorker();
    const c = createEngineClient({ workerFactory: () => f.w });
    const p = c.check({});
    c.terminate();
    await expect(p).rejects.toBeInstanceOf(EngineError);
    expect(f.w.terminated).toBe(true);
  });

  it('rejects pending requests when the worker crashes', async () => {
    const f = fakeWorker();
    const c = createEngineClient({ workerFactory: () => f.w });
    const p = c.check({});
    f.crash();
    await expect(p).rejects.toBeInstanceOf(EngineError);
  });

  it('rejects (not throws) when the worker cannot be created', async () => {
    const c = createEngineClient({
      workerFactory: () => {
        throw new Error('no worker');
      },
    });
    await expect(c.check({})).rejects.toMatchObject({ code: 'internal' });
  });

  it('works end to end with the in-process worker', async () => {
    const c = createEngineClient({ workerFactory: createInProcessWorker });
    const view = await c.generate('cy-test', 'easy');
    expect(view.seed).toBe('cy-test');
    expect(await c.check({})).toEqual({ correct: [], wrong: [] });
  });
});
