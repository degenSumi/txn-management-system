import type { TransferCommand } from '../../domain/commands';
import { InvalidRequestError } from '../../domain/errors';
import type { TransactionHandler, TransactionPlan } from './transaction-handler';

export class TransferHandler implements TransactionHandler<TransferCommand> {
  readonly type = 'TRANSFER';

  plan({ sourceAccountId, destinationAccountId, amount }: TransferCommand): TransactionPlan {
    if (!sourceAccountId || !destinationAccountId) {
      throw new InvalidRequestError('Transfer needs a source and a destination account');
    }
    if (sourceAccountId === destinationAccountId) {
      throw new InvalidRequestError('Source and destination accounts must differ');
    }

    return {
      amount,
      changes: [
        { accountId: sourceAccountId, delta: -amount },
        { accountId: destinationAccountId, delta: amount },
      ],
    };
  }
}
