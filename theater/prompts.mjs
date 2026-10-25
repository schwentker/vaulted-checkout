// Paste-ready prompts. The only material sent to the model is: spec, events,
// rubric, checks, scene, video. Prompt text is instructions around those files.

export const CRITIQUE_SHAPE = `{"scores":{"legibility":0,"sequence":0,"beat_discipline":0,"style":0,"truth_visual":0},"issues":[{"at_seconds":0,"severity":"high|medium|low","rule":"","saw":"","expected":"","fix":""}],"verdict":"pass|revise"}`;

export function generatePrompt() {
  return `You are generating a single-file 3D replay scene.

Attached: spec.md (the goal and the scene contract) and events.jsonl (the real payment log, one JSON object per line).

Write scene.html that follows spec.md exactly. Embed the events array verbatim in <script type="application/json" id="events">. Expose window.__theater exactly as the contract says, including marks and the cumulative snapshot(). Use three.js only from the pinned CDN URL in spec.md. No other network requests, no console errors, real-time playback of 30 to 45 seconds.

Answer with exactly one fenced code block tagged html containing the whole file, and nothing else.`;
}

export function critiquePrompt({ retry = false } = {}) {
  return `${retry ? 'Your previous answer was not valid JSON of the required shape. Answer again with JSON only.\n\n' : ''}You are the critic. Watch the attached video render.webm (1280x720, the full replay) and judge it against spec.md and rubric.md.

Attached: render.webm, spec.md, rubric.md, events.jsonl (the truth), checks.json (deterministic counts from a frozen evaluator; do not change or second-guess them, use them as evidence).

Score each rubric axis as an integer 0 to 10. List every issue you see with the time in seconds, severity, the spec or rubric rule, what you saw, what the evidence requires, and a concrete fix to the scene. verdict is "pass" only if you would ship this as is; otherwise "revise".

Answer with JSON only, no prose, no code fence, exactly this shape:
${CRITIQUE_SHAPE}`;
}

export function repairPrompt() {
  return `You are repairing a 3D replay scene.

Attached: scene.html (current version), critique.json (a video critique of it), checks.json (deterministic counts and issue codes from a frozen evaluator), spec.md (the goal and the scene contract).

Fix every issue in critique.json and every issue code in checks.json while keeping everything that already works. Do not change the embedded events. Keep window.__theater exactly as the contract says. Make the smallest changes that fix the problems.

Answer with exactly one fenced code block tagged html containing the whole repaired file, and nothing else.`;
}

// Strict extraction: one html block, or a bare document.
export function extractHtml(text) {
  if (typeof text !== 'string') throw new Error('bad_html_response');
  const blocks = [...text.matchAll(/```html[^\n]*\n([\s\S]*?)```/gi)];
  let html;
  if (blocks.length === 1) html = blocks[0][1];
  else if (blocks.length === 0 && /^\s*<(!doctype html|html)/i.test(text)) html = text;
  else throw new Error('bad_html_response');
  if (!/window\.__theater/.test(html) || !/id=["']events["']/.test(html)) throw new Error('bad_html_response');
  return html.trim() + '\n';
}

const AXES = ['legibility', 'sequence', 'beat_discipline', 'style', 'truth_visual'];
export function parseCritique(text) {
  if (typeof text !== 'string') throw new Error('bad_json_response');
  const body = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  let value;
  try { value = JSON.parse(body); } catch { throw new Error('bad_json_response'); }
  const ok = value && typeof value === 'object' && value.scores && typeof value.scores === 'object'
    && AXES.every(axis => Number.isInteger(value.scores[axis]) && value.scores[axis] >= 0 && value.scores[axis] <= 10)
    && Array.isArray(value.issues)
    && value.issues.every(issue => issue && typeof issue === 'object' && typeof issue.at_seconds === 'number'
      && ['severity', 'rule', 'saw', 'expected', 'fix'].every(field => typeof issue[field] === 'string'))
    && ['pass', 'revise'].includes(value.verdict);
  if (!ok) throw new Error('bad_json_response');
  return { scores: Object.fromEntries(AXES.map(axis => [axis, value.scores[axis]])), issues: value.issues, verdict: value.verdict };
}
