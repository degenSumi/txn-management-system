import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer } from '../src/app/container';
import { transfer } from './helpers';

const limits = { TRANSFER: { min: 10n, max: 500n } };

describe('validation rules', () => {
  let app: ReturnType<typeof createContainer>;

  beforeEach(async () => {
    app = createContainer({ limits });
    await app.accounts.open('alice', 400n);
    await app.accounts.open('bob', 0n);
  });

  it('allows spending the exact balance', async () => {
    const result = await app.transactions.submit(transfer({ amount: 400n }));

    expect(result.status).toBe('COMPLETED');
    expect(await app.accounts.getBalance('alice')).toBe(0n);
  });

  it('fails one unit over the balance and leaves balances alone', async () => {
    const result = await app.transactions.submit(transfer({ amount: 401n }));

    expect(result.status).toBe('FAILED');
    expect(result.failure?.code).toBe('INSUFFICIENT_FUNDS');
    expect(await app.accounts.getBalance('alice')).toBe(400n);
    expect(await app.accounts.getBalance('bob')).toBe(0n);
  });

  it('allows amounts exactly on the limits', async () => {
    await app.accounts.open('whale', 1_000n);
    const atMin = await app.transactions.submit(transfer({ amount: 10n, sourceAccountId: 'whale' }));
    const atMax = await app.transactions.submit(
      transfer({ idempotencyKey: 'key-2', amount: 500n, sourceAccountId: 'whale' }),
    );

    expect([atMin.status, atMax.status]).toEqual(['COMPLETED', 'COMPLETED']);
  });

  it.each([
    ['below the minimum', 9n],
    ['above the maximum', 501n],
  ])('fails an amount %s', async (_label, amount) => {
    await app.accounts.open('whale', 1_000n);
    const result = await app.transactions.submit(transfer({ amount, sourceAccountId: 'whale' }));

    expect(result.status).toBe('FAILED');
    expect(result.failure?.code).toBe('TRANSACTION_LIMIT_EXCEEDED');
    expect(await app.accounts.getBalance('whale')).toBe(1_000n);
  });

  it.each([
    ['source', { sourceAccountId: 'ghost' }],
    ['destination', { destinationAccountId: 'ghost' }],
  ])('fails when the %s account does not exist', async (_label, overrides) => {
    const result = await app.transactions.submit(transfer({ amount: 100n, ...overrides }));

    expect(result.status).toBe('FAILED');
    expect(result.failure?.code).toBe('ACCOUNT_NOT_FOUND');
    expect(await app.accounts.getBalance('alice')).toBe(400n);
  });

  it('persists the failure so it can be read back', async () => {
    const result = await app.transactions.submit(transfer({ amount: 401n }));

    expect(await app.transactions.get(result.id)).toBe(result);
  });
});
