import type { AccountId } from './account';
import { InvalidStatusTransitionError } from './errors';

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

const ALLOWED_TRANSITIONS: Record<TransactionStatus, readonly TransactionStatus[]> = {
  PENDING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

/** A signed movement on one account. Types differ only in the changes they produce. */
export interface BalanceChange {
  readonly accountId: AccountId;
  readonly delta: bigint;
}

export interface TransactionFailure {
  readonly code: string;
  readonly message: string;
}

export interface NewTransaction {
  readonly id: string;
  readonly type: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly amount: bigint;
  readonly changes: readonly BalanceChange[];
}

interface TransactionState extends NewTransaction {
  readonly status: TransactionStatus;
  readonly failure: TransactionFailure | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Immutable: each status change returns a new instance. */
export class Transaction {
  readonly id: string;
  readonly type: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly amount: bigint;
  readonly changes: readonly BalanceChange[];
  readonly status: TransactionStatus;
  readonly failure: TransactionFailure | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(state: TransactionState) {
    this.id = state.id;
    this.type = state.type;
    this.idempotencyKey = state.idempotencyKey;
    this.fingerprint = state.fingerprint;
    this.amount = state.amount;
    this.changes = state.changes;
    this.status = state.status;
    this.failure = state.failure;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    Object.freeze(this);
  }

  static pending(transaction: NewTransaction): Transaction {
    const now = new Date();
    return new Transaction({
      ...transaction,
      status: 'PENDING',
      failure: undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  complete(): Transaction {
    return this.transitionTo('COMPLETED');
  }

  fail(failure: TransactionFailure): Transaction {
    return this.transitionTo('FAILED', failure);
  }

  private transitionTo(status: TransactionStatus, failure?: TransactionFailure): Transaction {
    if (!ALLOWED_TRANSITIONS[this.status].includes(status)) {
      throw new InvalidStatusTransitionError(this.status, status);
    }
    return new Transaction({ ...this, status, failure, updatedAt: new Date() });
  }
}
