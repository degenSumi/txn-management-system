import { LimitNotConfiguredError, TransactionLimitError } from '../../domain/errors';
import type { RuleContext, ValidationRule } from './validation-rule';

export interface AmountLimit {
  readonly min: bigint;
  readonly max: bigint;
}

export type AmountLimits = Readonly<Record<string, AmountLimit>>;

export class AmountLimitRule implements ValidationRule {
  constructor(private readonly limits: AmountLimits) {}

  /** Fails closed: a new type with no configured limit is rejected, not waved through. */
  validate({ transaction: { type, amount } }: RuleContext): void {
    const limit = this.limits[type];
    if (!limit) throw new LimitNotConfiguredError(type);
    if (amount < limit.min || amount > limit.max) {
      throw new TransactionLimitError(type, amount, limit.min, limit.max);
    }
  }
}
