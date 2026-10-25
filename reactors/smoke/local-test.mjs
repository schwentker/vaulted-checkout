// Runs the smoke Reactor locally with a fake event. Uses the PUBLIC Hardhat #0 key for vault mode.
// node reactors/smoke/local-test.mjs   (needs viem@2.57.11 installed)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const handler = require('./reactor.js');

const PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
globalThis.fetch = async (url, init) => {
  if (!url.endsWith('/tokens/tok_test') || init.headers['BT-API-KEY'] !== 'runtime-key') return { ok: false, status: 403 };
  return { ok: true, json: async () => ({ id: 'tok_test', type: 'token', data: PK }) };
};
const base = { configuration: { WALLET_TOKEN_ID: 'tok_test', EXPECTED_ADDRESS: ADDR }, applicationOptions: { apiKey: 'runtime-key', baseUrl: 'https://api.test.basistheory.com' } };
const results = {
  selftest: await handler({ ...base, req: { mode: 'selftest' } }),
  vault: await handler({ ...base, req: { mode: 'vault' } }),
  wrongAddress: await handler({ ...base, configuration: { ...base.configuration, EXPECTED_ADDRESS: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }, req: { mode: 'vault' } }),
  noPerms: await handler({ ...base, applicationOptions: {}, req: { mode: 'vault' } }),
  bad: await handler({ ...base, req: {} }),
};
const s = JSON.stringify(results);
if (s.includes(PK.slice(2))) throw new Error('KEY LEAKED IN OUTPUT');
const pass = results.selftest.res.body.ok === true && results.vault.res.body.ok === true && results.vault.res.body.address === ADDR
  && results.wrongAddress.res.body.code === 'key_mismatch' && results.noPerms.res.body.code === 'key_unavailable' && results.bad.res.statusCode === 400;
console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { status: v.res.statusCode, ok: v.res.body.ok, code: v.res.body.code }]))));
if (!pass) { console.error('SMOKE LOCAL TEST FAILED'); process.exit(1); }
console.log('smoke local test PASS');
