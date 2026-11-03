import type { AmountLimits } from '../services/rules/amount-limit-rule';

/** Amounts are in minor units, so 100_000_000n is 1,000,000.00. */
export const DEFAULT_LIMITS: AmountLimits = {
  TRANSFER: { min: 1n, max: 100_000_000n },
};
