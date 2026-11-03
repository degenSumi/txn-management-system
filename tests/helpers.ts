import type { Account, AccountId } from '../src/domain/account';
import type { TransferCommand } from '../src/domain/commands';
import { InMemoryStore } from '../src/repositories/in-memory-store';

/** Yields to the event loop on reads, like a database round trip would. */
export class SlowReadStore extends InMemoryStore {
  override async findAccount(id: AccountId): Promise<Account | undefined> {
    await new Promise(setImmediate);
    return super.findAccount(id);
  }
}

export function transfer(overrides: Partial<TransferCommand> = {}): TransferCommand {
  return {
    type: 'TRANSFER',
    idempotencyKey: 'key-1',
    sourceAccountId: 'alice',
    destinationAccountId: 'bob',
    amount: 300n,
    ...overrides,
  };
}
