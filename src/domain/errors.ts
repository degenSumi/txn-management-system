/** Base for every expected failure. `code` is stable and safe for callers to branch on. */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidRequestError extends DomainError {
  readonly code = 'INVALID_REQUEST';
}

export class UnsupportedTransactionTypeError extends DomainError {
  readonly code = 'UNSUPPORTED_TRANSACTION_TYPE';

  constructor(type: string) {
    super(`Unsupported transaction type: ${type}`);
  }
}

export class DuplicateHandlerError extends DomainError {
  readonly code = 'DUPLICATE_HANDLER';

  constructor(type: string) {
    super(`A handler is already registered for type: ${type}`);
  }
}

export class IdempotencyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_CONFLICT';

  constructor(key: string) {
    super(`Idempotency key ${key} was already used with a different payload`);
  }
}

export class InvalidStatusTransitionError extends DomainError {
  readonly code = 'INVALID_STATUS_TRANSITION';

  constructor(from: string, to: string) {
    super(`Cannot move a transaction from ${from} to ${to}`);
  }
}

export class AccountNotFoundError extends DomainError {
  readonly code = 'ACCOUNT_NOT_FOUND';

  constructor(accountId: string) {
    super(`Account not found: ${accountId}`);
  }
}

export class AccountAlreadyExistsError extends DomainError {
  readonly code = 'ACCOUNT_ALREADY_EXISTS';

  constructor(accountId: string) {
    super(`Account already exists: ${accountId}`);
  }
}

export class TransactionNotFoundError extends DomainError {
  readonly code = 'TRANSACTION_NOT_FOUND';

  constructor(transactionId: string) {
    super(`Transaction not found: ${transactionId}`);
  }
}

export class InsufficientFundsError extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS';

  constructor(accountId: string, balance: bigint, required: bigint) {
    super(`Account ${accountId} has ${balance} but needs ${required}`);
  }
}

export class TransactionLimitError extends DomainError {
  readonly code = 'TRANSACTION_LIMIT_EXCEEDED';

  constructor(type: string, amount: bigint, min: bigint, max: bigint) {
    super(`${type} amount ${amount} is outside the allowed range ${min} to ${max}`);
  }
}

export class LimitNotConfiguredError extends DomainError {
  readonly code = 'LIMIT_NOT_CONFIGURED';

  constructor(type: string) {
    super(`No transaction limit is configured for type: ${type}`);
  }
}
