import { describe, expect, it } from 'vitest';
import { createMutex, mapPool } from './pool';

describe('mapPool', () => {
  it('returns one fulfilled result per item in input order', async () => {
    const results = await mapPool([1, 2, 3, 4], 2, (n) => Promise.resolve(n * 10));
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([
      10, 20, 30, 40,
    ]);
  });

  it('never runs more than `limit` tasks concurrently', async () => {
    let active = 0;
    let peak = 0;
    const fn = async (n: number): Promise<number> => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      await Promise.resolve();
      active -= 1;
      return n;
    };
    await mapPool([1, 2, 3, 4, 5, 6, 7, 8], 3, fn);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('isolates a failing item as a rejected result without aborting the rest', async () => {
    const results = await mapPool([1, 2, 3], 2, (n) => {
      if (n === 2) {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve(n);
    });
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1]?.status).toBe('rejected');
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
  });

  it('handles an empty list', async () => {
    expect(await mapPool([], 4, () => Promise.resolve(1))).toEqual([]);
  });

  it('runs all items even when limit exceeds the item count', async () => {
    const seen: number[] = [];
    await mapPool([1, 2], 16, (n) => {
      seen.push(n);
      return Promise.resolve(n);
    });
    expect(seen.sort()).toEqual([1, 2]);
  });
});

describe('createMutex', () => {
  it('serializes sections so they never overlap and run in submission order', async () => {
    const mutex = createMutex();
    const order: string[] = [];
    let active = 0;
    let peak = 0;
    const section = (label: string) => async (): Promise<void> => {
      active += 1;
      peak = Math.max(peak, active);
      order.push(`start:${label}`);
      await Promise.resolve();
      order.push(`end:${label}`);
      active -= 1;
    };
    await Promise.all([mutex.run(section('a')), mutex.run(section('b')), mutex.run(section('c'))]);
    expect(peak).toBe(1); // never more than one section in flight
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
  });

  it('does not let one section rejection break later sections', async () => {
    const mutex = createMutex();
    await expect(mutex.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(mutex.run(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });
});
