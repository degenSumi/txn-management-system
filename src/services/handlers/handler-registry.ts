import { DuplicateHandlerError, UnsupportedTransactionTypeError } from '../../domain/errors';
import type { TransactionHandler } from './transaction-handler';

export class HandlerRegistry {
  private readonly handlers = new Map<string, TransactionHandler>();

  constructor(handlers: readonly TransactionHandler[]) {
    for (const handler of handlers) {
      if (this.handlers.has(handler.type)) throw new DuplicateHandlerError(handler.type);
      this.handlers.set(handler.type, handler);
    }
  }

  get(type: string): TransactionHandler {
    const handler = this.handlers.get(type);
    if (!handler) throw new UnsupportedTransactionTypeError(type);
    return handler;
  }
}
