/**
 * A tiny bounded-concurrency map (SPEC §7 — parallel materialization). Runs `fn` over `items` with
 * at most `limit` in flight at once, and resolves with one settled result per item **in input
 * order** — never rejecting, so one item's failure can't abort the batch. Pure orchestration over an
 * injected async `fn`; the search controller uses it to materialize a round's variants in parallel
 * while keeping deterministic ordering and isolating per-variant failures.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  if (items.length === 0) {
    return results;
  }
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      const item = items[index] as T;
      try {
        results[index] = { status: 'fulfilled', value: await fn(item, index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/** Serializes async sections: `run(fn)` calls execute one at a time, in submission order. */
export interface Mutex {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * A minimal async mutex (a promise chain). Used to serialize the few operations that aren't safe to
 * run concurrently even when the surrounding work is parallel — notably `git worktree add`, which
 * contends on the repo's internal locks if several run at once. A failed section doesn't poison the
 * queue: later `run` calls still proceed.
 */
export function createMutex(): Mutex {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const result = tail.then(fn);
      // Swallow this section's outcome for the chain so one rejection can't break the next waiter.
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
