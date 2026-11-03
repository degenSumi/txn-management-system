import type { Account, AccountId } from '../../domain/account';
import type { Transaction } from '../../domain/transaction';

export interface RuleContext {
  readonly transaction: Transaction;
  /** Current balances, read while holding the account locks. */
  readonly accounts: ReadonlyMap<AccountId, Account>;
}

/** Throws a DomainError to reject. May be async so a rule can read from storage. */
export interface ValidationRule {
  validate(context: RuleContext): void | Promise<void>;
}
