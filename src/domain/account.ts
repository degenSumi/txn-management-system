export type AccountId = string;

/** Balance is in integer minor units, because floats can't represent 0.1 exactly. */
export interface Account {
  readonly id: AccountId;
  readonly balance: bigint;
}

// System Account / Fee Account
