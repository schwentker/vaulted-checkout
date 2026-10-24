// Operator only. Generates a fresh test wallet key IN MEMORY, tokenizes it in Basis Theory, prints only the
// token id and the public address. The key is never printed, logged, or written to disk.
//   read -s BT_PROVISIONER_KEY; export BT_PROVISIONER_KEY
//   BT_API_BASE=https://api.test.basistheory.com node provision-key.mjs
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const base = process.env.BT_API_BASE || 'https://api.test.basistheory.com';
const apiKey = process.env.BT_PROVISIONER_KEY;
if (!apiKey) { console.error('BT_PROVISIONER_KEY not set'); process.exit(1); }
if (!base.includes('api.test.')) { console.error('Refusing: BT_API_BASE is not the test host'); process.exit(1); }

let pk = generatePrivateKey();
const address = privateKeyToAccount(pk).address;
const r = await fetch(`${base}/tokens`, {
  method: 'POST',
  headers: { 'BT-API-KEY': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'token', data: pk, metadata: { purpose: 'vaulted-checkout-test-wallet' } }),
});
pk = null;
if (!r.ok) { console.error('tokenize failed, HTTP', r.status); process.exit(1); }
const tok = await r.json();
console.log(JSON.stringify({ token_id: tok.id, address, containers: tok.containers || null }, null, 2));
console.log('Next: delete the vc-key-provisioner application in the portal, then: unset BT_PROVISIONER_KEY');
