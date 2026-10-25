import { createRequire } from 'node:module';
import type { Intent, Rules } from './types.ts';
import type { getAddress } from 'viem';
const require = createRequire(import.meta.url);
export const core = require('../../../contracts/reference/intent-core.cjs') as {
  canonicalize(i: unknown): string;
  macIntent(i: Intent, key: string): string;
  verifyMac(i: unknown, mac: unknown, key: string): boolean;
  checkRules(i: Intent, cfg: Rules, now: number): string|null;
  typedDataFor(i: Intent, cfg: Rules, address: typeof getAddress): any;
};
