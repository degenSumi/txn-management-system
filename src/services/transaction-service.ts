import { randomUUID } from 'node:crypto';
import type { Account, AccountId } from '../domain/account';
import type { TransactionCommand } from '../domain/commands';
import {
  AccountNotFoundError,
  DomainError,
  IdempotencyConflictError,
  InvalidRequestError,
  TransactionNotFoundError,
} from '../domain/errors';
import { Transaction, type TransactionFailure } from '../domain/transaction';
import type { AccountRepository, TransactionRepository } from '../repositories/interfaces';
import { fingerprint } from './fingerprint';
import type { HandlerRegistry } from './handlers/handler-registry';
import type { TransactionPlan } from './handlers/transaction-handler';
import type { KeyedLock } from './locking/keyed-lock';
import type { ValidationRule } from './rules/validation-rule';

/** The single write path. Every transaction type goes through `submit`. */
export class TransactionService {
  constructor(
    private readonly handlers: HandlerRegistry,
    private readonly rules: readonly ValidationRule[],
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository,
    private readonly locks: KeyedLock,
  ) {}

  async submit(command: TransactionCommand): Promise<Transaction> {
    if (!command.idempotencyKey) throw new InvalidRequestError('Idempotency key is required');

    const plan = this.handlers.get(command.type).plan(command);
    assertValidPlan(plan);

    const pending = Transaction.pending({
      id: randomUUID(),
      type: command.type,
      idempotencyKey: command.idempotencyKey,
      fingerprint: fingerprint(command),
      amount: plan.amount,
      changes: plan.changes,
    });

    const existing = await this.transactions.insertIfAbsent(pending);
    if (existing) {
      if (existing.fingerprint !== pending.fingerprint) throw new IdempotencyConflictError(command.idempotencyKey);
      return existing;
    }

    // Lock keys come from the plan, so a handler can't forget to lock an account it touches.
    const accountIds = pending.changes.map((change) => change.accountId);
    return this.locks.withLocks(accountIds, () => this.execute(pending));
  }

  async get(id: string): Promise<Transaction> {
    const transaction = await this.transactions.findTransaction(id);
    if (!transaction) throw new TransactionNotFoundError(id);
    return transaction;
  }

  private async execute(pending: Transaction): Promise<Transaction> {
    try {
      const accounts = await this.loadAccounts(pending);
      for (const rule of this.rules) await rule.validate({ transaction: pending, accounts });

      const completed = pending.complete();
      await this.transactions.commit(completed);
      return completed;
    } catch (error) {
      const failed = pending.fail(toFailure(error));
      await this.transactions.updateTransaction(failed);
      return failed;
    }
  }

  private async loadAccounts(transaction: Transaction): Promise<ReadonlyMap<AccountId, Account>> {
    const accounts = new Map<AccountId, Account>();
    for (const { accountId } of transaction.changes) {
      const account = await this.accounts.findAccount(accountId);
      if (!account) throw new AccountNotFoundError(accountId);
      accounts.set(accountId, account);
    }
    return accounts;
  }
}

function toFailure(error: unknown): TransactionFailure {
  if (error instanceof DomainError) return { code: error.code, message: error.message };
  return { code: 'SYSTEM_ERROR', message: error instanceof Error ? error.message : String(error) };
}

/** Runs on every plan, so a careless handler can't write a bad amount. */
function assertValidPlan({ amount, changes }: TransactionPlan): void {
  if (typeof amount !== 'bigint' || amount <= 0n) {
    throw new InvalidRequestError('Amount must be a positive bigint in minor units');
  }
  if (changes.length === 0) {
    throw new InvalidRequestError('A transaction must change at least one balance');
  }
  for (const { delta } of changes) {
    if (typeof delta !== 'bigint' || delta === 0n) {
      throw new InvalidRequestError('Every balance change must be a non-zero bigint');
    }
  }
}
