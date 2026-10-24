# Intent envelope (vc-intent-1)

The spend-service authorizes one payment attempt by MACing this envelope. The Reactor signs only the EIP-3009 tuple contained in it.

## Fields (all strings)
| Field | Meaning | Reactor check |
|---|---|---|
| v | `vc-intent-1` | equals |
| audience | `vc-signer` | equals config AUDIENCE |
| order_id | merchant order id | non-empty, <=128 chars |
| attempt_id | spend-service attempt id (uuid) | uuid |
| chain_id | `84532` | equals CHAIN_ID |
| asset | USDC contract | equals ASSET (case-insensitive) |
| from | wallet address | equals WALLET_ADDRESS and the retrieved key's address |
| to | payee | in PAYTO_ALLOWLIST |
| value | atomic amount | integer string, 0 < value <= MAX_AMOUNT |
| valid_after | unix secs | uint256 integer string; strictly < now (EIP-3009's lower bound is exclusive) |
| valid_before | unix secs | uint256 integer string; > now, > valid_after, valid_before - now <= MAX_WINDOW_SECONDS |
| nonce | 0x + 64 hex | format |
| policy_version | e.g. `p1` | equals config POLICY_VERSION |
| issued_at | unix secs | now - issued_at <= MAX_WINDOW_SECONDS |

Retry rule: a retried attempt sends the SAME envelope (same nonce, same valid_before). The Reactor may re-sign it; secp256k1 signing in viem is deterministic (RFC 6979), so the same tuple yields the same authorization, and the chain accepts a nonce once. Retries therefore never create a second spendable authorization. The Reactor does not refresh any field.

Note: the issued_at freshness check means an attempt older than MAX_WINDOW_SECONDS cannot be re-signed. That is intended: such an attempt goes to reconciliation, not re-signing.

All integer fields must fit uint256. `issued_at` may be at most 60 seconds in the future for clock skew. A rejection on a retry does not prove an earlier timed-out invocation failed to sign. Such attempts retain uncertainty until chain reconciliation proves their outcome. Deterministic signing preserves identical bytes for this pinned implementation; nonce consumption, not signature byte equality, provides the chain's at-most-once property.

## Canonical form and MAC
1. Take the envelope object (exactly the 14 fields above, no others; unknown fields = reject).
2. Serialize keys in ascending code-point order, `JSON.stringify` of each value, no whitespace: `{"asset":"0x...","audience":"vc-signer",...}`.
3. MAC = lowercase hex HMAC-SHA256(INTENT_HMAC_KEY as UTF-8 bytes, canonical string as UTF-8).
4. Reactor compares with `crypto.timingSafeEqual` after length check.

Why HMAC and not a signature: one trusted sender, one verifier, shared secret held only by spend-service env and Reactor config. Same pattern as Basis-Theory-Labs/agent-checkout src/lib/mandate.ts. An asymmetric signature is a roadmap option if the decision service is split from the invoker.

## What the MAC does not cover
EIP-3009 does not sign order_id or resource URL. Binding nonce to order is spend-service's job (unique index on nonce and on (order_id, unresolved)). A receipt must match the exact authorization (from, to, value, nonce), not any transfer of the same amount.
