/**
 * uploadQueue.js — Concurrency + lane FIFO + transient retry (S130 5.1)
 *
 * Tests the scheduler in isolation. Tasks are simple promise-returning fns,
 * so no fetch/network/IDB mocking is needed. Each test resets module state
 * via UploadQueue._reset() to avoid cross-test pollution.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UploadQueue } from '../../js/data/uploadQueue.js';

beforeEach(() => {
  UploadQueue._reset();
});

// Helper: build a controllable task. Returns { task, resolve, reject, started }.
function makeTask() {
  let started = false;
  let resolveFn, rejectFn;
  const promise = new Promise((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  const task = () => {
    started = true;
    return promise;
  };
  return { task, get started() { return started; }, resolve: resolveFn, reject: rejectFn };
}

// Helper: wait one microtask tick so queued promises run
const tick = () => new Promise(r => setTimeout(r, 0));

describe('UploadQueue.enqueue — basic execution', () => {
  it('resolves with the task return value', async () => {
    const result = await UploadQueue.enqueue(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(UploadQueue.diag.completed).toBe(1);
    expect(UploadQueue.diag.failed).toBe(0);
  });

  it('rejects with the task error', async () => {
    await expect(UploadQueue.enqueue(() => Promise.reject(new Error('boom'))))
      .rejects.toThrow('boom');
    expect(UploadQueue.diag.failed).toBe(1);
  });

  it('counts enqueued + completed in diag', async () => {
    await Promise.all([
      UploadQueue.enqueue(() => Promise.resolve(1)),
      UploadQueue.enqueue(() => Promise.resolve(2)),
      UploadQueue.enqueue(() => Promise.resolve(3))
    ]);
    expect(UploadQueue.diag.enqueued).toBe(3);
    expect(UploadQueue.diag.completed).toBe(3);
  });
});

describe('UploadQueue — global concurrency cap', () => {
  it('runs no more than maxConcurrent tasks simultaneously (default 4)', async () => {
    const tasks = [];
    for (let i = 0; i < 8; i++) tasks.push(makeTask());
    const promises = tasks.map(t => UploadQueue.enqueue(t.task));

    // Let the queue drain to start
    await tick();
    const startedCount = tasks.filter(t => t.started).length;
    expect(startedCount).toBe(4);

    // Complete first 4, next 4 should start
    tasks.slice(0, 4).forEach(t => t.resolve('done'));
    await tick();
    expect(tasks.filter(t => t.started).length).toBe(8);

    // Drain the rest so promises clean up
    tasks.slice(4).forEach(t => t.resolve('done'));
    await Promise.all(promises);
  });

  it('honors setConcurrency(2)', async () => {
    UploadQueue.setConcurrency(2);
    const tasks = [makeTask(), makeTask(), makeTask(), makeTask()];
    const promises = tasks.map(t => UploadQueue.enqueue(t.task));
    await tick();
    expect(tasks.filter(t => t.started).length).toBe(2);
    tasks.forEach(t => t.resolve('done'));
    await Promise.all(promises);
  });
});

describe('UploadQueue — per-lane FIFO serialization', () => {
  it('runs tasks within a lane sequentially in enqueue order', async () => {
    const order = [];
    const t1 = makeTask();
    const t2 = makeTask();
    const t3 = makeTask();

    const p1 = UploadQueue.enqueue(() => { order.push('start-1'); return t1.task().then(() => order.push('end-1')); }, { lane: 'A' });
    const p2 = UploadQueue.enqueue(() => { order.push('start-2'); return t2.task().then(() => order.push('end-2')); }, { lane: 'A' });
    const p3 = UploadQueue.enqueue(() => { order.push('start-3'); return t3.task().then(() => order.push('end-3')); }, { lane: 'A' });

    await tick();
    // Only first lane task should have started
    expect(order).toEqual(['start-1']);

    t1.resolve('ok');
    await Promise.resolve(); await tick();
    expect(order.slice(0, 3)).toEqual(['start-1', 'end-1', 'start-2']);

    t2.resolve('ok');
    await Promise.resolve(); await tick();
    expect(order.slice(0, 5)).toEqual(['start-1', 'end-1', 'start-2', 'end-2', 'start-3']);

    t3.resolve('ok');
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2', 'start-3', 'end-3']);
  });

  it('allows different lanes to run in parallel', async () => {
    const tA = makeTask();
    const tB = makeTask();
    const pA = UploadQueue.enqueue(tA.task, { lane: 'A' });
    const pB = UploadQueue.enqueue(tB.task, { lane: 'B' });

    await tick();
    expect(tA.started).toBe(true);
    expect(tB.started).toBe(true);

    tA.resolve(1); tB.resolve(2);
    expect(await pA).toBe(1);
    expect(await pB).toBe(2);
  });

  it('a long-running lane task does not block other lanes from starting', async () => {
    UploadQueue.setConcurrency(4);
    const slow = makeTask();
    const fast1 = makeTask();
    const fast2 = makeTask();

    const ps = UploadQueue.enqueue(slow.task, { lane: 'slow' });
    const p1 = UploadQueue.enqueue(fast1.task, { lane: 'fast1' });
    const p2 = UploadQueue.enqueue(fast2.task, { lane: 'fast2' });

    await tick();
    expect(slow.started && fast1.started && fast2.started).toBe(true);

    fast1.resolve('a'); fast2.resolve('b');
    expect(await p1).toBe('a');
    expect(await p2).toBe('b');

    // Slow still pending; resolve to clean up
    slow.resolve('s');
    await ps;
  });
});

describe('UploadQueue — transient retry', () => {
  it('retries on TypeError (network failure) up to maxRetries', async () => {
    let attempts = 0;
    const task = () => {
      attempts++;
      if (attempts < 3) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve('success');
    };
    const result = await UploadQueue.enqueue(task, { maxRetries: 3 });
    expect(result).toBe('success');
    expect(attempts).toBe(3);
    expect(UploadQueue.diag.retried).toBe(2);
  });

  it('retries on HTTP 429 status (rate limit)', async () => {
    let attempts = 0;
    const task = () => {
      attempts++;
      if (attempts === 1) {
        const err = new Error('Too many requests');
        err.status = 429;
        return Promise.reject(err);
      }
      return Promise.resolve('ok');
    };
    const result = await UploadQueue.enqueue(task, { maxRetries: 2 });
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('does NOT retry on non-transient errors (e.g. 403)', async () => {
    let attempts = 0;
    const task = () => {
      attempts++;
      const err = new Error('Forbidden');
      err.status = 403;
      return Promise.reject(err);
    };
    await expect(UploadQueue.enqueue(task, { maxRetries: 5 })).rejects.toThrow('Forbidden');
    expect(attempts).toBe(1);
    expect(UploadQueue.diag.retried).toBe(0);
  });

  it('gives up after maxRetries+1 attempts', async () => {
    let attempts = 0;
    const task = () => {
      attempts++;
      return Promise.reject(new TypeError('network down'));
    };
    await expect(UploadQueue.enqueue(task, { maxRetries: 2 })).rejects.toThrow('network down');
    // 1 initial + 2 retries = 3 attempts
    expect(attempts).toBe(3);
    expect(UploadQueue.diag.retried).toBe(2);
  });
});

describe('UploadQueue — diagnostics', () => {
  it('tracks maxObservedDepth across the run', async () => {
    UploadQueue.setConcurrency(1);
    const tasks = [makeTask(), makeTask(), makeTask(), makeTask()];
    const promises = tasks.map(t => UploadQueue.enqueue(t.task));
    await tick();
    // 1 running, 3 queued globally → observed max depth ≥ 3
    expect(UploadQueue.diag.maxObservedDepth).toBeGreaterThanOrEqual(3);
    tasks.forEach(t => t.resolve('ok'));
    await Promise.all(promises);
  });

  it('reports activeLanes count while lanes are running', async () => {
    const tA = makeTask();
    const tB = makeTask();
    UploadQueue.enqueue(tA.task, { lane: 'A' });
    UploadQueue.enqueue(tB.task, { lane: 'B' });
    await tick();
    expect(UploadQueue.diag.activeLanes).toBe(2);
    tA.resolve('a'); tB.resolve('b');
    await tick(); await tick();
    expect(UploadQueue.diag.activeLanes).toBe(0);
  });
});
