# Vaulted Checkout, with Spend Theater

Vaulted Checkout is the payment system. Spend Theater is the Gemini 4 Argon part: it takes Vaulted Checkout's real payment log and builds, watches, critiques and repairs a short 3D film of every payment the agent tried, scored by a frozen evaluator Argon cannot edit.

Phase 2: a buyer-side spend service and a separate merchant, each with SQLite persistence. Local tests use the public Hardhat #0 account, a mock signer with real EIP-712 signing, a fake facilitator, and a fake chain. They make no Basis Theory, RPC, or facilitator requests.

Use Node **26.12.0** and npm **11.20.0** for the workspace. The Reactor remains Node 24 and does not import the SQLite driver or these server packages. All direct dependencies are pinned; `package-lock.json` is the single lockfile. SQLite uses `better-sqlite3@13.0.3`. Its exact install script is approved in package.json for reproducible clean installs.

```sh
npm ci
npm run golden
npm run smoke:test
npm run typecheck
npm test
npm run demo:local
```

The demo prints sanitized payment status and fake receipts, then closes its temporary localhost server and removes its temporary databases. Fake transaction hashes are not chain evidence. Golden PAYMENT-SIGNATURE bytes must remain unchanged for the original fixture inputs.

The phase 1 attack results are in [docs/review/phase-1-review.md](docs/review/phase-1-review.md). Contract changes are v1.1 in [CHANGELOG.md](CHANGELOG.md). Phase 3 must inline the updated `contracts/reference/intent-core.cjs` into the signer and independently review recovery behavior.

## Components

- `packages/merchant`: immutable order pricing, manifest subset, x402 v2 challenge, explicit facilitator verification/settlement, persistent proof claims, and reconciliation. It has no buyer signing credential.
- `packages/spend-service`: buyer policy checks, immutable MAC-authenticated intent allocation, durable attempt state, signer client, payload encoding, sanitized receipt output, and reconciliation.
- `packages/shared`: wire validation, encoding, HTTP and SQLite helpers, and contract interfaces.
- `packages/mcp-adapter`: phase 5 placeholder only. The SDK is pinned for later work.

The spend HTTP surface is `GET /products`, `POST /orders {items}`, `GET /orders/{id}`, and `POST /pay {orderId}`. Each item contains only `productId` and `quantity`. The caller cannot provide payment amount, payee, nonce, expiry, intent, or signature. Duplicates return the existing attempt or receipt.

Only a human operator may run the real runtime entry points after Gate A and the phase 3 signer are ready:

```sh
node scripts/start-merchant.ts
node scripts/start-spend.ts
```

These scripts do not read .env files. The spend process needs operator-supplied `BT_API_BASE`, `BT_SIGNER_REACTOR_ID`, `BT_INVOKER_KEY`, `INTENT_HMAC_KEY`, `WALLET_ADDRESS`, and the public merchant configuration. Merchant needs only its own public payee/origin and RPC endpoint. Keep each process's credentials separate. Defaults bind localhost ports 4000/4001; optional `MERCHANT_DB_PATH` and `SPEND_DB_PATH` select separate persistent files. These entry points were typechecked but deliberately not executed in phase 2.

On restart, recover interrupted signing/submission before accepting requests. RPC reconciliation reads one finalized block and requires matching authorization use plus transfer evidence. Unknowns remain unknown on errors, consumed-but-unmatched nonces, or oversized historical scans. The RPC adapter bounds scans to 100,000 blocks in 5,000-block chunks; longer outages need a reviewed indexing/manual evidence path. There is no production authentication, aggregate budget enforcement, or mainnet support.

## Consortium subset

The merchant exposes `/.well-known/commerce-manifest`, `GET /api/products`, `POST /api/orders`, `GET /api/orders/{id}`, and `POST /api/orders/{id}/pay`. Payment uses x402 v2 `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`, `eip155:84532`, exact EIP-3009, and Base Sepolia USDC. Amounts are atomic decimal strings, with six USDC decimals.

This is a fixed adapter profile based on the [consortium v0.1.0 draft](https://basistheory.ai/consortium/v0-1-0). It intentionally differs in x402 version/header names, uses a small local order schema and paymentStatus values, adds an order-read route, and omits cards, shipping, taxes, broader commerce endpoints, and automatic arbitrary-manifest tool generation. No full-conformance claim is made.
