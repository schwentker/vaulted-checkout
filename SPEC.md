# Vaulted Checkout spec (v1.0, 2026-10-24)

Plan: FINAL-BUILD-PLAN.md (project files). Reviews: codex-review-1.md, codex-review-2.md.

## One sentence
An agent pays in testnet USDC over MCP using a signer inside Basis Theory. After one-time provisioning, the payment application does not hold the wallet private key. A trusted spend service authorizes attempts, and the Reactor enforces fixed per-payment constraints.

## Components

| Component | Trust | Owns | Never has |
|---|---|---|---|
| Agent (Claude Code) | untrusted | intent to buy | keys, payee, amount at pay time |
| mcp-adapter (stdio) | untrusted | 4 tools, sanitized output | intent HMAC key, invoker key, raw proofs |
| spend-service (buyer side) | trusted | decision module, attempts DB (SQLite), nonce + window allocation, intent MAC, Reactor invoke, x402 v2 client wire encoding, reconciliation | wallet private key |
| signer Reactor (BT, node24) | trusted code, BT runtime | MAC check, hard rules, EIP-712 build, key retrieval by fixed token id, signature | network calls except BT tokens API |
| merchant (seller) | separate party | manifest subset, products, orders, x402 v2 402 + verify/settle via facilitator | buyer keys |
| facilitator | external | verify + settle on Base Sepolia | |

Design change vs FINAL-BUILD-PLAN: the trusted decision module lives in a buyer-side **spend-service**, not inside the merchant. Reason: in the B2B story the buyer company's policy authorizes spend; the seller must not hold invoke rights to the buyer's signer. Same trust properties Codex required (outside MCP, owns attempts, authenticates intent). Codex to confirm in phase 2.

## Flow (happy path)
1. Agent calls `create_order(productId, qty)` via MCP; adapter forwards to merchant (pinned origin) through spend-service.
2. Agent calls `pay_order(orderId)`. Adapter -> spend-service `POST /pay {orderId}`.
3. spend-service POSTs the merchant pay endpoint without a proof, receives 402 with `PAYMENT-REQUIRED`; validates requirements against its config (network, asset, payTo allowlist, amount equals order total from merchant's order record).
4. spend-service creates attempt (one unresolved per order), allocates nonce + validAfter + validBefore, persists the full authorization tuple, MACs the intent envelope (contracts/intent.md).
5. spend-service invokes Reactor `POST /reactors/{id}/react` with `{intent, intent_mac}` using the invoker key.
6. Reactor verifies MAC and hard rules, retrieves key, signs EIP-712 TransferWithAuthorization over exactly the intent's tuple, returns `{signature, from}`.
7. spend-service persists signature, builds x402 v2 PaymentPayload, retries merchant pay with `PAYMENT-SIGNATURE`.
8. Merchant verifies + settles via facilitator, marks order paid only after settle success, returns `PAYMENT-RESPONSE`.
9. spend-service records settlement; adapter returns sanitized receipt (order, amount, tx hash, explorer link).

## Hard rules (Reactor configuration; caller cannot change)
CHAIN_ID=84532, ASSET=0x036CbD53842c5426634e7929541eC2318f3dCF7e, DOMAIN_NAME=USDC, DOMAIN_VERSION=2, WALLET_ADDRESS, WALLET_TOKEN_ID, PAYTO_ALLOWLIST (comma list), MAX_AMOUNT (atomic, e.g. 5000000 = 5 USDC), MAX_WINDOW_SECONDS (e.g. 600), INTENT_HMAC_KEY, AUDIENCE=vc-signer.

## Out of scope (roadmap)
Budgets across payments, manager approvals, voice, cards, Tempo/MPP, custom MCP extension, any-manifest generation.
