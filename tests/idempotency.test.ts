import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer } from '../src/app/container';
import { IdempotencyConflictError } from '../src/domain/errors';
import { fingerprint } from '../src/services/fingerprint';
import { SlowReadStore, transfer } from './helpers';

describe('idempotency', () => {
  let app: ReturnType<typeof createContainer>;

  beforeEach(async () => {
    app = createContainer({ store: new SlowReadStore() });
    await app.accounts.open('alice', 1_000n);
    await app.accounts.open('bob', 0n);
  });

  it('returns the original and moves money once on a retry', async () => {
    const first = await app.transactions.submit(transfer());
    const retry = await app.transactions.submit(transfer());

    expect(retry).toBe(first);
    expect(await app.accounts.getBalance('alice')).toBe(700n);
  });

  it('applies once when 50 duplicates arrive together', async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => app.transactions.submit(transfer())));

    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(await app.accounts.getBalance('alice')).toBe(700n);
    expect(await app.accounts.getBalance('bob')).toBe(300n);
  });

  it('throws when a key is reused with a different payload, and changes nothing', async () => {
    await app.transactions.submit(transfer());

    await expect(app.transactions.submit(transfer({ amount: 301n }))).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(await app.accounts.getBalance('alice')).toBe(700n);
  });

  it('replays a failure, and a new key can try again after a top-up', async () => {
    await app.accounts.open('carol', 1_000n);
    const failed = await app.transactions.submit(transfer({ amount: 1_500n }));
    expect(failed.status).toBe('FAILED');

    await app.transactions.submit(
      transfer({ idempotencyKey: 'top-up', sourceAccountId: 'carol', destinationAccountId: 'alice', amount: 1_000n }),
    );

    expect(await app.transactions.submit(transfer({ amount: 1_500n }))).toBe(failed);
    const fresh = await app.transactions.submit(transfer({ idempotencyKey: 'key-2', amount: 1_500n }));
    expect(fresh.status).toBe('COMPLETED');
  });
});

describe('fingerprint', () => {
  it('ignores field order and the idempotency key', () => {
    const shuffled = {
      amount: 300n,
      destinationAccountId: 'bob',
      sourceAccountId: 'alice',
      idempotencyKey: 'another-key',
      type: 'TRANSFER' as const,
    };

    expect(fingerprint(shuffled)).toBe(fingerprint(transfer()));
  });

  it('changes when the payload changes', () => {
    expect(fingerprint(transfer({ amount: 301n }))).not.toBe(fingerprint(transfer()));
  });
});
