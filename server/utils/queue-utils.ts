export interface QueueOptions {
  concurrency?: number;
  onProgress?: (completed: number, total: number, active: number) => void;
}

export async function processQueue<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: QueueOptions = {}
): Promise<R[]> {
  const { concurrency = 3, onProgress } = options;
  
  if (items.length === 0) {
    return [];
  }

  const results: R[] = new Array(items.length);
  const queue = items.map((item, index) => ({ item, index }));
  let completed = 0;
  let activeWorkers = 0;

  const actualConcurrency = Math.min(concurrency, items.length);

  const workers = Array(actualConcurrency)
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const work = queue.shift();
        if (!work) break;

        const { item, index } = work;
        activeWorkers++;

        try {
          const result = await processor(item, index);
          results[index] = result;
        } catch (error) {
          throw error;
        } finally {
          activeWorkers--;
          completed++;
          
          if (onProgress) {
            onProgress(completed, items.length, activeWorkers);
          }
        }
      }
    });

  await Promise.all(workers);
  return results;
}
