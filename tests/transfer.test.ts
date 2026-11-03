import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer } from '../src/app/container';
import { InvalidRequestError, TransactionNotFoundError, UnsupportedTransactionTypeError } from '../src/domain/errors';
import { transfer } from './helpers';

describe('transfer', () => {
  let app: ReturnType<typeof createContainer>;

  beforeEach(async () => {
    app = createContainer();
    await app.accounts.open('alice', 1_000n);
    await app.accounts.open('bob', 50n);
  });

  it('moves funds between accounts and completes', async () => {
    const result = await app.transactions.submit(transfer());

    expect(result.status).toBe('COMPLETED');
    expect(await app.accounts.getBalance('alice')).toBe(700n);
    expect(await app.accounts.getBalance('bob')).toBe(350n);
  });

  it('can be read back by id', async () => {
    const result = await app.transactions.submit(transfer());

    expect(await app.transactions.get(result.id)).toBe(result);
    await expect(app.transactions.get('missing')).rejects.toBeInstanceOf(TransactionNotFoundError);
  });

  it.each([
    ['zero', 0n],
    ['negative', -5n],
    ['a number instead of a bigint', 10 as unknown as bigint],
    ['a float', 1.5 as unknown as bigint],
    ['missing', undefined as unknown as bigint],
  ])('rejects an amount that is %s and changes nothing', async (_label, amount) => {
    await expect(app.transactions.submit(transfer({ amount }))).rejects.toBeInstanceOf(InvalidRequestError);
    expect(await app.accounts.getBalance('alice')).toBe(1_000n);
  });

  it('rejects an empty idempotency key', async () => {
    await expect(app.transactions.submit(transfer({ idempotencyKey: '' }))).rejects.toBeInstanceOf(InvalidRequestError);
  });

  it('rejects a transfer to the same account', async () => {
    await expect(app.transactions.submit(transfer({ destinationAccountId: 'alice' }))).rejects.toBeInstanceOf(
      InvalidRequestError,
    );
  });

  it('rejects a missing account id', async () => {
    await expect(app.transactions.submit(transfer({ sourceAccountId: '' }))).rejects.toBeInstanceOf(InvalidRequestError);
  });

  it('rejects an unknown type', async () => {
    const command = { type: 'BARTER', idempotencyKey: 'key-1' };
    await expect(app.transactions.submit(command)).rejects.toBeInstanceOf(UnsupportedTransactionTypeError);
  });
});

describe('accounts', () => {
  it('rejects a negative opening balance', async () => {
    const app = createContainer();
    await expect(app.accounts.open('alice', -1n)).rejects.toBeInstanceOf(InvalidRequestError);
  });

  it('rejects a duplicate id', async () => {
    const app = createContainer();
    await app.accounts.open('alice');
    await expect(app.accounts.open('alice')).rejects.toMatchObject({ code: 'ACCOUNT_ALREADY_EXISTS' });
  });
});
