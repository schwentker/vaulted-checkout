// Iteration 0: ONE model call from spec.md + events.jsonl. Saved once, never
// regenerated or edited. Usage: node theater/build-scene.mjs <events.jsonl> --mode api|manual
import { realpathSync } from 'node:fs';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEATER, ROOT, sha256, loadManifest, saveManifest } from './manifest.mjs';
import { createModel, ManualPending } from './model.mjs';
import { readEvents } from './eval/checks.mjs';

const exists = async path => { try { await access(path); return true; } catch { return false; } };

export async function buildScene({ eventsPath, mode, theaterDir = THEATER, model, log = console.log }) {
  const manifestPath = join(theaterDir, 'manifest.json');
  const dir = join(theaterDir, 'iterations', '0');
  const manifest = await loadManifest(manifestPath);
  if (manifest.iteration0 || await exists(join(dir, 'scene.html'))) {
    log('build-scene: iteration 0 already exists; it is never regenerated. Refusing to overwrite.');
    return 1;
  }
  await readEvents(eventsPath); // schema + order check before spending a model call
  const spec = await readFile(join(theaterDir, 'spec.md'));
  const events = await readFile(eventsPath);
  await writeFile(join(theaterDir, 'build.json'), JSON.stringify({ events: eventsPath }, null, 2) + '\n');
  const m = model ?? createModel({ mode, manifestPath, packetsDir: join(theaterDir, 'packets'), env: process.env });
  let result;
  try { result = await m.generate({ spec, events, dir, run: 'iteration0' }); }
  catch (error) {
    if (error instanceof ManualPending) { log(`build-scene: manual packet written to ${error.packet}. Follow PROMPT.md there, then: node theater/ingest.mjs 0 generate`); return 3; }
    throw error;
  }
  await mkdir(dir, { recursive: true });
  const promptText = `${result.prompt}\n\n--- attached files ---\nspec.md sha256 ${sha256(spec)}\nevents.jsonl sha256 ${sha256(events)}\n`;
  await writeFile(join(dir, 'prompt.txt'), promptText);
  await writeFile(join(dir, 'scene.html'), result.html, { flag: 'wx' });
  const after = await loadManifest(manifestPath);
  after.iteration0 = {
    mode: m.mode, events_file: eventsPath, events_sha256: sha256(events), spec_sha256: sha256(spec),
    prompt_sha256: sha256(promptText), response_sha256: sha256(result.raw), response_file: result.rawFile,
    scene_sha256: sha256(result.html), created: new Date().toISOString(),
  };
  await saveManifest(manifestPath, after);
  log(`build-scene: iteration 0 saved (${join(dir, 'scene.html')}, sha256 ${after.iteration0.scene_sha256})`);
  return 0;
}

export function parseArgs(args) {
  const options = { events: null, mode: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode') options.mode = args[++i];
    else if (args[i] === '--events') options.events = args[++i];
    else if (!options.events) options.events = args[i];
    else throw new Error(`unknown argument ${args[i]}`);
  }
  return options;
}

const isMain = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const options = parseArgs(process.argv.slice(2));
  if (!options.events || !['api', 'manual'].includes(options.mode)) {
    console.error('usage: node theater/build-scene.mjs <events.jsonl> --mode api|manual');
    process.exit(64);
  }
  process.exitCode = await buildScene({ eventsPath: resolve(options.events), mode: options.mode }).catch(error => { console.error(`build-scene: ${error.message}`); return 1; });
}
