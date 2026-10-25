// Key and model smoke test: one tiny low-thinking call. Prints status and whether text came back.
// Usage: GEMINI_API_KEY set, then: node theater/ping.mjs
// Never prints the key or the response body beyond the first 80 characters of text.
import { responseText } from './model.mjs';
import https from 'node:https';

const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('ping: GEMINI_API_KEY is not set in this shell'); process.exit(64); }
const base = (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
const model = process.env.GEMINI_MODEL ?? 'gemini-4-argon';
const body = JSON.stringify({ model, input: 'Say ok', generation_config: { thinking_level: 'low' } });
const started = Date.now();
console.error(`ping: POST ${base}/interactions model ${model}`);
const req = https.request(`${base}/interactions`, { method: 'POST', timeout: 60000, headers: { 'content-type': 'application/json', 'x-goog-api-key': key } }, res => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    console.error(`ping: HTTP ${res.statusCode} after ${Date.now() - started} ms`);
    if (res.statusCode !== 200) { console.error(`ping: error body (first 300 chars): ${raw.slice(0, 300).replaceAll(key, '[key]')}`); process.exit(1); }
    let value; try { value = JSON.parse(raw); } catch { console.error('ping: 200 but body is not JSON'); process.exit(1); }
    const text = responseText(value);
    console.error(text ? `ping: OK, text: ${JSON.stringify(text.slice(0, 80))}` : `ping: 200 but no text found; top-level keys: ${Object.keys(value).join(', ')}`);
    process.exit(text ? 0 : 1);
  });
});
req.on('timeout', () => { console.error('ping: no answer in 60 s (network, proxy, VPN, or wrong GEMINI_BASE_URL)'); req.destroy(); process.exit(1); });
req.on('error', e => { console.error(`ping: connection error: ${e.code ?? e.message}`); process.exit(1); });
req.end(body);
