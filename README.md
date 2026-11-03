# Transaction Management System

An in-memory transaction system for a fintech application, written in strict TypeScript. It does account-to-account transfers with validation, a status lifecycle, idempotent writes and safe concurrent balance updates.

## Setup and run

Requires Node 22 or later.

```sh
npm install
npm run typecheck
npm test
npm run demo
```

`npm run demo` runs a transfer, a retry, a key conflict, each failure mode and a concurrent race, printing balances after each.

## Usage

```ts
import { createContainer } from './src/app/container';

const { accounts, transactions } = createContainer();
await accounts.open('alice', 100_000n);
await accounts.open('bob');

const result = await transactions.submit({
  type: 'TRANSFER',
  idempotencyKey: 'order-42',
  sourceAccountId: 'alice',
  destinationAccountId: 'bob',
  amount: 30_000n,
});
// result.status is 'COMPLETED', or 'FAILED' with result.failure = { code, message }
```

## Architecture

```
src/
  domain/        Account, Transaction and its state machine, commands, typed errors
  repositories/  Storage interfaces and the in-memory implementation
  services/      TransactionService (core write path), handlers, rules, locking
  app/           Composition root, limits config, demo
```

Dependencies point inward: `app` wires everything, `services` depend on the repository interfaces, and `domain` depends on nothing.

| Pattern | Where | Why |
| --- | --- | --- |
| Strategy | `services/handlers` | Each type only describes its balance changes |
| Registry | `HandlerRegistry` | Finds the handler for a type without a switch statement |
| Chain of Responsibility | `services/rules` | Rules run in order, and the first to throw rejects |
| Repository | `repositories/interfaces.ts` | Storage can be swapped without touching services |
| Dependency injection | `app/container.ts` | One composition root, and tests swap the store and lock |

### The write path

`TransactionService.submit` is the only way to change a balance, and every type goes through it:

1. Check the idempotency key and find the handler.
2. The handler returns a plan of signed balance changes, and the core validates that plan.
3. Atomically insert a `PENDING` transaction by idempotency key.
4. Lock the accounts in the plan.
5. Inside the lock, read current balances and run every rule.
6. Commit the `COMPLETED` status and new balances as one atomic step.

Any failure in steps 5 or 6 records `FAILED` and returns it.

### Key decisions

- **Money is bigint minor units**, because floats can't represent 0.1 exactly.
- **Handlers return data and never touch storage.** They can't skip validation, and lock keys come from their plan, so they can't under-lock.
- **Locks are per account and taken in sorted order.** The funds check runs inside the lock. Sorting prevents deadlock between A to B and B to A, and per-account locks let unrelated transfers run in parallel. The lock sorts the keys itself, so a caller can't get this wrong.
- **Idempotency uses an atomic insert by key.** The same key and payload returns the original. The same key with a different payload throws `IdempotencyConflictError`.

### Error handling

| Kind | Examples | Result |
| --- | --- | --- |
| Malformed request | Bad amount, empty key, same-account transfer, unknown type, key conflict | Throws a typed `DomainError`, and nothing is persisted |
| Business failure | Insufficient funds, limit exceeded, account not found | Returns a persisted `FAILED` transaction with `failure.code` |
| System failure | Storage error during commit | Returns a persisted `FAILED` transaction with code `SYSTEM_ERROR`, balances unchanged |

Status moves only from `PENDING` to `COMPLETED` or `FAILED`, and both are terminal. Any other move throws `InvalidStatusTransitionError`.

## Extending

**New transaction type:** write a command and a handler, add a limit, and register the handler. `tests/extensibility.test.ts` does this for cash deposit and withdrawal with no change to `src/`.

```ts
class CashDepositHandler implements TransactionHandler<CashCommand> {
  readonly type = 'CASH_DEPOSIT';

  plan({ accountId, amount }: CashCommand): TransactionPlan {
    return { amount, changes: [{ accountId, delta: amount }] };
  }
}
```

Add the handler to the `HandlerRegistry` list in `src/app/container.ts`, and add `CASH_DEPOSIT` to `src/app/config.ts`. A new type with no limit configured is rejected rather than allowed. Any type that debits gets the funds check automatically, because that rule reads the balance changes.

**New validation rule:** implement `ValidationRule`, then add it to the list in `src/app/container.ts`. It applies to every type.

## Assumptions and known limits

- Single implicit currency.
- Limits are per transaction, with a min and max by type. There are no daily cumulative limits, though rules are async so one could read from storage.
- Accounts are funded by an opening balance, as there is no deposit type yet.
- The in-memory lock and store work within one process. Scaling out means row locks or a distributed lock behind `KeyedLock`, and a database behind the repository interfaces.
- A duplicate that arrives while the original is in flight gets the `PENDING` record back, not the final result.
- A failed result replays on its key, including `SYSTEM_ERROR`, so trying again needs a new key.
- A crash between `PENDING` and commit leaves a `PENDING` row, which would need a recovery sweeper.
- There is no HTTP layer, as the problem does not ask for one.
# txn-management-system
