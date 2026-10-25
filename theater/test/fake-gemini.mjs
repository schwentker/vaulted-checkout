// Test doubles for the model layer. No real key, no network.
// - scenes: a broken scene (coin on the refused order) and a fixed scene.
// - fakeTransport: canned responses per step, same interface as the api/manual transports.
// - startFakeServer: a local HTTP stand-in for the Interactions API, to check wire shapes.
import http from 'node:http';

export function sceneHtml(events, { broken = false } = {}) {
  const refused = events.find(e => e.kind === 'refused'), settled = events.find(e => e.kind === 'settled');
  const beats = events.map((event, index) => ({ event, at: 5000 + index * 10000 }));
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>fake scene${broken ? ' (broken)' : ''}</title>
<style>body{margin:0;background:#f3ead7;color:#1d2433;font:28px sans-serif}#stage{padding:40px}.vault{color:#163f78}.coin{color:#ad2424}#caption{position:fixed;bottom:0;left:0;right:0;background:#1d2433;color:#fff;padding:16px}</style></head>
<body><div id="stage"><p>Buyer | Agent | Spend | <span class="vault">Vault</span> | Merchant | Chain</p></div><div id="caption">Replay starts.</div>
<script type="application/json" id="events">${JSON.stringify(events)}</script>
<script>
const events = JSON.parse(document.getElementById('events').textContent);
const labels = [], elements = [];
const D = 32;
window.__theater = { duration: D, marks: [], done: false, snapshot: () => ({ labels, elements }) };
for (const s of ['buyer','agent','spend','vault','merchant','chain']) elements.push({ name: s, visibleFrom: 0, visibleTo: D * 1000 });
const show = (text, cls) => document.getElementById('stage').insertAdjacentHTML('beforeend', '<p class="' + cls + '">' + text + '</p>');
${beats.map(({ event, at }) => event.kind === 'refused' ? `setTimeout(() => {
  show('${event.orderId} refused ${event.code}', 'vault');
  __theater.marks.push({ t: ${at}, kind: 'refused', orderId: '${event.orderId}', element: 'refusal' });
  labels.push({ text: '${event.orderId} refused ${event.code}', t: ${at} });
  elements.push({ name: 'refusal:${event.orderId}', visibleFrom: ${at}, visibleTo: D * 1000 });${broken ? `
  elements.push({ name: 'coin:${event.orderId}', visibleFrom: ${at}, visibleTo: D * 1000 });` : ''}
}, ${at});` : `setTimeout(() => {
  const text = '${event.orderId} settled ${event.amount} USDC ${event.txHash.slice(0, 10)}';
  show(text, 'coin');
  __theater.marks.push({ t: ${at}, kind: '${event.kind}', orderId: '${event.orderId}', element: 'coin' });
  labels.push({ text, t: ${at} });
  elements.push({ name: 'coin:${event.orderId}', visibleFrom: ${at}, visibleTo: D * 1000 });
}, ${at});`).join('\n')}
setTimeout(() => { __theater.done = true; }, D * 1000);
</script></body></html>
`;
}

export const htmlAnswer = html => `Here is the scene.\n\n\`\`\`html\n${html}\`\`\`\n`;

export function critiqueAnswer(verdict, issues = []) {
  return JSON.stringify({ scores: { legibility: 7, sequence: 8, beat_discipline: 7, style: 6, truth_visual: verdict === 'pass' ? 9 : 3 }, issues, verdict });
}
export const COIN_ISSUE = { at_seconds: 5, severity: 'high', rule: 'refused buy: no coin', saw: 'a coin on the refused order', expected: 'refusal mark only, merchant dark', fix: 'remove the coin element from the refused beat' };

// Canned responses per step, consumed in order. Records every call.
export function fakeTransport(script) {
  const queues = Object.fromEntries(Object.entries(script).map(([k, v]) => [k, [...v]]));
  const calls = [];
  return {
    model: 'fake-gemini',
    calls,
    async call({ step, iteration, prompt, files, thinking }) {
      calls.push({ step, iteration, thinking, files: files.map(f => f.name), prompt });
      const queue = queues[step];
      if (!queue?.length) throw new Error(`fake-gemini: no canned response for ${step}`);
      const text = queue.shift();
      return { raw: JSON.stringify({ id: `fake-${calls.length}`, status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text }] }] }), rawName: 'response.json', text };
    },
  };
}

// Local Interactions stand-in: POST /v1beta/interactions returns queued texts.
export async function startFakeServer(texts) {
  const queue = [...texts], requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      requests.push({ url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
      if (req.method !== 'POST' || req.url !== '/v1beta/interactions') { res.writeHead(404).end(); return; }
      const text = queue.shift() ?? '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: `int-${requests.length}`, status: 'completed', steps: [{ type: 'thought', summary: 'x' }, { type: 'model_output', content: [{ type: 'text', text }] }] }));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}/v1beta`, requests, close: () => new Promise(r => server.close(r)) };
}
