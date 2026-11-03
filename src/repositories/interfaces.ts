import type { Account, AccountId } from '../domain/account';
import type { Transaction } from '../domain/transaction';

export interface AccountRepository {
  /** Throws AccountAlreadyExistsError if the id is taken. */
  insertAccount(account: Account): Promise<void>;
  findAccount(id: AccountId): Promise<Account | undefined>;
}

export interface TransactionRepository {
  /**
   * Inserts unless the idempotency key is taken, and returns the holder of the
   * key if it is. Must be atomic: this is what stops two duplicates both
   * proceeding. A database implementation would use a unique constraint.
   */
  insertIfAbsent(transaction: Transaction): Promise<Transaction | undefined>;
  updateTransaction(transaction: Transaction): Promise<void>;
  findTransaction(id: string): Promise<Transaction | undefined>;

  /**
   * Saves the transaction and applies its balance changes as one atomic unit.
   * Either both happen or neither does. A database implementation would run
   * this in a single transaction.
   */
  commit(transaction: Transaction): Promise<void>;
}
