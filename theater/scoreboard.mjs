// Scoreboard for EVERY iteration of one run. Frozen-check counts first (from
// theater/eval/metrics.mjs combine(), so rows equal results.json), then the
// model-judged scores, labeled as such. No best-of, no smoothing.
// Usage: node theater/scoreboard.mjs [run dir, default theater/iterations]
import { realpathSync } from 'node:fs';
import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEATER } from './manifest.mjs';
import { combine } from './eval/metrics.mjs';

export const MODEL_LABEL = 'model-judged, same model family as the generator';
const COUNTS = ['contradictions', 'order_errors', 'amount_errors', 'render_failures', 'total_bad'];
const AXES = ['legibility', 'sequence', 'beat_discipline', 'style', 'truth_visual'];
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function buildScoreboard(out, { stoppedEarly = false } = {}) {
  const dirs = (await readdir(out, { withFileTypes: true })).filter(e => e.isDirectory() && /^(0|[1-9][0-9]*)$/.test(e.name));
  const entries = await Promise.all(dirs.map(async e => ({ iteration: Number(e.name), checks: JSON.parse(await readFile(join(out, e.name, 'checks.json'), 'utf8')) })));
  const counts = combine(entries); // throws on a missing or inconsistent iteration
  const rows = [];
  for (const row of counts) {
    const dir = join(out, String(row.iteration));
    let critique = null;
    if (await exists(join(dir, 'critique.json'))) critique = JSON.parse(await readFile(join(dir, 'critique.json'), 'utf8'));
    const still = [4, 3, 1].map(n => `frame-${n}.png`);
    let stillFile = null;
    for (const s of still) if (await exists(join(dir, s))) { stillFile = `${row.iteration}/${s}`; break; }
    rows.push({
      ...row,
      model_judged: critique?.scores ? { ...critique.scores } : null,
      verdict: critique?.verdict ?? null,
      issue_count: Array.isArray(critique?.issues) ? critique.issues.length : null,
      still: stillFile,
      video: await exists(join(dir, 'render.webm')) ? `${row.iteration}/render.webm` : null,
    });
  }
  const first = rows[0], last = rows[rows.length - 1];
  let summary;
  if (rows.length === 1) summary = `Only iteration 0 exists: total_bad ${first.total_bad}.`;
  else if (last.total_bad > first.total_bad) summary = `The last iteration is WORSE than iteration 0 on frozen checks: total_bad ${first.total_bad} -> ${last.total_bad}. Shown as is.`;
  else if (last.total_bad === first.total_bad) summary = `No change on frozen checks from iteration 0 to the last: total_bad ${first.total_bad} -> ${last.total_bad}.`;
  else summary = `Frozen checks improved from iteration 0 to the last: total_bad ${first.total_bad} -> ${last.total_bad}.`;
  const regressions = rows.slice(1).filter((r, i) => r.total_bad > rows[i].total_bad).map(r => r.iteration);
  if (regressions.length) summary += ` Regressed at iteration ${regressions.join(', ')} versus the one before.`;
  if (stoppedEarly) summary += ` Stopped early at iteration ${last.iteration}: critic verdict pass and total_bad 0.`;
  return { run: out, model_judged_label: MODEL_LABEL, rows, first_vs_last: { first: first.iteration, last: last.iteration, first_total_bad: first.total_bad, last_total_bad: last.total_bad }, regressions, stopped_early: stoppedEarly, summary };
}

export function renderHtml(board) {
  const cell = v => v === null || v === undefined ? '<td class="na">n/a</td>' : `<td>${esc(v)}</td>`;
  const body = board.rows.map(r => `<tr><th>${r.iteration}</th>${COUNTS.map(c => cell(r[c])).join('')}${AXES.map(a => cell(r.model_judged?.[a])).join('')}${cell(r.verdict)}<td>${r.still ? `<a href="${esc(r.still)}"><img src="${esc(r.still)}" alt="iteration ${r.iteration} still" loading="lazy"></a>` : 'n/a'}</td><td>${r.video ? `<a href="${esc(r.video)}">render.webm</a>` : 'n/a'}</td></tr>`).join('\n');
  const pair = [board.rows[0], board.rows[board.rows.length - 1]];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spend Theater scoreboard</title>
<style>
:root{--paper:#f3ead7;--ink:#1d2433;--blue:#163f78;--red:#ad2424;--muted:#6b6457}
body{margin:0;padding:24px 16px;background:var(--paper);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
main{max-width:1200px;margin:0 auto}h1{color:var(--blue);margin:0 0 8px}
.summary{font-size:17px;margin:12px 0 20px;padding:12px 14px;background:#fff8e6;border-left:4px solid var(--red)}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;background:#fffdf7}
th,td{border:1px solid #d8ccb2;padding:6px 8px;text-align:center;vertical-align:middle}
thead th{background:#ece1c8}.group-frozen{background:#dbe5f3!important}.group-model{background:#f6e3c4!important}
td.na{color:var(--muted)}img{width:200px;height:auto;display:block}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:20px}
.pair figure{margin:0}.pair img{width:100%}.pair video{width:100%}
small{color:var(--muted)}
</style></head><body><main>
<h1>Spend Theater scoreboard</h1>
<p class="summary">${esc(board.summary)}</p>
<div class="wrap"><table>
<thead><tr><th rowspan="2">Iteration</th><th class="group-frozen" colspan="5">Frozen checks (deterministic, theater/eval)</th><th class="group-model" colspan="6">${esc(board.model_judged_label)} (0 to 10)</th><th rowspan="2">Still</th><th rowspan="2">Video</th></tr>
<tr>${COUNTS.map(c => `<th class="group-frozen">${c}</th>`).join('')}${AXES.map(a => `<th class="group-model">${a}</th>`).join('')}<th class="group-model">verdict</th></tr></thead>
<tbody>
${body}
</tbody></table></div>
<p><small>Every iteration is listed. Frozen counts come from theater/eval/checks.mjs and match results.json. Model-judged scores never change the frozen counts.</small></p>
<h2>Iteration ${pair[0].iteration} vs iteration ${pair[1].iteration}</h2>
<div class="pair">${pair.map(r => `<figure>${r.video ? `<video src="${esc(r.video)}" controls preload="metadata"${r.still ? ` poster="${esc(r.still)}"` : ''}></video>` : r.still ? `<img src="${esc(r.still)}" alt="">` : '<p>no render</p>'}<figcaption>Iteration ${r.iteration}: total_bad ${r.total_bad}</figcaption></figure>`).join('')}</div>
</main></body></html>
`;
}

export async function writeScoreboard(out, options) {
  const board = await buildScoreboard(out, options);
  await writeFile(join(out, 'scoreboard.json'), JSON.stringify(board, null, 2) + '\n');
  await writeFile(join(out, 'scoreboard.html'), renderHtml(board));
  return board;
}

const isMain = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const out = resolve(process.argv[2] ?? join(THEATER, 'iterations'));
  const board = await writeScoreboard(out).catch(error => { console.error(`scoreboard: ${error.message}`); process.exit(1); });
  console.log(board.summary);
}
