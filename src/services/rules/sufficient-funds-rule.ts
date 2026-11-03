import type { AccountId } from '../../domain/account';
import { InsufficientFundsError } from '../../domain/errors';
import type { RuleContext, ValidationRule } from './validation-rule';

/** Works from the balance changes, not the type, so any new type that debits is covered. */
export class SufficientFundsRule implements ValidationRule {
  validate({ transaction, accounts }: RuleContext): void {
    const netChanges = new Map<AccountId, bigint>();
    for (const { accountId, delta } of transaction.changes) {
      netChanges.set(accountId, (netChanges.get(accountId) ?? 0n) + delta);
    }

    for (const account of accounts.values()) {
      const net = netChanges.get(account.id) ?? 0n;
      if (net < 0n && account.balance + net < 0n) {
        throw new InsufficientFundsError(account.id, account.balance, -net);
      }
    }
  }
}
