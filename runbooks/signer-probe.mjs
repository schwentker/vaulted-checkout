// Gate B step 3: probe the deployed signer Reactor with requests it must refuse. None can yield a usable
// authorization: each would be at most 1 atomic unit (0.000001 USDC) and expire in 120 s even if wrongly signed.
// Needs env: BT_INVOKER_KEY, SIGNER_ID, INTENT_HMAC_KEY, MERCHANT_PAYTO. Reads the wallet address from Gate A evidence.
// Prints HTTP status and refusal code only, and writes the same to evidence/gate-b-probe.json.
//   cd runbooks && node signer-probe.mjs
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const core = require('../contracts/reference/intent-core.cjs');

const BASE = process.env.BT_API_BASE || 'https://api.test.basistheory.com';
if (BASE !== 'https://api.test.basistheory.com') { console.error('Refusing: not the test host'); process.exit(1); }
for (const k of ['BT_INVOKER_KEY', 'SIGNER_ID', 'INTENT_HMAC_KEY', 'MERCHANT_PAYTO']) {
  if (!process.env[k]) { console.error(`missing env ${k}`); process.exit(1); }
}
const prov = readFileSync(new URL('../evidence/gate-a-provision.json', import.meta.url), 'utf8');
const WALLET = JSON.parse(prov.slice(prov.indexOf('{'), prov.lastIndexOf('}') + 1)).address;
const now = Math.floor(Date.now() / 1000);

const intent = (patch = {}) => ({
  v: 'vc-intent-1', audience: 'vc-signer', order_id: 'probe_' + now, attempt_id: randomUUID(), chain_id: '84532',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', from: WALLET, to: process.env.MERCHANT_PAYTO, value: '1',
  valid_after: '0', valid_before: String(now + 120), nonce: '0x' + randomBytes(32).toString('hex'), policy_version: 'p1',
  issued_at: String(now), ...patch,
});
const macd = (i) => ({ intent: i, intent_mac: core.macIntent(i, process.env.INTENT_HMAC_KEY) });

const cases = [
  ['empty body', {}, 400, 'bad_request'],
  ['wrong MAC (HMAC runs inside BT)', { intent: intent(), intent_mac: '0'.repeat(64) }, 401, 'bad_mac'],
  ['value 0 with your MAC (config + MAC key match)', macd(intent({ value: '0' })), 403, 'rule_amount'],
  ['payee not on allowlist', macd(intent({ to: '0x000000000000000000000000000000000000dEaD' })), 403, 'rule_payto'],
  ['over the 5 USDC cap', macd(intent({ value: '5000001' })), 403, 'rule_amount'],
  ['future-dated window (v1.1 fix)', macd(intent({ valid_after: String(now + 3600), valid_before: String(now + 3660) })), 403, 'rule_window'],
  ['other policy version', macd(intent({ policy_version: 'p0' })), 403, 'rule_policy'],
];

const out = [];
let fails = 0;
for (const [name, body, wantStatus, wantCode] of cases) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/reactors/${encodeURIComponent(process.env.SIGNER_ID)}/react`, {
    method: 'POST', headers: { 'BT-API-KEY': process.env.BT_INVOKER_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await r.text();
  let b = null; try { b = JSON.parse(text); } catch {}
  const signed = !!(b && b.ok === true);
  const bodyOk = !!b && b.ok === false && b.code === wantCode && Object.keys(b).sort().join(',') === 'code,ok';
  const pass = !signed && bodyOk && r.status === wantStatus;
  if (!pass) fails++;
  const row = { case: name, http: r.status, code: b && typeof b.code === 'string' ? b.code : null, body_keys: b ? Object.keys(b).sort() : 'not json', ms: Date.now() - t0, pass };
  if (signed) row.alert = 'UNEXPECTED SIGNATURE: stop and tell Claude';
  out.push(row);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: http ${r.status} code ${row.code} (${row.ms} ms)${signed ? ' UNEXPECTED SIGNATURE' : ''}`);
}
writeFileSync(new URL('../evidence/gate-b-probe.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
if (fails) {
  const bodyOnly = out.every(r => r.code === cases[out.indexOf(r)][3]);
  console.log(bodyOnly
    ? 'Codes are right but HTTP status differs: Basis Theory may not pass res.statusCode through. Send evidence/gate-b-probe.json to Claude before paying.'
    : `${fails} probe(s) failed. Send evidence/gate-b-probe.json to Claude (it holds no keys).`);
  process.exit(1);
}
console.log('signer probe PASS: refusals, MAC key match, allowlist, cap and window rules are live');
