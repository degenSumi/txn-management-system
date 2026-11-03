import { describe, expect, it } from 'vitest';
import { createContainer } from '../src/app/container';
import { InvalidStatusTransitionError } from '../src/domain/errors';
import { Transaction } from '../src/domain/transaction';
import { InMemoryStore } from '../src/repositories/in-memory-store';
import { transfer } from './helpers';

const failure = { code: 'TEST', message: 'test failure' };

function pending(): Transaction {
  return Transaction.pending({
    id: 'tx-1',
    type: 'TRANSFER',
    idempotencyKey: 'key-1',
    fingerprint: 'fingerprint',
    amount: 1n,
    changes: [],
  });
}

describe('status lifecycle', () => {
  it('starts pending', () => {
    expect(pending().status).toBe('PENDING');
  });

  it('moves from pending to completed', () => {
    expect(pending().complete().status).toBe('COMPLETED');
  });

  it('moves from pending to failed and keeps the reason', () => {
    const failed = pending().fail(failure);

    expect(failed.status).toBe('FAILED');
    expect(failed.failure).toEqual(failure);
  });

  it('does not change the original instance', () => {
    const original = pending();
    original.complete();

    expect(original.status).toBe('PENDING');
  });

  it.each([
    ['completed to completed', () => pending().complete().complete()],
    ['completed to failed', () => pending().complete().fail(failure)],
    ['failed to completed', () => pending().fail(failure).complete()],
    ['failed to failed', () => pending().fail(failure).fail(failure)],
  ])('rejects %s', (_label, move) => {
    expect(move).toThrow(InvalidStatusTransitionError);
  });
});

describe('system failures', () => {
  class BrokenCommitStore extends InMemoryStore {
    override async commit(): Promise<void> {
      throw new Error('disk on fire');
    }
  }

  it('marks the transaction failed and leaves balances untouched', async () => {
    const app = createContainer({ store: new BrokenCommitStore() });
    await app.accounts.open('alice', 1_000n);
    await app.accounts.open('bob', 0n);

    const result = await app.transactions.submit(transfer());

    expect(result.status).toBe('FAILED');
    expect(result.failure).toEqual({ code: 'SYSTEM_ERROR', message: 'disk on fire' });
    expect(await app.accounts.getBalance('alice')).toBe(1_000n);
    expect(await app.accounts.getBalance('bob')).toBe(0n);
  });
});
