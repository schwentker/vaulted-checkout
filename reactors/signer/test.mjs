// Local tests for the signer Reactor (contracts v1.1). Public test keys only. Run from repo root:
//   node scripts/build-signer.mjs --check && node reactors/signer/test.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { recoverTypedDataAddress, getAddress } from 'viem';
const require = createRequire(import.meta.url);
const handler = require('./reactor.js');
const core = require('../../contracts/reference/intent-core.cjs');
const g = JSON.parse(readFileSync(new URL('../../contracts/fixtures/golden-attempt.json', import.meta.url), 'utf8'));

const PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const cfg = { ...g.reactor_config, WALLET_TOKEN_ID: 'tok_test' };
const realNow = Date.now;
Date.now = () => g.now * 1000;                       // freeze clock at the golden time
let tokenData = PK;
let keyFetches = 0;
globalThis.fetch = async (url, init) => {
  keyFetches++;
  if (!url.endsWith('/tokens/tok_test') || init.headers['BT-API-KEY'] !== 'rt') return { ok: false, status: 403 };
  return { ok: true, json: async () => ({ data: tokenData }) };
};
const base = (req, c = cfg) => ({ req, configuration: c, applicationOptions: { apiKey: 'rt', baseUrl: 'https://api.test.basistheory.com' } });
const call = (req, c) => handler(base(req, c));
const macOrFixture = (intent) => { try { return core.macIntent(intent, cfg.INTENT_HMAC_KEY); } catch { return g.intent_mac; } };
const sign = (intent) => ({ intent, intent_mac: macOrFixture(intent) });
const keys = (o) => Object.keys(o).sort().join(',');

