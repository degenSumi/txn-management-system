import type { AccountRepository, TransactionRepository } from '../repositories/interfaces';
import { InMemoryStore } from '../repositories/in-memory-store';
import { AccountService } from '../services/account-service';
import { HandlerRegistry } from '../services/handlers/handler-registry';
import type { TransactionHandler } from '../services/handlers/transaction-handler';
import { TransferHandler } from '../services/handlers/transfer-handler';
import { InMemoryKeyedLock, type KeyedLock } from '../services/locking/keyed-lock';
import { AmountLimitRule, type AmountLimits } from '../services/rules/amount-limit-rule';
import { SufficientFundsRule } from '../services/rules/sufficient-funds-rule';
import type { ValidationRule } from '../services/rules/validation-rule';
import { TransactionService } from '../services/transaction-service';
import { DEFAULT_LIMITS } from './config';

export interface ContainerOptions {
  readonly store?: AccountRepository & TransactionRepository;
  readonly lock?: KeyedLock;
  readonly limits?: AmountLimits;
  readonly extraHandlers?: readonly TransactionHandler[];
  readonly extraRules?: readonly ValidationRule[];
}

/** Composition root: the only place that chooses concrete implementations. */
export function createContainer(options: ContainerOptions = {}) {
  const store = options.store ?? new InMemoryStore();
  const handlers = new HandlerRegistry([new TransferHandler(), ...(options.extraHandlers ?? [])]);
  const rules: ValidationRule[] = [
    new AmountLimitRule(options.limits ?? DEFAULT_LIMITS),
    new SufficientFundsRule(),
    ...(options.extraRules ?? []),
  ];

  return {
    accounts: new AccountService(store),
    transactions: new TransactionService(handlers, rules, store, store, options.lock ?? new InMemoryKeyedLock()),
  };
}
