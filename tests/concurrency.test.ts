import { describe, expect, it } from 'vitest';
import { createContainer, type ContainerOptions } from '../src/app/container';
import type { Transaction } from '../src/domain/transaction';
import { InMemoryStore } from '../src/repositories/in-memory-store';
import type { KeyedLock } from '../src/services/locking/keyed-lock';
import { SlowReadStore, transfer } from './helpers';

async function spendRace(options: ContainerOptions) {
  const app = createContainer(options);
  await app.accounts.open('alice', 100n);
  await app.accounts.open('bob', 0n);

  const results = await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      app.transactions.submit(transfer({ idempotencyKey: `key-${i}`, amount: 10n })),
    ),
  );

  return {
    completed: results.filter((result) => result.status === 'COMPLETED').length,
    failures: results.filter((result) => result.status === 'FAILED').map((result) => result.failure?.code),
    alice: await app.accounts.getBalance('alice'),
    bob: await app.accounts.getBalance('bob'),
  };
}

describe('concurrent transfers', () => {
  it('never overdraws when 100 transfers race for funds that cover 10', async () => {
    const { completed, failures, alice, bob } = await spendRace({ store: new SlowReadStore() });

    expect(completed).toBe(10);
    expect(failures).toEqual(Array(90).fill('INSUFFICIENT_FUNDS'));
    expect(alice).toBe(0n);
    expect(bob).toBe(100n);
  });

  it('control: the same race overdraws without locks, so the test above can fail', async () => {
    const noLock: KeyedLock = { withLocks: (_keys, work) => work() };

    const { completed, alice } = await spendRace({ store: new SlowReadStore(), lock: noLock });

    expect(completed).toBeGreaterThan(10);
    expect(alice).toBeLessThan(0n);
  });

  it('finishes opposite-direction transfers on the same pair without deadlock', async () => {
    const app = createContainer({ store: new SlowReadStore() });
    await app.accounts.open('alice', 10_000n);
    await app.accounts.open('bob', 10_000n);

    const results = await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        app.transactions.submit(
          transfer({
            idempotencyKey: `key-${i}`,
            amount: 1n,
            sourceAccountId: i % 2 === 0 ? 'alice' : 'bob',
            destinationAccountId: i % 2 === 0 ? 'bob' : 'alice',
          }),
        ),
      ),
    );

    expect(results.every((result) => result.status === 'COMPLETED')).toBe(true);
    expect(await app.accounts.getBalance('alice')).toBe(10_000n);
    expect(await app.accounts.getBalance('bob')).toBe(10_000n);
  });

  it('keeps total money unchanged across a concurrent ring of transfers', async () => {
    const app = createContainer({ store: new SlowReadStore() });
    const ids = Array.from({ length: 10 }, (_, i) => `account-${i}`);
    for (const id of ids) await app.accounts.open(id, 1_000n);

    const submissions: Promise<Transaction>[] = [];
    for (let round = 0; round < 50; round++) {
      ids.forEach((id, i) => {
        submissions.push(
          app.transactions.submit(
            transfer({
              idempotencyKey: `key-${round}-${i}`,
              sourceAccountId: id,
              destinationAccountId: ids[(i + 1) % ids.length] as string,
              amount: BigInt(1 + ((round * 7 + i * 13) % 40)),
            }),
          ),
        );
      });
    }
    const results = await Promise.all(submissions);

    expect(results.every((result) => result.status !== 'PENDING')).toBe(true);
    const balances = await Promise.all(ids.map((id) => app.accounts.getBalance(id)));
    expect(balances.reduce((sum, balance) => sum + balance, 0n)).toBe(10_000n);
    expect(balances.every((balance) => balance >= 0n)).toBe(true);
  });

  it('releases the locks even if recording the failure throws', async () => {
    class BrokenStore extends InMemoryStore {
      broken = true;

      override async commit(transaction: Transaction): Promise<void> {
        if (this.broken) throw new Error('commit down');
        return super.commit(transaction);
      }

      override async updateTransaction(transaction: Transaction): Promise<void> {
        if (this.broken) throw new Error('update down');
        return super.updateTransaction(transaction);
      }
    }
    const store = new BrokenStore();
    const app = createContainer({ store });
    await app.accounts.open('alice', 1_000n);
    await app.accounts.open('bob', 0n);

    await expect(app.transactions.submit(transfer())).rejects.toThrow('update down');

    store.broken = false;
    const retry = await app.transactions.submit(transfer({ idempotencyKey: 'key-2' }));
    expect(retry.status).toBe('COMPLETED');
  });
});
