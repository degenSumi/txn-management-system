import { createHash } from 'node:crypto';
import type { TransactionCommand } from '../domain/commands';

/** Identifies a payload, independent of field order. The key itself is excluded. */
export function fingerprint({ idempotencyKey: _key, ...payload }: TransactionCommand): string {
  return createHash('sha256').update(JSON.stringify(payload, canonicalize)).digest('hex');
}

function canonicalize(_field: string, value: unknown): unknown {
  if (typeof value === 'bigint') return `${value}n`;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return value;
}
