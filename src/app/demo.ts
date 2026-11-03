import type { TransferCommand } from '../domain/commands';
import { DomainError } from '../domain/errors';
import { createContainer } from './container';

const { accounts, transactions } = createContainer();

const transfer = (idempotencyKey: string, amount: bigint): TransferCommand => ({
  type: 'TRANSFER',
  idempotencyKey,
  sourceAccountId: 'alice',
  destinationAccountId: 'bob',
  amount,
});

async function printBalances(): Promise<void> {
  const [alice, bob] = await Promise.all([accounts.getBalance('alice'), accounts.getBalance('bob')]);
  console.log(`   balances: alice=${alice} bob=${bob}\n`);
}

async function attempt(title: string, command: TransferCommand): Promise<void> {
  console.log(title);
  try {
    const { status, failure } = await transactions.submit(command);
    console.log(`   ${status}${failure ? `: ${failure.code}: ${failure.message}` : ''}`);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    console.log(`   REJECTED: ${error.code}: ${error.message}`);
  }
  await printBalances();
}

await accounts.open('alice', 100_000n);
await accounts.open('bob');
console.log('Opened alice with 100000 and bob with 0 (minor units)');
await printBalances();

await attempt('1. Transfer 30000', transfer('demo-1', 30_000n));
await attempt('2. Same key, same payload: replays, money moves once', transfer('demo-1', 30_000n));
await attempt('3. Same key, different payload', transfer('demo-1', 40_000n));
await attempt('4. More than the balance', transfer('demo-2', 80_000n));
await attempt('5. Above the transaction limit', transfer('demo-3', 100_000_001n));
await attempt('6. Zero amount', transfer('demo-4', 0n));

console.log('7. 100 concurrent transfers of 10000 from a balance of 70000');
const results = await Promise.all(
  Array.from({ length: 100 }, (_, i) => transactions.submit(transfer(`race-${i}`, 10_000n))),
);
const completed = results.filter((result) => result.status === 'COMPLETED').length;
console.log(`   ${completed} completed, ${results.length - completed} failed`);
await printBalances();
