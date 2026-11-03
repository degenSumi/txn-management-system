import type { TransactionCommand } from '../../domain/commands';
import type { BalanceChange } from '../../domain/transaction';

/** What a command will do. The core validates, locks and commits from this. */
export interface TransactionPlan {
  readonly amount: bigint;
  readonly changes: readonly BalanceChange[];
}

/**
 * Strategy for one transaction type. A handler only describes the balance
 * changes. It never touches storage, so it can't bypass the core write path.
 */
export interface TransactionHandler<C extends TransactionCommand = TransactionCommand> {
  readonly type: C['type'];
  plan(command: C): TransactionPlan;
}
