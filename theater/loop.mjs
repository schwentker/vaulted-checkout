// Render, check, critique, repair. Usage:
//   node theater/loop.mjs --events <file> --iterations N --mode api|manual [--out <dir>]
// Frozen evaluation first (exit 2 on mismatch). Iteration 0 is read-only.
// Resumable: finished steps (checks.json, critique.json, next scene.html) are kept.
// Exit codes: 0 done, 1 error, 2 frozen eval tampered, 3 waiting for a manual RESPONSE.txt.
import { realpathSync } from 'node:fs';
import { readFile, writeFile, mkdir, access, copyFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { THEATER, ROOT, sha256, sha256File, loadManifest } from './manifest.mjs';
import { createModel, ManualPending } from './model.mjs';
import { writeScoreboard } from './scoreboard.mjs';

const exists = async path => { try { await access(path); return true; } catch { return false; } };

export async function runLoop({ eventsPath, iterations = 3, mode, out, root = ROOT, theaterDir = THEATER, model, capture, log = console.log }) {
  // 1. Frozen evaluation, before anything else.
  const { verifyFrozen } = await import(join(root, 'theater/eval/verify-frozen.mjs'));
  if (!await verifyFrozen(root)) { log('loop: theater/eval does not match FROZEN.sha256. Aborting.'); return 2; }
  const checksCli = join(root, 'theater/eval/checks.mjs');
  const { readEvents } = await import(checksCli);
  await readEvents(eventsPath);

  // 2. Iteration 0 must exist and match its manifest hash.
  const manifestPath = join(theaterDir, 'manifest.json');
  const manifest = await loadManifest(manifestPath);
  const zero = join(theaterDir, 'iterations', '0', 'scene.html');
  if (!manifest.iteration0 || !await exists(zero) || await sha256File(zero) !== manifest.iteration0.scene_sha256) {
    log('loop: iteration 0 is missing or does not match manifest.json. Run build-scene first; never edit iteration 0.');
    return 1;
  }
  const defaultOut = join(theaterDir, 'iterations');
  out = resolve(out ?? defaultOut);
  const run = relative(theaterDir, out) || 'iterations';
  if (out !== resolve(defaultOut)) {
    await mkdir(join(out, '0'), { recursive: true });
    const copy = join(out, '0', 'scene.html');
    if (!await exists(copy)) await copyFile(zero, copy);
    if (await sha256File(copy) !== manifest.iteration0.scene_sha256) { log(`loop: ${copy} differs from iteration 0. Aborting.`); return 1; }
  }
  const packetsDir = out === resolve(defaultOut) ? join(theaterDir, 'packets') : join(out, 'packets');
  await writeFile(join(theaterDir, 'run.json'), JSON.stringify({ events: eventsPath, iterations, mode, out, packetsDir }, null, 2) + '\n');

  const m = model ?? createModel({ mode, manifestPath, packetsDir, env: process.env });
  if (!capture) ({ captureScene: capture } = await import(checksCli));
  const spec = await readFile(join(theaterDir, 'spec.md'));
  const rubric = await readFile(join(root, 'theater/eval/rubric.md'));
  const events = await readFile(eventsPath);
  let stoppedEarly = false;

  try {
    for (let i = 0; i <= iterations; i++) {
      const dir = join(out, String(i)), scene = join(dir, 'scene.html');
      // Render + frozen checks.
      if (!await exists(join(dir, 'checks.json'))) {
        log(`loop: [${i}] rendering (real time, 30 to 45 s)`);
        const observation = await capture(scene, { videoDir: dir });
        if (observation?.captureError) log(`loop: [${i}] capture failed (counted as a render failure). If every render fails, run: npx playwright install chromium ffmpeg`);
        for (const [n, frame] of (observation.frames ?? []).entries()) {
          if (typeof frame?.pngBase64 === 'string') await writeFile(join(dir, `frame-${n + 1}.png`), Buffer.from(frame.pngBase64, 'base64'));
        }
        await writeFile(join(dir, 'observation.json'), JSON.stringify(observation) + '\n');
        const checkRun = spawnSync(process.execPath, [checksCli, '--events', eventsPath, '--observation', join(dir, 'observation.json'), '--out', join(dir, 'checks.json')], { encoding: 'utf8' });
        if (checkRun.status !== 0 || !await exists(join(dir, 'checks.json'))) throw new Error('checks.mjs did not write checks.json');
      }
      const checksText = await readFile(join(dir, 'checks.json'));
      const totalBad = JSON.parse(checksText).total_bad;
      log(`loop: [${i}] frozen checks total_bad ${totalBad}`);

      // Model critique of the video.
      if (!await exists(join(dir, 'critique.json'))) {
        const video = join(dir, 'render.webm');
        let critique;
        if (!await exists(video)) critique = { scores: null, issues: [], verdict: 'revise', note: 'no video was captured, so the critic was not called' };
        else {
          log(`loop: [${i}] critique (${m.mode})`);
          const r = await m.critique({ spec, rubric, events, checks: checksText, videoPath: video, iteration: i, dir, run });
          critique = { ...r.critique, retried: r.retried, response_sha256: sha256(r.raw) };
        }
        await writeFile(join(dir, 'critique.json'), JSON.stringify(critique, null, 2) + '\n');
      }
      const critique = JSON.parse(await readFile(join(dir, 'critique.json'), 'utf8'));
      log(`loop: [${i}] verdict ${critique.verdict}`);

      if (critique.verdict === 'pass' && totalBad === 0) { stoppedEarly = i < iterations; log(`loop: [${i}] pass and total_bad 0, stopping`); break; }
      if (i === iterations) break;

      // Repair into the next iteration.
      const next = join(out, String(i + 1));
      if (!await exists(join(next, 'scene.html'))) {
        log(`loop: [${i}] repair (${m.mode}) -> ${i + 1}`);
        const current = await readFile(scene);
        const critiqueFile = await readFile(join(dir, 'critique.json'));
        const r = await m.repair({ scene: current, critique: critiqueFile, checks: checksText, spec, iteration: i, dir, run });
        await mkdir(next, { recursive: true });
        await writeFile(join(next, 'scene.html'), r.html, { flag: 'wx' });
        const diff = spawnSync('diff', ['-u', '--label', `${i}/scene.html`, '--label', `${i + 1}/scene.html`, scene, join(next, 'scene.html')], { encoding: 'utf8' });
        await writeFile(join(next, 'patch.diff'), diff.stdout ?? '');
      }
    }
  } catch (error) {
    if (error instanceof ManualPending) {
      log(`loop: manual packet written to ${error.packet}. Follow PROMPT.md there, save RESPONSE.txt, then run the ingest command it shows.`);
      return 3;
    }
    throw error;
  }

  // Frozen metrics over every iteration, then the scoreboard.
  const metrics = spawnSync(process.execPath, [join(root, 'theater/eval/metrics.mjs'), '--iterations', out, '--out', join(out, 'results.json')], { encoding: 'utf8' });
  if (metrics.status !== 0) { log('loop: metrics.mjs failed; see stderr'); log(metrics.stderr); return 1; }
  const board = await writeScoreboard(out, { stoppedEarly });
  log(`loop: scoreboard ${join(out, 'scoreboard.html')}`);
  log(`loop: ${board.summary}`);
  return 0;
}

export function parseArgs(args) {
  const options = { iterations: 3 };
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    if (!value) throw new Error(`missing value for ${flag}`);
    if (flag === '--events') options.events = value;
    else if (flag === '--iterations') options.iterations = Number(value);
    else if (flag === '--mode') options.mode = value;
    else if (flag === '--out') options.out = value;
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!options.events || !['api', 'manual'].includes(options.mode) || !Number.isInteger(options.iterations) || options.iterations < 0 || options.iterations > 6) {
    throw new Error('usage: node theater/loop.mjs --events <file> --mode api|manual [--iterations N] [--out dir]');
  }
  return options;
}

const isMain = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  let options;
  try { options = parseArgs(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(64); }
  process.exitCode = await runLoop({ eventsPath: resolve(options.events), iterations: options.iterations, mode: options.mode, out: options.out })
    .catch(error => { console.error(`loop: ${error.message}`); return 1; });
}
