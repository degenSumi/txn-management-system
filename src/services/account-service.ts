import type { Account, AccountId } from '../domain/account';
import { AccountNotFoundError, InvalidRequestError } from '../domain/errors';
import type { AccountRepository } from '../repositories/interfaces';

export class AccountService {
  constructor(private readonly accounts: AccountRepository) {}

  async open(id: AccountId, openingBalance = 0n): Promise<Account> {
    if (!id) throw new InvalidRequestError('Account id is required');
    if (typeof openingBalance !== 'bigint' || openingBalance < 0n) {
      throw new InvalidRequestError('Opening balance must be a non-negative bigint');
    }

    const account: Account = { id, balance: openingBalance };
    await this.accounts.insertAccount(account);
    return account;
  }

  async getBalance(id: AccountId): Promise<bigint> {
    const account = await this.accounts.findAccount(id);
    if (!account) throw new AccountNotFoundError(id);
    return account.balance;
  }
}
