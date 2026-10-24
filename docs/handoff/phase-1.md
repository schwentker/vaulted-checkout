# Handoff: phase 1

- Builder / model / effort: Claude Code, Opus 5.5, high
- Date (UTC): 2026-10-24
- Branch + commit: none yet (folder is not a git repo; Codex initializes in phase 2)
- Contract version: v1 (CHANGELOG 2026-10-24)

## Done
- SPEC.md, AGENTS.md, CLAUDE.md, FINAL-BUILD-PLAN.md copy, CHANGELOG.md, .gitignore
- contracts/: intent envelope + canonical MAC (intent.md), state machine + reconcile rules (state-machine.md), 5 JSON schemas, reference core `contracts/reference/intent-core.cjs` (canonicalize, MAC, verify, rule checks, EIP-712 typed data), golden fixture + generator
- reactors/smoke/: Gate A Reactor (selftest + vault modes), local harness
- runbooks/: gate-a.md, provision-key.mjs (key generated in memory, never printed or saved), verify-signature.mjs

## Tests (run in a clean workspace with viem@2.57.11, @x402/core@2.28.0, @x402/evm@2.28.0)
- `node contracts/fixtures/gen-golden.mjs` -> `golden ok` (MAC roundtrip, rule pass, deterministic signature verified by signing twice, recover match, 12 negative cases each hit the expected code). GREEN.
- golden payment_required + payment_payload pass `@x402/core/schemas` validators. GREEN.
- `node reactors/smoke/local-test.mjs` -> `smoke local test PASS` (selftest, vault, key_mismatch, key_unavailable, bad_request; asserts key not in output). GREEN.
- `verify-signature.mjs` on local vault output -> match true. GREEN.
- `provision-key.mjs` refuses non-test host. GREEN.
- NOT RUN: anything against Basis Theory or Base Sepolia (cloud cannot reach them; Gate A is Robert's).

## Decisions made in phase 1 (Codex: challenge these)
1. Trusted decision module = buyer-side spend-service, separate from the merchant (SPEC.md). Merchant never holds invoke rights.
2. Retry safety via same envelope + deterministic RFC 6979 signing (verified in golden: two signatures identical). No new nonce or validBefore ever for an attempt.
3. Intent MAC = HMAC-SHA256 over canonical sorted-key JSON of 14 string fields; unknown fields rejected.
4. spend-service owns x402 wire encoding using `@x402/core/http` encode functions; Reactor returns only `{ok, from, signature, attempt_id}`.
5. issued_at freshness = MAX_WINDOW_SECONDS; older attempts go to reconcile, not re-sign.
6. Smoke Reactor signs an expired zero-value message so its signature is shareable.

## Doc conflicts found (BT)
- Handler param named `event` vs `req` across pages; we use `event` and read `event.req`. Gate A step 6 confirms.
- `@basis-theory/node-sdk-2` in a docs sample does not exist on npm (404). We use plain `fetch` with `event.applicationOptions.{apiKey, baseUrl}`; no BT SDK dependency.
- Return shape: we use `{ res: { statusCode, body } }` (node22/24 table), not `{ raw }`.

## Open questions for Codex
- Is SQLite (better-sqlite3 or node:sqlite) OK for both spend-service and merchant, two files?
- MCP SDK: choose `@modelcontextprotocol/sdk@1.32.2` or `@modelcontextprotocol/server@2.4.0`; pick one and pin.
- Merchant: use `@x402/express@2.28.0` middleware with a verified post-settlement hook, or explicit verify/settle? Order must be paid only after settle success (C7).

## Next action
Robert: run runbooks/gate-a.md. In parallel Codex starts phase 2 (prompt: docs/handoff/phase-2-prompt.md); phase 2 does not need Gate A to begin, but nothing deploys until Gate A passes.
