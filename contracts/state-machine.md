# Attempt state machine (spend-service, SQLite)

Invariants
- I1: At most one attempt per order in a non-terminal state (partial unique index).
- I2: nonce is unique across all attempts.
- I3: The authorization tuple (from, to, value, valid_after, valid_before, nonce) is written in the same transaction that creates the attempt, and never updated.
- I4: An order is reported paid only from state `settled`.
- I5: A new attempt for the same order may be created only after the previous one is `failed_confirmed`.

States
| State | Meaning | Entered when | Allowed next |
|---|---|---|---|
| authorized | tuple + intent + MAC persisted | create (single txn) | signing |
| signing | Reactor call in flight; invocation count persisted | before invoke | signed, sign_unknown, rejected |
| sign_unknown | invoke outcome unknown, including interrupted process | timeout / network / restart | signing (retry same envelope), settled or failed_confirmed via reconcile |
| rejected | authenticated, recognized rule refusal on first invocation with no earlier uncertainty | definite refusal | failed_confirmed |
| signed | signature persisted | Reactor 200 | submitted |
| submitted | PAYMENT-SIGNATURE sent to merchant | before send | settled, failed_confirmed, settlement_unknown |
| settlement_unknown | merchant/facilitator outcome unknown (timeout, 5xx, lost response, settlement pending) | outcome unknown | settled, failed_confirmed (only via reconcile) |
| settled | PAYMENT-RESPONSE success with tx hash, or reconcile found matching transfer | | terminal |
| failed_confirmed | proven unusable | see below | terminal |

`failed_confirmed` requires ONE of:
- Reactor `rejected` on the first invocation with no previous uncertain call (a retry rejection is insufficient), or
- merchant returned a definite verify failure before settlement AND `authorizationState(from, nonce)` on USDC is false AND now > valid_before, or
- now > valid_before AND `authorizationState(from, nonce)` is false (authorization expired unused).

Never release on timeout alone. While `valid_before` has not passed, an unused signed authorization may still be redeemable by anyone holding it.

Reconcile (job + on demand)
1. Read `authorizationState(from, nonce)` at one finalized block on Base Sepolia USDC. Use that block's timestamp, not local wall time, for expiry decisions. RPC errors never establish failure.
2. If true: find the `AuthorizationUsed(from, nonce)` event / tx; if its transfer matches (from, to, value) -> `settled` with tx hash. If it does not match: alert, keep `settlement_unknown`.
3. If false and the finalized block timestamp > valid_before -> `failed_confirmed`.
4. Else stay; retry later.

Duplicate requests
- `pay_order` on an order with a non-terminal attempt returns that attempt's current status (no new attempt).
- `pay_order` on a settled order returns the existing receipt.
- Merchant: a second PAYMENT-SIGNATURE for an already-paid order returns the existing receipt if the authorization matches, else 409.

## Durable execution and merchant state (v1.1)

- Only `failed_confirmed` frees the per-order attempt slot. `settled` permanently prevents another attempt for that order. Enforce I5 in a transaction and a database trigger, in addition to the partial unique index for I1.
- Persist the full immutable intent, MAC, accepted requirements, resource, and chain scan start block before any invocation. All domain fields are immutable too. Persist signature and encoded PaymentPayload before submission.
- Compare-and-swap transitions claim work before external calls. A duplicate call returns current status and does not start another worker.
- On startup convert interrupted `signing` to `sign_unknown`, and interrupted `submitted` to `settlement_unknown`. Recovery never creates an attempt or refreshes its tuple.
- The merchant persists its own authorization binding and `processing` claim before facilitator verification/settlement. A timeout or crash becomes `settlement_unknown`, not unpaid. A different proof cannot reuse that order, and one `(network, asset, from, nonce)` cannot credit two orders.
- `verify` success is not settlement. Mark paid only after a validated successful settlement response or matching finalized chain evidence. Store receipt before returning it. A malformed response or transport error stays unknown.
- The merchant may clear a rejected verification claim only when no settlement call occurred. The spend service still waits for expiry and chain evidence before freeing its attempt.
- A merchant settlement_unknown claim may become failed_confirmed only on finalized expired-unused evidence, permitting a replacement attempt for that order. Its authorization history stays retained and cannot credit another order.
- Reconciliation of a consumed nonce requires the matching AuthorizationUsed event and transfer from the configured token in a successful finalized receipt. Missing or inconsistent evidence, including cancellation, stays unknown and surfaces an allowlisted code.
- A periodic reconcile job and on-demand recovery use the same logic. Already-finalized terminal states never regress. Reconciliation may also settle a `sign_unknown` attempt whose signature response was lost.
