import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { captureScene, evaluate, pixelVariance, readEvents, validateEvents } from './checks.mjs';
import { combine } from './metrics.mjs';
import { verifyFrozen, frozenFiles } from './verify-frozen.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '../..');
let good, bad, events;
before(async () => {
  const html = await readFile(resolve(HERE, 'self-test/correct.html'), 'utf8');
  events = JSON.parse(/id="events">([^<]+)<\/script>/.exec(html)[1]);
  [good, bad] = await Promise.all(['correct.html','refused-coin.html'].map(name => captureScene(resolve(HERE, 'self-test', name), { clock:true })));
}, { timeout:60_000 });

test('two real tiny pages: only the refused-order coin is flagged', () => {
  const correct = evaluate(events, good), incorrect = evaluate(events, bad);
  assert.deepEqual(correct, { contradictions:0, order_errors:0, amount_errors:0, render_failures:0, total_bad:0, issues:[] });
  assert.equal(incorrect.contradictions, 1); assert.equal(incorrect.total_bad, 1);
  assert.equal(incorrect.issues[0].code, 'opposite_outcome_element');
});
test('receipt, amount, outcome and timing corruption count deterministically', () => {
  const mutate = fn => { const observation = structuredClone(good); fn(observation); return evaluate(events, observation); };
  const amount = mutate(o => { o.snapshot.labels[1].text = 'ord_yes settled 7.5 USDC 0xd026fed3'; });
  assert.equal(amount.contradictions, 1); assert.equal(amount.amount_errors, 1); assert.equal(amount.total_bad, 2);
  assert.equal(mutate(o => { o.snapshot.labels[1].text = 'ord_yes settled 1.5 USDC 0xdeadbeef'; }).contradictions, 1);
  assert.equal(mutate(o => { o.snapshot.labels.push({text:'ord_no settled',t:5000}); }).contradictions, 1);
  assert.equal(mutate(o => { o.snapshot.elements.push({name:'refusal:ord_yes',visibleFrom:15000,visibleTo:36000}); }).contradictions, 1);
  assert.equal(mutate(o => { o.snapshot.elements[1].visibleFrom = 14999; }).order_errors, 1);
  assert.equal(mutate(o => { o.marks.reverse(); }).order_errors, 1);
  assert.equal(mutate(o => { o.marks[0].t = 16000; }).order_errors, 3); // inversion, early refusal element, early refusal label
  assert.equal(mutate(o => { o.snapshot.labels[1].t = 14999; }).order_errors, 1);
  assert.equal(mutate(o => { o.marks.pop(); }).order_errors, 1);
});
test('bad scenes and missing measurements fail closed without throwing', () => {
  for (const broken of [null, {}, { marks:[] }, { ...good, snapshot:null }, { ...good, frames:[] }]) assert.ok(evaluate(events, broken).total_bad > 0);
  const broken = structuredClone(good);
  broken.consoleErrors.push('error'); broken.pageErrors.push('error'); broken.done = false; broken.duration = 29; broken.elapsedMs = 100;
  assert.ok(evaluate(events, broken).render_failures >= 5);
  const ambiguous = structuredClone(good);
  ambiguous.snapshot.elements.push({name:'coin',visibleFrom:9000,visibleTo:36000});
  assert.equal(evaluate(events, ambiguous).render_failures, 1);
  assert.throws(() => pixelVariance(Buffer.from('not PNG')));
  assert.ok(pixelVariance(Buffer.from(good.frames[0].pngBase64,'base64')).variance >= 4);
});
test('uniform colored frames fail pixel variance even if the telemetry claims success', async () => {
  const { chromium } = await import('playwright'); const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:1280,height:720}});
    await page.setContent('<body style="margin:0;background:rgb(255,0,0)"></body>');
    const png = await page.screenshot(); assert.equal(pixelVariance(png).variance, 0);
    const observation = { ...good, frames:Array.from({length:6}, () => ({pngBase64:png.toString('base64')})) };
    assert.equal(evaluate(events, observation).render_failures, 6);
  } finally { await browser.close(); }
});
test('events schema and ordering reject malformed input', async () => {
  assert.equal(await validateEvents(await readEvents(resolve(ROOT, 'fixtures/events-gate-b.jsonl'))), true);
  assert.equal(await validateEvents([]), false);
  assert.equal(await validateEvents([...events].reverse()), false);
  assert.equal(await validateEvents([{...events[0],signature:'forbidden'}]), false);
});
test('checks CLI always emits JSON and exits zero on invalid inputs', async () => {
  for (const args of [[], ['--events','/no/such/events.jsonl','--scene','/no/such/scene.html']]) {
    const run = spawnSync(process.execPath, [resolve(HERE,'checks.mjs'),...args], { encoding:'utf8', timeout:10_000 });
    assert.equal(run.status, 0); assert.ok(JSON.parse(run.stdout).render_failures > 0);
  }
  const temp = await mkdtemp(resolve(tmpdir(), 'vc-checks-cli-'));
  try {
    const out = resolve(temp,'checks.json'); await writeFile(out, JSON.stringify({total_bad:0}));
    const run = spawnSync(process.execPath,[resolve(HERE,'checks.mjs'),'--events','/no/such/events','--scene','/no/such/page','--out',out],{encoding:'utf8'});
    assert.equal(run.status,0); assert.ok(JSON.parse(await readFile(out,'utf8')).total_bad > 0);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
test('metrics CLI writes every row and refuses a missing checks file without replacing results', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'vc-metrics-'));
  try {
    for (const [i,observation] of [bad,good,bad].entries()) {
      await mkdir(resolve(temp,String(i))); await writeFile(resolve(temp,String(i),'checks.json'),JSON.stringify(evaluate(events,observation)));
    }
    const out = resolve(temp,'results.json'), args = [resolve(HERE,'metrics.mjs'),'--iterations',temp,'--out',out];
    assert.equal(spawnSync(process.execPath,args,{encoding:'utf8'}).status,0);
    const saved = await readFile(out,'utf8'); assert.deepEqual(JSON.parse(saved).map(row=>row.total_bad),[1,0,1]);
    await rm(resolve(temp,'1/checks.json')); assert.equal(spawnSync(process.execPath,args,{encoding:'utf8'}).status,1);
    assert.equal(await readFile(out,'utf8'),saved);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
test('metrics preserves every iteration, including regressions, and rejects missing evidence', () => {
  const clean = evaluate(events, good), flawed = evaluate(events, bad);
  const rows = combine([{iteration:2,checks:flawed},{iteration:0,checks:flawed},{iteration:1,checks:clean}]);
  assert.deepEqual(rows.map(row => row.total_bad), [1,0,1]);
  assert.throws(() => combine([{iteration:1,checks:clean}]));
  assert.throws(() => combine([{iteration:0,checks:{...clean,total_bad:3}}]));
  assert.throws(() => combine([{iteration:0,checks:clean},{iteration:0,checks:clean}]));
});
test('frozen verifier detects file tampering and rejects incomplete or duplicate manifests', async () => {
  assert.equal(await verifyFrozen(), true);
  const temp = await mkdtemp(resolve(tmpdir(), 'vc-frozen-'));
  try {
    const lines = [];
    for (const file of frozenFiles) {
      const data = await readFile(resolve(ROOT,file)); await mkdir(dirname(resolve(temp,file)),{recursive:true}); await writeFile(resolve(temp,file),data);
      lines.push(`${createHash('sha256').update(data).digest('hex')}  ${file}`);
    }
    const manifest = resolve(temp,'theater/eval/FROZEN.sha256'); await writeFile(manifest,lines.join('\n')+'\n');
    assert.equal(await verifyFrozen(temp), true);
    await writeFile(resolve(temp,frozenFiles[0]), 'tampered'); assert.equal(await verifyFrozen(temp), false);
    await writeFile(resolve(temp,'theater/eval/verify-frozen.mjs'),await readFile(resolve(HERE,'verify-frozen.mjs')));
    const run = spawnSync(process.execPath,[resolve(temp,'theater/eval/verify-frozen.mjs')],{encoding:'utf8'}); assert.equal(run.status,2);
    await writeFile(manifest,[lines[1],lines[1],lines[2],lines[3]].join('\n')+'\n'); assert.equal(await verifyFrozen(temp), false);
    await writeFile(manifest,lines.slice(1).join('\n')+'\n'); assert.equal(await verifyFrozen(temp), false);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