let failed = 0;
const t = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${ok ? '' : extra}`); };
const all = [];

// 1 golden: byte-identical to the fixture response, recovers to wallet
const r1 = await call(g.signer_request);
all.push(r1);
t('golden returns 200', r1.res.statusCode === 200, JSON.stringify(r1.res.body));
t('golden body equals fixture signer_response', JSON.stringify(r1.res.body) === JSON.stringify(g.signer_response.body));
t('success body has exactly schema keys', keys(r1.res.body) === 'attempt_id,from,ok,signature');
const rec = await recoverTypedDataAddress({ ...core.typedDataFor(g.intent, cfg, getAddress), signature: r1.res.body.signature });
t('signature recovers to wallet', rec === cfg.WALLET_ADDRESS);

// 2 retry determinism: same envelope twice gives identical output
const r2 = await call(g.signer_request);
t('retry returns identical signature', r2.res.body.signature === r1.res.body.signature);

// 3 every golden negative (17 in v1.1) is refused with its code; the key is never fetched for a refusal
t('fixture carries the v1.1 negatives', g.negatives.length >= 17, String(g.negatives.length));
const fetchesBefore = keyFetches;
for (const n of g.negatives) {
  const intent = { ...g.intent, ...n.patch };
  const r = await call(sign(intent), { ...cfg, ...n.cfg_patch }); all.push(r);
  t(`negative ${JSON.stringify(n.patch)} -> ${n.expect}`, r.res.body.code === n.expect && r.res.statusCode >= 400 && keys(r.res.body) === 'code,ok', JSON.stringify(r.res));
}
t('no key fetch for any refused intent', keyFetches === fetchesBefore, String(keyFetches - fetchesBefore));

// 4 v1.1 window rules stated directly (the phase 1 future-window bypass must stay closed)
const fut = await call(sign({ ...g.intent, valid_after: String(g.now + 86400), valid_before: String(g.now + 86460) })); all.push(fut);
t('future-dated window -> rule_window', fut.res.body.code === 'rule_window');
const edge = await call(sign({ ...g.intent, valid_after: String(g.now - 1), valid_before: String(g.now + 600) })); all.push(edge);
t('valid_after = now-1 and valid_before = now+600 is signable', edge.res.statusCode === 200, JSON.stringify(edge.res.body));

// 5 tamper: change a field without recomputing MAC -> 401
const r4 = await call({ intent: { ...g.intent, value: '1' }, intent_mac: g.intent_mac }); all.push(r4);
t('tampered value without MAC -> bad_mac 401', r4.res.statusCode === 401 && r4.res.body.code === 'bad_mac');
const r5 = await call({ intent: g.intent, intent_mac: core.macIntent(g.intent, 'attacker-key') }); all.push(r5);
t('MAC made with wrong key -> 401', r5.res.statusCode === 401);
const r5b = await call({ intent: g.intent, intent_mac: g.intent_mac.toUpperCase() }); all.push(r5b);
t('uppercase MAC hex -> 401 (fixed-width lowercase only)', r5b.res.statusCode === 401);
const r5c = await call(g.signer_request, { ...cfg, INTENT_HMAC_KEY: '' }); all.push(r5c);
t('missing INTENT_HMAC_KEY in config -> 401', r5c.res.statusCode === 401);

// 6 shape: unknown extra field, missing field, wrong types, empty, array
const r6a = await call({ intent: { ...g.intent, extra: 'x' }, intent_mac: g.intent_mac }); all.push(r6a);
t('unknown extra field -> 400', r6a.res.statusCode === 400);
const { nonce, ...missing } = g.intent;
const r6b = await call({ intent: missing, intent_mac: g.intent_mac }); all.push(r6b);
t('missing field -> 400', r6b.res.statusCode === 400);
const r6c = await call({}); all.push(r6c);
t('empty request -> 400', r6c.res.statusCode === 400);
const r6d = await call({ intent: { ...g.intent, value: 1500000 }, intent_mac: g.intent_mac }); all.push(r6d);
t('numeric value (not string) -> 400', r6d.res.statusCode === 400);
const r6e = await call({ intent: [g.intent], intent_mac: g.intent_mac }); all.push(r6e);
t('intent as array -> 400', r6e.res.statusCode === 400);
const r6f = await handler({ configuration: cfg, applicationOptions: {} }); all.push(r6f);
t('event without req -> 400', r6f.res.statusCode === 400);

// 7 caller cannot override config: request fields never read for rules
const r7 = await call({ ...g.signer_request, configuration: { PAYTO_ALLOWLIST: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' }, MAX_AMOUNT: '999999999' }); all.push(r7);
t('extra request fields cannot change rules', r7.res.statusCode === 200);
const r7b = await call(sign({ ...g.intent, to: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' }), { ...cfg }); all.push(r7b);
t('payee outside config allowlist -> rule_payto', r7b.res.body.code === 'rule_payto');

// 8 malformed config fails closed without fetching the key
const f8 = keyFetches;
const r8m = await call(g.signer_request, { ...cfg, MAX_AMOUNT: 'lots' }); all.push(r8m);
t('malformed MAX_AMOUNT config -> 500 internal', r8m.res.statusCode === 500 && r8m.res.body.code === 'internal', JSON.stringify(r8m.res));
const r8n = await call(g.signer_request, { ...cfg, PAYTO_ALLOWLIST: '' }); all.push(r8n);
t('empty allowlist -> rule_payto', r8n.res.body.code === 'rule_payto');
t('no key fetch for malformed config', keyFetches === f8);

// 9 key problems
const r8a = await call(g.signer_request, { ...cfg, WALLET_TOKEN_ID: 'other' }); all.push(r8a);
t('token not readable -> key_unavailable 500', r8a.res.statusCode === 500 && r8a.res.body.code === 'key_unavailable');
tokenData = '****-masked'; const r8b = await call(g.signer_request); all.push(r8b);
t('masked token data -> key_unavailable', r8b.res.body.code === 'key_unavailable');
tokenData = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; const r8c = await call(g.signer_request); all.push(r8c);
t('key for another address -> key_mismatch', r8c.res.body.code === 'key_mismatch');
tokenData = PK;
const r8d = await handler({ req: g.signer_request, configuration: cfg, applicationOptions: {} }); all.push(r8d);
t('no runtime permissions -> key_unavailable', r8d.res.body.code === 'key_unavailable');
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('network down'); };
const r8e = await call(g.signer_request); all.push(r8e);
t('token fetch throws -> 500 internal', r8e.res.statusCode === 500 && r8e.res.body.code === 'internal');
globalThis.fetch = savedFetch;

// 10 clock: Reactor clock past the window, and Reactor clock behind issued_at
Date.now = () => (g.now + 700) * 1000;
const r9 = await call(g.signer_request); all.push(r9);
t('Reactor clock 700 s later -> 403', r9.res.statusCode === 403, JSON.stringify(r9.res.body));
Date.now = () => (g.now - 61) * 1000;
const r9b = await call(g.signer_request); all.push(r9b);
t('Reactor clock 61 s behind issued_at -> stale_intent', r9b.res.body.code === 'stale_intent', JSON.stringify(r9b.res.body));
Date.now = () => g.now * 1000;

// 11 status codes match the signer-response schema description
const STATUS = { bad_request: 400, bad_mac: 401, key_unavailable: 500, key_mismatch: 500, internal: 500 };
t('every refusal uses its schema status', all.filter(r => r.res.body.ok === false).every(r => r.res.statusCode === (STATUS[r.res.body.code] || 403)));

// 12 leak scan over every output + source
const blob = JSON.stringify(all);
t('no private key or MAC key in any output', !blob.includes(PK.slice(2)) && !blob.includes(cfg.INTENT_HMAC_KEY));
const src = readFileSync(new URL('./reactor.js', import.meta.url), 'utf8');
t('source has no logging calls', !/console\.|\.logger|process\.stdout|process\.stderr/.test(src));
t('source has no key material', !src.includes(PK.slice(2)) && !src.includes(cfg.INTENT_HMAC_KEY));
t('source inlines the v1.1 core (strict valid_after)', src.includes('after >= now') && src.includes('(1n << 256n) - 1n'));

Date.now = realNow;
if (failed) { console.error(`${failed} FAILED`); process.exit(1); }
console.log('signer tests PASS');
