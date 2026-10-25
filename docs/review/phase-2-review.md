# Phase 2 review (Claude, Opus 5.5, high)

Scope: contracts v1.1 (intent-core.cjs, intent.md, state-machine.md, golden fixture), packages/merchant, packages/spend-service, packages/shared, tests. Method: read every source file, ran `npm test` (21/21) and `npm run golden` (fixture unchanged, `git diff` empty), then ran the real generated signer Reactor inside the phase 2 harness (tests/signer-integration.test.ts, 6/6) and two scratch reproductions kept outside the repo. `npm run typecheck` could not run in my Linux sandbox (TypeScript 7 ships a macOS binary only in this install); Robert runs it on the Mac in Gate B step 0.

Verdict: **accept contracts v1.1 without change** and **accept phase 2 for Gate B**. Two medium liveness findings and four low ones go to phase 4. None allows a double spend, a false `paid`, or key exposure.

## Contracts v1.1

All seven changes in the phase 2 handoff are correct and I adopted them in the signer.
- Future-window fix: `after >= now` rejects, `before - now > MAX_WINDOW_SECONDS` rejects. Matches EIP-3009 (validAfter exclusive, validBefore exclusive). The signer test and Gate B probe both assert a future-dated window is refused.
- Malformed input: `verifyMac` returns false instead of throwing; `checkRules` rejects non-object, wrong key set, non-string values, uint256 overflow. Confirmed in the signer: none of these reach key retrieval.
- Retry refusal does not free an attempt: correct, and the integration test "lost Reactor response then stale retry" shows it with the real Reactor.
- Finalized-block expiry and matching-transfer evidence: correct reasoning. A finalized block whose timestamp is past validBefore with `authorizationState` false means no later block can include the transfer.

## Invariants checked (VERIFIED by reading + tests)

| Invariant | Where | Result |
|---|---|---|
| I1 one unresolved attempt per order | partial unique index + `authorize()` immediate txn | holds; 8 parallel pays create 1 attempt |
| I2 nonce unique | `nonce TEXT UNIQUE` + CHECK binds it to intent JSON | holds |
| I3 tuple immutable | trigger on intent, mac, required, nonce, start block | holds |
| I4 paid only from settled | `settled` needs tx_hash + receipt; PAYMENT-RESPONSE decoded, tx must equal receipt tx | holds |
| I5 replace only after failed_confirmed | insert trigger + `authorize()` check | holds; settled locks order forever |
| CAS ownership | `UPDATE ... WHERE state IN (...)` returns changes===1; transition graph also enforced by trigger | holds |
| First-refusal classification | `sign_calls===1 && !uncertain_sign`, status must equal the code's schema status, body exactly `{ok,code}` | holds; a 429 or any odd shape becomes `sign_unknown` |
| Signer response trust | spend recovers the signature locally before persisting | holds |
| Merchant claim before external calls | `claim()` immediate txn before verify/settle; `auth_key` UNIQUE blocks cross-order reuse | holds |
| Restart | signing to sign_unknown, submitted to settlement_unknown, processing to settlement_unknown | holds |

## Findings for phase 4

| Sev | Finding | Evidence | Suggested fix |
|---|---|---|---|
| med | **sign_unknown is never retried.** `recover()` re-processes only `authorized` and `signed`; duplicate `pay()` returns status. One lost Reactor response (35 s client timeout, Gate A cold start was about 6 s) parks the order until valid_before passes and a finalized block proves it unused. The Base Sepolia finalized tag lags head by L1 finality plus batch posting (often 15+ min, UNVERIFIED here). This throws away the retry path that deterministic signing was designed for. | VERIFIED: scratch test, after `recover()` and after duplicate `pay()` the attempt stays `sign_unknown` with 1 signer call. | Retry `sign_unknown` with the identical envelope from `recover()` and from duplicate `pay()` while `now < valid_before - 60`; never after. Keep the existing refusal-on-retry rule. |
| med | **Buyer can sign a doomed second authorization.** After a lost settlement, the buyer may reach `failed_confirmed` (expired unused) before the merchant reconciles its own claim. A new `pay()` then signs attempt 2, the merchant answers 409 `order_payment_conflict`, and attempt 2 sits `settlement_unknown` with a live signed authorization for up to 5 min. | VERIFIED: scratch test; merchant order showed `pending`, second attempt `settlement_unknown`, signer calls 2. No funds at risk (merchant never stored it, payee is the same merchant). | In `pay()`, refuse to create an attempt while `order.paymentStatus === 'pending'` (return `merchant_pending`, 409), or trigger the merchant reconcile first. |
| low | Buyer sets `valid_before = now + maxTimeoutSeconds`, exactly the merchant's limit, and the merchant check has zero clock tolerance. Same host today, so fine; split hosts with a merchant clock a few seconds behind would get `payment_mismatch`. | Reading `service.ts` pay() and `wire.ts` verifyPayload. | Buyer uses `maxTimeoutSeconds - 30`, or merchant allows 30 s skew. |
| low | Spend HTTP API has no caller authentication (binds 127.0.0.1). Any local process can pay any merchant order up to MAX_AMOUNT. Matches the stated threat model (agent may buy; per-payment cap only) and is already an article limit. | `server.ts` | Phase 5: MCP adapter as the only client, with a per-boot local bearer token. |
| low | Rules are written twice: `scripts/start-spend.ts` and `runbooks/deploy-signer.sh` must agree on AUDIENCE, POLICY_VERSION, MAX_AMOUNT, MAX_WINDOW_SECONDS, payee. Drift shows up as a first-call refusal (safe) but is easy to cause. | Both files. | One public `config/rules.json` read by both (secrets stay out). |
| low | `wire.ts authorization()`: `!equalAddress(a.from,a.from)` is a no-op; the regex after it does the real check. | Reading. | Delete the clause. |

## Open item for Gate B (not a code finding)

The spend service classifies refusals by HTTP status. Gate A captured only the Reactor body, so it is UNVERIFIED that Basis Theory passes `res.statusCode` through as the invoke HTTP status. If it does not, refusals become `sign_unknown` (safe, not live) and success still works. `runbooks/signer-probe.mjs` checks this before any payment.
