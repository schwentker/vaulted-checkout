'use strict';
// Reference implementation of contracts/intent.md. Pure functions, no I/O.
// The signer Reactor inlines this file (Reactor code must be one file); spend-service imports it.
// Changing behavior here is a contract change: update CHANGELOG.md and regenerate fixtures.

const crypto = require('crypto');

const INTENT_FIELDS = [
  'asset', 'attempt_id', 'audience', 'chain_id', 'from', 'issued_at', 'nonce',
  'order_id', 'policy_version', 'to', 'v', 'valid_after', 'valid_before', 'value',
];

const UINT = /^(0|[1-9][0-9]{0,77})$/;
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const NONCE = /^0x[0-9a-fA-F]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

function canonicalize(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw new Error('bad_request');
  const keys = Object.keys(intent);
  if (keys.length !== INTENT_FIELDS.length || !INTENT_FIELDS.every((k) => keys.includes(k))) {
    throw new Error('bad_request');
  }
  return '{' + INTENT_FIELDS.map((k) => {
    if (typeof intent[k] !== 'string') throw new Error('bad_request');
    return JSON.stringify(k) + ':' + JSON.stringify(intent[k]);
  }).join(',') + '}';
}

function macIntent(intent, key) {
  return crypto.createHmac('sha256', Buffer.from(key, 'utf8')).update(canonicalize(intent), 'utf8').digest('hex');
}

function verifyMac(intent, mac, key) {
  if (typeof mac !== 'string' || !/^[0-9a-f]{64}$/.test(mac)) return false;
  let expected;
  try { expected = Buffer.from(macIntent(intent, key), 'hex'); } catch { return false; }
  const got = Buffer.from(mac, 'hex');
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

function eq(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

// Returns null when all checks pass, else a signer-response error code.
// cfg values are strings from Reactor configuration; nowSec is an integer.
function checkRules(intent, cfg, nowSec) {
  try { canonicalize(intent); } catch { return 'bad_request'; }
  if (intent.v !== 'vc-intent-1') return 'bad_request';
  if (!UUID.test(intent.attempt_id) || !intent.order_id || intent.order_id.length > 128) return 'bad_request';
  for (const k of ['value', 'valid_after', 'valid_before', 'issued_at', 'chain_id']) {
    if (!UINT.test(intent[k]) || BigInt(intent[k]) > (1n << 256n) - 1n) return 'bad_request';
  }
  for (const k of ['asset', 'from', 'to']) if (!ADDR.test(intent[k])) return 'bad_request';
  if (!NONCE.test(intent.nonce)) return 'bad_request';

  if (intent.audience !== cfg.AUDIENCE) return 'rule_audience';
  if (intent.chain_id !== cfg.CHAIN_ID) return 'rule_chain';
  if (!eq(intent.asset, cfg.ASSET)) return 'rule_asset';
  if (!eq(intent.from, cfg.WALLET_ADDRESS)) return 'rule_from';
  const allow = String(cfg.PAYTO_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allow.some((a) => eq(a, intent.to))) return 'rule_payto';
  if (intent.policy_version !== cfg.POLICY_VERSION) return 'rule_policy';

  const value = BigInt(intent.value);
  if (value <= 0n || value > BigInt(cfg.MAX_AMOUNT)) return 'rule_amount';

  const now = BigInt(nowSec);
  const after = BigInt(intent.valid_after);
  const before = BigInt(intent.valid_before);
  const maxWindow = BigInt(cfg.MAX_WINDOW_SECONDS);
  if (after >= now || before <= now || before <= after || before - now > maxWindow) return 'rule_window';
  const issued = BigInt(intent.issued_at);
  if (issued > now + 60n || now - issued > maxWindow) return 'stale_intent';
  return null;
}

function typedDataFor(intent, cfg, getAddress) {
  return {
    domain: {
      name: cfg.DOMAIN_NAME,
      version: cfg.DOMAIN_VERSION,
      chainId: Number(cfg.CHAIN_ID),
      verifyingContract: getAddress(cfg.ASSET),
    },
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: getAddress(intent.from),
      to: getAddress(intent.to),
      value: BigInt(intent.value),
      validAfter: BigInt(intent.valid_after),
      validBefore: BigInt(intent.valid_before),
      nonce: intent.nonce,
    },
  };
}

module.exports = {
  INTENT_FIELDS, TRANSFER_WITH_AUTHORIZATION_TYPES, canonicalize, macIntent, verifyMac, checkRules, typedDataFor,
};
