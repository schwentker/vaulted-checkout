# Codex phase 2 prompt (paste into Codex at repo root)

Model: GPT-6.1 Sol, effort High (use Medium only for plain route/boilerplate work).

You are the phase 2 builder for Vaulted Checkout. Read in order: AGENTS.md, SPEC.md, FINAL-BUILD-PLAN.md, contracts/README.md, contracts/intent.md, contracts/state-machine.md, contracts/schemas/*, contracts/reference/intent-core.cjs, docs/handoff/phase-1.md. Follow AGENTS.md strictly (no keys, no .env reads, no em dashes).

Part A: review phase 1 (adversarial, write docs/review/phase-1-review.md)
- Attack the intent envelope, MAC canonicalization, rule checks, retry-by-same-envelope claim, state machine, reconcile rules, and the spend-service vs merchant split. Cite file + line. Severity blocker/high/med/low. Mark VERIFIED/UNVERIFIED with sources.
- Run the golden generator and smoke local test after installing deps; report results.
- Any contract change: edit the contract, regenerate golden, add CHANGELOG entry, list it in your handoff.

Part B: build (after A)
1. `git init`, workspace layout (packages/spend-service, packages/merchant, packages/mcp-adapter placeholder), pinned exact deps, one lockfile. You own package.json + lockfile. Deps: viem 2.57.11, @x402/core 2.28.0, @x402/evm 2.28.0, (@x402/express 2.28.0 if you choose it), one MCP SDK pinned, one SQLite driver pinned.
2. merchant: manifest subset at /.well-known/commerce-manifest (document deviations vs consortium v0.1.0 incl. x402 v2 headers), GET /api/products, POST /api/orders (immutable price), GET /api/orders/{id}, POST /api/orders/{id}/pay returning 402 + PAYMENT-REQUIRED, then verify + settle via https://x402.org/facilitator, order `paid` only after settle success, idempotent per contracts/state-machine.md "Duplicate requests". SQLite.
3. spend-service: decision module + attempts store implementing contracts/state-machine.md invariants I1 to I5 exactly (partial unique index, unique nonce, tuple written once), requirement validation against its config, intent MAC via intent-core.cjs, Reactor invoke client (POST {BT_API_BASE}/reactors/{id}/react with invoker key from env, timeouts -> sign_unknown), PaymentPayload build + `encodePaymentSignatureHeader`, reconcile job using `authorizationState(from, nonce)` on Base Sepolia USDC. Use a LOCAL MOCK SIGNER in tests that calls intent-core checkRules + signs with the PUBLIC Hardhat #0 key, behind the same interface as the Reactor client.
4. Tests: golden fixture byte-equality (your PAYMENT-SIGNATURE for the golden inputs must equal golden payment_signature_header), invariants, concurrency (two parallel pay on one order -> one attempt), duplicate pay returns existing status/receipt.

Do not: deploy anything, touch Basis Theory, read .env, build the MCP adapter (phase 5), or change reactors/smoke.

End with docs/handoff/phase-2.md (TEMPLATE.md format), including model + effort used and anything Claude must review in phase 3.
