import { describe, expect, it } from 'vitest';
import { createContainer } from '../src/app/container';
import type { AccountId } from '../src/domain/account';
import type { TransactionCommand } from '../src/domain/commands';
import { DomainError, DuplicateHandlerError, InvalidRequestError } from '../src/domain/errors';
import type { TransactionHandler, TransactionPlan } from '../src/services/handlers/transaction-handler';
import type { RuleContext, ValidationRule } from '../src/services/rules/validation-rule';

// Everything below is what "tomorrow's" cash feature would add. It uses only
// public extension points, and no file under src/ changes.

interface CashCommand extends TransactionCommand {
  readonly accountId: AccountId;
  readonly amount: bigint;
}

class CashDepositHandler implements TransactionHandler<CashCommand> {
  readonly type = 'CASH_DEPOSIT';

  plan({ accountId, amount }: CashCommand): TransactionPlan {
    return { amount, changes: [{ accountId, delta: amount }] };
  }
}

class CashWithdrawalHandler implements TransactionHandler<CashCommand> {
  readonly type = 'CASH_WITHDRAWAL';

  plan({ accountId, amount }: CashCommand): TransactionPlan {
    return { amount, changes: [{ accountId, delta: -amount }] };
  }
}

class AccountFrozenError extends DomainError {
  readonly code = 'ACCOUNT_FROZEN';
}

class FrozenAccountRule implements ValidationRule {
  constructor(private readonly frozen: ReadonlySet<AccountId>) {}

  validate({ accounts }: RuleContext): void {
    for (const id of accounts.keys()) {
      if (this.frozen.has(id)) throw new AccountFrozenError(`Account ${id} is frozen`);
    }
  }
}

const limits = {
  CASH_DEPOSIT: { min: 1n, max: 1_000n },
  CASH_WITHDRAWAL: { min: 1n, max: 500n },
};

const cash = (type: string, amount: bigint, idempotencyKey = 'key-1'): CashCommand => ({
  type,
  idempotencyKey,
  accountId: 'alice',
  amount,
});

async function cashApp(options: Parameters<typeof createContainer>[0] = {}) {
  const app = createContainer({
    limits,
    extraHandlers: [new CashDepositHandler(), new CashWithdrawalHandler()],
    ...options,
  });
  await app.accounts.open('alice', 100n);
  return app;
}

describe('adding a transaction type', () => {
  it('supports a deposit, which has no source account', async () => {
    const app = await cashApp();

    const result = await app.transactions.submit(cash('CASH_DEPOSIT', 50n));

    expect(result.status).toBe('COMPLETED');
    expect(await app.accounts.getBalance('alice')).toBe(150n);
  });

  it('supports a withdrawal, which has no destination account', async () => {
    const app = await cashApp();

    const result = await app.transactions.submit(cash('CASH_WITHDRAWAL', 40n));

    expect(result.status).toBe('COMPLETED');
    expect(await app.accounts.getBalance('alice')).toBe(60n);
  });

  it('gets the funds check without asking for it', async () => {
    const app = await cashApp();

    const result = await app.transactions.submit(cash('CASH_WITHDRAWAL', 101n));

    expect(result.failure?.code).toBe('INSUFFICIENT_FUNDS');
    expect(await app.accounts.getBalance('alice')).toBe(100n);
  });

  it('gets the limit check without asking for it', async () => {
    const app = await cashApp();

    const result = await app.transactions.submit(cash('CASH_DEPOSIT', 1_001n));

    expect(result.failure?.code).toBe('TRANSACTION_LIMIT_EXCEEDED');
  });

  it('fails closed when no limit is configured for the type', async () => {
    const app = await cashApp({ limits: {} });

    const result = await app.transactions.submit(cash('CASH_DEPOSIT', 1n));

    expect(result.failure?.code).toBe('LIMIT_NOT_CONFIGURED');
    expect(await app.accounts.getBalance('alice')).toBe(100n);
  });

  it('nets several debits on one account before checking funds', async () => {
    class SplitDebitHandler implements TransactionHandler<CashCommand> {
      readonly type = 'SPLIT_DEBIT';

      plan({ accountId, amount }: CashCommand): TransactionPlan {
        return {
          amount,
          changes: [
            { accountId, delta: -amount },
            { accountId, delta: -amount },
          ],
        };
      }
    }
    const app = await cashApp({
      limits: { SPLIT_DEBIT: { min: 1n, max: 1_000n } },
      extraHandlers: [new SplitDebitHandler()],
    });

    const result = await app.transactions.submit(cash('SPLIT_DEBIT', 60n));

    expect(result.failure?.code).toBe('INSUFFICIENT_FUNDS');
    expect(await app.accounts.getBalance('alice')).toBe(100n);
  });

  it.each([
    ['no changes', { amount: 1n, changes: [] }],
    ['a zero change', { amount: 1n, changes: [{ accountId: 'alice', delta: 0n }] }],
    ['a non-bigint change', { amount: 1n, changes: [{ accountId: 'alice', delta: 1 as unknown as bigint }] }],
  ])('stops a careless handler that plans %s', async (_label, plan) => {
    const careless: TransactionHandler = { type: 'CARELESS', plan: () => plan };
    const app = await cashApp({ extraHandlers: [careless] });

    await expect(app.transactions.submit({ type: 'CARELESS', idempotencyKey: 'key-1' })).rejects.toBeInstanceOf(
      InvalidRequestError,
    );
  });

  it('refuses two handlers for one type', () => {
    expect(() => createContainer({ extraHandlers: [new CashDepositHandler(), new CashDepositHandler()] })).toThrow(
      DuplicateHandlerError,
    );
  });
});

describe('adding a validation rule', () => {
  it('applies to every type, including existing ones', async () => {
    const app = await cashApp({
      limits: { ...limits, TRANSFER: { min: 1n, max: 1_000n } },
      extraRules: [new FrozenAccountRule(new Set(['alice']))],
    });
    await app.accounts.open('bob');

    const deposit = await app.transactions.submit(cash('CASH_DEPOSIT', 1n));
    const transfer = await app.transactions.submit({
      type: 'TRANSFER',
      idempotencyKey: 'key-2',
      sourceAccountId: 'alice',
      destinationAccountId: 'bob',
      amount: 1n,
    } as TransactionCommand);

    expect(deposit.failure?.code).toBe('ACCOUNT_FROZEN');
    expect(transfer.failure?.code).toBe('ACCOUNT_FROZEN');
  });
});
