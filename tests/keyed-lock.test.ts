import { describe, expect, it } from 'vitest';
import { InMemoryKeyedLock } from '../src/services/locking/keyed-lock';

const tick = () => new Promise(setImmediate);

describe('InMemoryKeyedLock', () => {
  it('runs work for the same key one at a time, in arrival order', async () => {
    const lock = new InMemoryKeyedLock();
    const log: string[] = [];

    await Promise.all(
      ['first', 'second', 'third'].map((name) =>
        lock.withLocks(['a'], async () => {
          log.push(`${name} start`);
          await tick();
          log.push(`${name} end`);
        }),
      ),
    );

    expect(log).toEqual(['first start', 'first end', 'second start', 'second end', 'third start', 'third end']);
  });

  it('does not make different keys wait for each other', async () => {
    const lock = new InMemoryKeyedLock();
    const log: string[] = [];

    let releaseSlow!: () => void;
    const slow = lock.withLocks(['a'], async () => {
      log.push('slow start');
      await new Promise<void>((resolve) => {
        releaseSlow = resolve;
      });
      log.push('slow end');
    });
    await lock.withLocks(['b'], async () => {
      log.push('other');
    });

    expect(log).toEqual(['slow start', 'other']);
    releaseSlow();
    await slow;
  });

  it('does not deadlock on overlapping keys given in opposite orders', async () => {
    const lock = new InMemoryKeyedLock();
    const work = async () => {
      await tick();
    };

    await Promise.all(
      Array.from({ length: 50 }, (_, i) => lock.withLocks(i % 2 === 0 ? ['a', 'b'] : ['b', 'a'], work)),
    );
  });

  it('allows the same key twice in one call', async () => {
    const lock = new InMemoryKeyedLock();

    await expect(lock.withLocks(['a', 'a'], async () => 'done')).resolves.toBe('done');
  });

  it('releases every key when the work throws', async () => {
    const lock = new InMemoryKeyedLock();

    await expect(
      lock.withLocks(['a', 'b'], async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await expect(lock.withLocks(['a', 'b'], async () => 'free')).resolves.toBe('free');
  });
});
