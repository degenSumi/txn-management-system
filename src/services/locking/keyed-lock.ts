export interface KeyedLock {
  /** Runs `work` while exclusively holding every key, and always releases them. */
  withLocks<T>(keys: readonly string[], work: () => Promise<T>): Promise<T>;
}

/**
 * One FIFO promise-chain mutex per key. Keys are sorted here rather than by
 * callers, so two overlapping lock sets can never wait on each other in a cycle.
 */
export class InMemoryKeyedLock implements KeyedLock {
  private readonly tails = new Map<string, Promise<void>>();

  async withLocks<T>(keys: readonly string[], work: () => Promise<T>): Promise<T> {
    const ordered = [...new Set(keys)].sort();
    const releases: (() => void)[] = [];
    try {
      for (const key of ordered) releases.push(await this.acquire(key));
      return await work();
    } finally {
      for (const release of releases.reverse()) release();
    }
  }

  private async acquire(key: string): Promise<() => void> {
    const previous = this.tails.get(key) ?? Promise.resolve();

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => held);
    this.tails.set(key, tail);

    await previous;
    return () => {
      release();
      // Nobody queued behind us, so drop the entry to stop the map growing forever.
      if (this.tails.get(key) === tail) this.tails.delete(key);
    };
  }
}
