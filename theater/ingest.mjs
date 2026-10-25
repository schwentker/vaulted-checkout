// Manual mode: validate a RESPONSE.txt pasted from AI Studio, then continue.
// Usage: node theater/ingest.mjs <iteration> <step>   (step: generate | critique | critique-retry | repair)
// The response is never edited. Its sha256 is recorded in manifest.json when the
// loop consumes it. A critique that is not valid JSON makes the loop write one
// critique-retry packet; a second bad answer stops the loop.
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEATER, sha256 } from './manifest.mjs';
import { extractHtml, parseCritique } from './prompts.mjs';
import { buildScene } from './build-scene.mjs';
import { runLoop } from './loop.mjs';

export async function ingest({ iteration, step, theaterDir = THEATER, log = console.log, ...rest }) {
  if (!['generate', 'critique', 'critique-retry', 'repair'].includes(step)) throw new Error('step must be generate, critique, critique-retry or repair');
  if (step === 'generate') {
    const text = await readFile(join(theaterDir, 'packets', '0', 'generate', 'RESPONSE.txt'), 'utf8');
    extractHtml(text);
    log(`ingest: RESPONSE.txt ok, sha256 ${sha256(text)}`);
    const events = JSON.parse(await readFile(join(theaterDir, 'build.json'), 'utf8')).events;
    return buildScene({ eventsPath: events, mode: 'manual', theaterDir, log, ...rest });
  }
  const run = JSON.parse(await readFile(join(theaterDir, 'run.json'), 'utf8'));
  const text = await readFile(join(run.packetsDir, String(iteration), step, 'RESPONSE.txt'), 'utf8');
  try { step === 'repair' ? extractHtml(text) : parseCritique(text); log(`ingest: RESPONSE.txt ok, sha256 ${sha256(text)}`); }
  catch (error) {
    if (step === 'repair') { log('ingest: RESPONSE.txt has no single complete html block with window.__theater. Not editing it; the loop will stop.'); return 1; }
    log(`ingest: RESPONSE.txt is not valid critique JSON (${step}). ${step === 'critique' ? 'The loop will write one retry packet.' : 'Second bad answer; the loop will stop.'}`);
  }
  return runLoop({ eventsPath: run.events, iterations: run.iterations, mode: 'manual', out: run.out, theaterDir, log, ...rest });
}

const isMain = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const [iteration, step] = process.argv.slice(2);
  if (!/^\d+$/.test(iteration ?? '') || !step) { console.error('usage: node theater/ingest.mjs <iteration> <step>'); process.exit(64); }
  process.exitCode = await ingest({ iteration: Number(iteration), step }).catch(error => { console.error(`ingest: ${error.message}`); return 1; });
}
