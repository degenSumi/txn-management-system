import type { AccountId } from './account';

/** `type` is an open string so a new transaction type needs no change here. */
export interface TransactionCommand {
  readonly type: string;
  readonly idempotencyKey: string;
}

export interface TransferCommand extends TransactionCommand {
  readonly type: 'TRANSFER';
  readonly sourceAccountId: AccountId;
  readonly destinationAccountId: AccountId;
  readonly amount: bigint;
}
