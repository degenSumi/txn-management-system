import type { Account, AccountId } from '../domain/account';
import { AccountAlreadyExistsError, AccountNotFoundError } from '../domain/errors';
import type { Transaction } from '../domain/transaction';
import type { AccountRepository, TransactionRepository } from './interfaces';

export class InMemoryStore implements AccountRepository, TransactionRepository {
  private readonly accounts = new Map<AccountId, Account>();
  private readonly transactions = new Map<string, Transaction>();
  private readonly transactionIdsByKey = new Map<string, string>();

  async insertAccount(account: Account): Promise<void> {
    if (this.accounts.has(account.id)) throw new AccountAlreadyExistsError(account.id);
    this.accounts.set(account.id, account);
  }

  async findAccount(id: AccountId): Promise<Account | undefined> {
    return this.accounts.get(id);
  }

  async insertIfAbsent(transaction: Transaction): Promise<Transaction | undefined> {
    const existingId = this.transactionIdsByKey.get(transaction.idempotencyKey);
    if (existingId !== undefined) return this.transactions.get(existingId);

    this.transactionIdsByKey.set(transaction.idempotencyKey, transaction.id);
    this.transactions.set(transaction.id, transaction);
    return undefined;
  }

  async updateTransaction(transaction: Transaction): Promise<void> {
    this.transactions.set(transaction.id, transaction);
  }

  async findTransaction(id: string): Promise<Transaction | undefined> {
    return this.transactions.get(id);
  }

  /** Works out every new balance first, then publishes with no await, so it can't be seen half done. */
  async commit(transaction: Transaction): Promise<void> {
    const updated = new Map<AccountId, Account>();
    for (const { accountId, delta } of transaction.changes) {
      const account = updated.get(accountId) ?? this.accounts.get(accountId);
      if (!account) throw new AccountNotFoundError(accountId);
      updated.set(accountId, { ...account, balance: account.balance + delta });
    }

    for (const [accountId, account] of updated) this.accounts.set(accountId, account);
    this.transactions.set(transaction.id, transaction);
  }
}
