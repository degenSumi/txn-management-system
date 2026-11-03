# TMS - spec / design notes

## Problem
Transaction management for a fintech app. Must have: account to account transfer,
validation (balance + limits), status lifecycle, safe balance updates under concurrency.
Should be easy to add deposit/withdrawal and new rules later.

## Stack
TypeScript (strict), Node, vitest. In-memory storage, no framework.
Kept storage behind interfaces so a DB can replace it later.

## Assumptions
- Single currency across the system, so accounts have no currency field.
- Amounts are in minor units (paise/pence) as bigint. No floats anywhere,
  0.1 + 0.2 problems are not acceptable for money.
- Single process for now
- Every write comes with an idempotency key (clients retry on timeouts).

## Entities
- Account: id, balance
- Transaction: id, idempotencyKey, fingerprint (hash of the payload), type, status,
  amount, changes (signed balance deltas), failure? (code + message), timestamps

## Status
PENDING -> COMPLETED
PENDING -> FAILED (rule failure or system error, code + message stored)
Completed/Failed are final. Transitions checked in one place, anything else throws.
Failed txns are kept, not dropped. Useful for audit/support.
Malformed requests never become txns: they throw a typed error and nothing is saved.

## Flow (same for every type)
1. check the request: key present, type known, handler builds a plan of balance
   changes, plan is valid. Malformed -> typed error, nothing saved
2. insert txn as PENDING, atomically by idempotency key -> same key + same payload
   returns the old txn, same key + different payload is an error
3. lock the accounts in the plan (sorted ids)
4. re-read balances inside the lock
5. run every validation rule inside the lock, so sufficiency is never checked on
   a stale balance
6. apply balance changes together, mark COMPLETED
7. rule failure or system error -> FAILED with reason, balances untouched

## Design
- Transaction types as handlers (strategy). A handler only returns a plan of signed
  balance changes, it never touches storage. Transfer now, deposit/withdrawal are
  just a new command + handler, one register line and one limit entry.
  TransactionService has no type specific logic.
- Validation rules as separate classes run in a chain. Every rule runs for every
  type, only the limit values differ per type. Limits live in config, not code,
  and a type with no configured limit is rejected.
- TransactionService is the only write path, so a new type can't skip validation
  or locking. Lock keys come from the plan, so a handler can't under-lock.
- Repos behind interfaces, in-memory impl.
- Constructor injection, one place where everything is wired.
- Typed errors with codes so failures give a clear reason.

## Edge cases
- zero / negative / non-integer amounts
- account not found, transfer to same account
- over the limit, insufficient balance
- parallel transfers on the same account (no overdraw)
- opposite direction transfers at the same time
- duplicate requests with the same key

## Not doing now
Double-entry ledger, FX, reversals, HTTP layer, persistence, daily cumulative limits.


## If this had to scale
- in-process lock -> DB row locks (SELECT ... FOR UPDATE, sorted order, / optim)
  or route each account to one partition/queue so there's a single writer