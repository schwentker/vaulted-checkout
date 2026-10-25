'use strict';
// Gate A smoke Reactor (node24). Proves: (1) viem loads and signs in this tenant, (2) runtime token:read+token:reveal
// can retrieve the vaulted wallet key by a fixed token id. It never returns or logs the key.
// The message it signs is a TransferWithAuthorization that is already expired (validBefore = 1) with value 0,
// so the signature can be shared for verification and can never move funds.
//
// Configuration (Reactor configuration, not code): WALLET_TOKEN_ID, EXPECTED_ADDRESS (vault mode only).
// Invoke body: { "mode": "selftest" } or { "mode": "vault" }

const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const { recoverTypedDataAddress } = require('viem');

const SAFE_TYPED_DATA = {
  domain: {
    name: 'USDC', version: '2', chainId: 84532,
    verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  types: {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ],
  },
  primaryType: 'TransferWithAuthorization',
};

function safeMessage(from) {
  return {
    from, to: '0x000000000000000000000000000000000000dEaD',
    value: 0n, validAfter: 0n, validBefore: 1n, nonce: '0x' + '00'.repeat(31) + '01',
  };
}

function out(statusCode, body) {
  return { res: { statusCode, body } };
}

async function signAndRecover(account) {
  const td = { ...SAFE_TYPED_DATA, message: safeMessage(account.address) };
  const signature = await account.signTypedData(td);
  const recovered = await recoverTypedDataAddress({ ...td, signature });
  return { signature, recovered_ok: recovered === account.address };
}

async function fetchKey(event) {
  const opts = event.applicationOptions || {};
  const id = event.configuration && event.configuration.WALLET_TOKEN_ID;
  if (!opts.apiKey || !opts.baseUrl || !id) return { error: 'key_unavailable' };
  const r = await fetch(`${opts.baseUrl}/tokens/${encodeURIComponent(id)}`, { headers: { 'BT-API-KEY': opts.apiKey } });
  if (!r.ok) return { error: 'key_unavailable', status: r.status };
  const tok = await r.json();
  const pk = tok && tok.data;
  if (typeof pk !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(pk)) return { error: 'key_unavailable', status: 'masked_or_bad_format' };
  return { pk };
}

module.exports = async function (event) {
  const t0 = Date.now();
  const req = (event && event.req) || {};
  try {
    if (req.mode === 'selftest') {
      const account = privateKeyToAccount(generatePrivateKey());
      const r = await signAndRecover(account);
      return out(200, { ok: r.recovered_ok, mode: 'selftest', ms: Date.now() - t0 });
    }
    if (req.mode === 'vault') {
      const k = await fetchKey(event);
      if (k.error) return out(500, { ok: false, code: k.error, status: k.status || null });
      const account = privateKeyToAccount(k.pk);
      const expected = event.configuration.EXPECTED_ADDRESS || '';
      if (account.address.toLowerCase() !== expected.toLowerCase()) return out(500, { ok: false, code: 'key_mismatch' });
      const r = await signAndRecover(account);
      return out(200, { ok: r.recovered_ok, mode: 'vault', address: account.address, signature: r.signature, ms: Date.now() - t0 });
    }
    return out(400, { ok: false, code: 'bad_request' });
  } catch (e) {
    return out(500, { ok: false, code: 'internal' });
  }
};
