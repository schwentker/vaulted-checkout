# Phase 1 adversarial review

Verdict: proceed after the contract fixes in v1.1. Gate A is independent and remains operator-owned. This review used only public fixtures and local fake runtime credentials.

Line references below refer to phase 1 as received, before the v1.1 corrections in this phase. Current files contain the fixes. No smoke Reactor file was changed.

| Severity | Finding and location | Evidence / disposition |
|---|---|---|
| high | Future authorization bypass: `contracts/reference/intent-core.cjs:81` uses `max(valid_after, now)`. An intent with valid_after tomorrow and valid_before tomorrow plus 60 seconds passes a 600-second hard window. | VERIFIED by local reproduction returning `null`. v1.1 requires valid_after strictly before now and valid_before no later than now plus the configured window. [EIP-3009 exclusive time bounds](https://eips.ethereum.org/EIPS/eip-3009). |
| high | Retry refusal is not proof of no signature: `contracts/state-machine.md:15` permits `sign_unknown -> signing`, while the next refusal can enter rejected and terminal failure. A first response may have been lost after signing. | VERIFIED in the transition table. v1.1 permits immediate refusal-based failure only for the first invocation with no previous ambiguity. Later refusal preserves uncertainty until reconciliation. |
| high | Reconcile expiry uses unspecified `now` and chain head: `contracts/state-machine.md:31` can free an attempt based on local time or lagging RPC evidence. | VERIFIED contract omission. v1.1 uses the timestamp and state from one finalized block. Transport failure, consumed-but-unmatched nonce, and missing evidence remain unknown. Chain behavior is not live-tested. [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009). |
| high | Merchant concurrency and cross-order replay are underspecified: `contracts/state-machine.md:38` handles already-paid duplicates but provides no durable claim before two verify/settle calls, or unique authorization binding across orders. | VERIFIED omission. v1.1 adds a durable processing claim and unique network/asset/from/nonce binding before external calls, with unknown state on interruption. |
| med | I1 does not enforce I5: a partial unique index excluding settled rows alone permits another attempt after settlement. `contracts/state-machine.md:4` and `:8` require different constraints. | VERIFIED by inspection. Build must add transaction checks and triggers that permit replacement only after failed_confirmed, and permanently lock settled orders. |
| med | Malformed intent throws: `contracts/reference/intent-core.cjs:30` calls Object.keys(null); verifyMac does not catch it. | VERIFIED local TypeError reproduction. v1.1 returns a clean invalid result for malformed input, and checkRules validates the exact field set itself. |
| med | Integer grammar is not uint256 validation: `contracts/reference/intent-core.cjs:13` permits some 78-digit values above 2^256-1. | VERIFIED with a 78-digit value and correspondingly large trusted cap. v1.1 rejects overflow before typed-data encoding. Config still must be validated by its owner; malformed config must fail closed. |
| med | Schema is not complete recovery state: `contracts/schemas/attempt.schema.json:8` lacks required accepted requirements, resource, encoded payload, and chain scan boundary. | VERIFIED by inspection. v1.1 adds persistent recovery fields; SQLite constraints additionally protect them. |
| low | Freshness prose omits the 60-second future skew allowance implemented at `contracts/reference/intent-core.cjs:84`. | VERIFIED. Documented in v1.1. |
| low | SPEC flow uses GET for a payment challenge, whereas the merchant route is POST. `SPEC.md:26`. | VERIFIED inconsistency. Corrected to POST. |

Canonicalization: fixed sorted ASCII field names, string-only values, JSON escaping, exact key rejection, and fixed-width MAC parsing avoid alternative serialization ambiguity for parsed JSON inputs. Unknown fields and non-string values must be rejected before rule evaluation. HMAC authenticates the exact string values, including address casing. Address comparisons may be case-insensitive, but the signed envelope is never rewritten after its MAC is computed.

Retry claim: deterministic signatures were reproduced with the pinned viem dependency. That is useful for byte equality, while chain nonce consumption supplies at-most-once use. This does not authenticate a caller-invented attempt or make multiple orders shareable. Persist nonce, domain, time, accepted requirements, and resource before invocation. Preserve the full envelope on retry. A revoked policy or expired envelope can refuse a retry without disproving a previous signature.

Buyer/seller split: accepted. SPEC.md takes precedence over the final plan. Buyer policy, intent MAC, invoker credentials, and the attempt database belong in a trusted buyer-side spend-service. The merchant owns prices and its orders but no buyer signing authority. The MCP adapter gets sanitized status/receipts only. This is a deliberate change from the earlier plan, not an accidental drift.

Initial local verification after dependency install:

- `npm run golden`: GREEN, original 12 negative cases, MAC roundtrip, deterministic signature and recovery.
- `npm run smoke:test`: GREEN, all five smoke harness paths. This is local simulation, not Gate A.
- Direct reproductions: future-window rule returned null, null intent threw TypeError, and uint256-overflow value passed with a correspondingly permissive cap. These are VERIFIED failing checks in phase 1, corrected in v1.1.

UNVERIFIED: actual BT deployment, runtime applicationOptions credentials, key retrieval, sandbox signing, and any Base Sepolia RPC/facilitator outcome. No API was called for those claims. No .env file or actual credential was opened.

Phase 3 must review v1.1, the implementation's transition guards and first-call refusal semantics, finalized chain evidence, and response validation. Inlining the previous intent-core version would reintroduce the future-window defect.
