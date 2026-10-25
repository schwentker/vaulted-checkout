// Replays a recorded payment log in the terminal, checks the frozen evaluator, then points at the scene.
// Usage: node scripts/demo-replay.mjs [events.jsonl] [scene.html] [--fast]
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const fast = args.includes('--fast');
const [events = 'fixtures/events-gate-b.jsonl', scene = 'theater/runs/r2/2/scene.html'] = args.filter(a => a !== '--fast');
const wait = ms => fast ? Promise.resolve() : new Promise(r => setTimeout(r, ms));
const say = text => process.stdout.write(`${text}\n`);

say('REPLAY of a recorded log. Nothing below is a live payment.\n');
const verify = spawnSync(process.execPath, ['theater/eval/verify-frozen.mjs'], { encoding: 'utf8' });
say(`frozen evaluator: ${verify.status === 0 ? 'unchanged' : 'TAMPERED (exit ' + verify.status + ')'}`);
if (verify.status !== 0) process.exit(verify.status ?? 1);

const log = (await readFile(events, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
say(`log: ${events}, ${log.length} events\n`);
for (const e of log) {
  await wait(1500);
  if (e.kind === 'refused') say(`REFUSED  ${e.orderId}  vault rule: ${e.code}  (no coin moves)`);
  else if (e.kind === 'settled') say(`SETTLED  ${e.orderId}  ${e.amount} USDC  receipt ${e.txHash.slice(0, 10)}\n         https://sepolia.basescan.org/tx/${e.txHash}`);
  else say(`${e.kind.toUpperCase().padEnd(8)} ${e.orderId ?? ''}`);
}
await wait(1000);
say(`\nSpend Theater scene for this log (Gemini 4 Argon, iteration 2): file://${resolve(scene)}`);
