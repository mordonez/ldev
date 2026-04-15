/**
 * Creates a concurrency limiter: a function that queues tasks and runs at most
 * `concurrency` of them in parallel.
 */
export function createConcurrencyLimiter(concurrency: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];

  const runNext = (): void => {
    if (active >= concurrency) {
      return;
    }

    const next = queue.shift();
    if (!next) {
      return;
    }

    active += 1;
    next();
  };

  return async <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        void task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            runNext();
          });
      });
      runNext();
    });
}

/**
 * Runs `worker` over every item in `items` with at most `concurrency` workers
 * in parallel, preserving result order. Returns an empty array when items is
 * empty.
 */
export async function mapConcurrent<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({length: workerCount}, async () => {
      while (true) {
        const currentIndex = nextIndex++;
        if (currentIndex >= items.length) {
          return;
        }

        results[currentIndex] = await worker(items[currentIndex]!, currentIndex);
      }
    }),
  );

  return results;
}

/**
 * Runs `worker` over every item in `items` with at most `concurrency` workers
 * in parallel. Returns when all workers complete. Returns immediately for
 * empty arrays.
 */
export async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  await mapConcurrent(items, concurrency, worker);
}
