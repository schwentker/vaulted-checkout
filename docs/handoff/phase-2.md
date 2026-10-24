# Handoff: phase 2

- Builder / model / effort: Codex. User requested GPT-6.1 Sol, High; High used for review, state and security work. Model selection is controlled by the calling session and was not changed programmatically.
- Date (UTC): 2026-10-24.
- Branch + commit: `codex/phase-2`; implementation checkpoint to be recorded below after the final local checks.
- Uncommitted files: will be recorded after the checkpoint. The folder had no Git repository at entry; the phase 1 foundation is included in this initial history.
- Contract version (CHANGELOG entry): v1.1, 2026-10-24 phase 2.

## What is done

- Adversarial phase 1 review: `docs/review/phase-1-review.md`, including reproduced future-window, null-input, overflow, retry-refusal, and recovery gaps. The buyer-side spend-service design is accepted and implemented; merchant holds no buyer signing authority.
- Git initialized. npm workspace: merchant, spend-service, shared helpers, and MCP placeholder. One lockfile. MCP SDK is `@modelcontextprotocol/sdk@1.32.2`; no adapter built.
- Exact direct dependencies include viem 2.57.11, @x402/core and @x402/evm 2.28.0, better-sqlite3 13.0.3, TypeScript 7.0.2. Workspace runtime Node 26.12.0/npm 11.20.0, pinned in `.node-version` and package metadata. Reactor stays node24; no server/SQLite dependency is used inside it.
- Merchant: immutable-priced orders in SQLite, manifest subset, products/order routes, x402 v2 challenge, explicit verify/settle, durable single-owner payment claim, cross-order authorization replay prevention, idempotent receipt return, and uncertainty reconciliation.
- Spend service: fixed config validation, immutable intent+MAC+requirements+scan-boundary allocation, partial unique index, global nonce uniqueness, permanent settled-order lock, CAS transitions, signature recovery validation, original payload persistence before submission, sanitized API and receipt output.
- Real Reactor client exists behind the Signer interface with test-only BT base URL, no automatic retry, bounded responses, redirect rejection, and a deadline. The environment factory is only for human-operated runtime startup. No actual credential was read or requested.
- RPC reconciliation adapter uses one finalized block's state/timestamp and requires matching AuthorizationUsed plus successful transfer evidence. It fails closed on mismatches, errors and overlong scans. Tests replace the client with deterministic local fixtures; no RPC was called.
- Local mock signer uses the public Hardhat #0 account, verifies the public-fixture MAC and core rules, and performs actual EIP-712 signing through viem. Fake facilitator and fake chain share the same test boundary. No public test key is a wallet to fund.
- Local demo and human-only runtime entry points documented in README. Production entry points were typechecked but were not executed.

## Tests

GREEN:

- `npm ci --no-audit --no-fund`: clean install from the single lockfile, 124 packages. Native SQLite script approval is pinned to better-sqlite3@13.0.3 in package.json.
- `npm run golden`: MAC roundtrip, deterministic signing/recovery, 17 negative cases. Golden PAYMENT-SIGNATURE happy-path bytes remain unchanged.
- `npm run smoke:test`: original five-path local harness PASS. `reactors/smoke` was not edited.
- `npm run typecheck`: no errors.
- `npm test`: 21 tests, 21 passed, none skipped. Includes real localhost HTTP, SQLite concurrency/idempotency, immutable tuple constraints, first-call refusal versus retry refusal, lost sign/settle responses, cross-order replay, sanitized outputs, pending settlement, finalized expiry, wrong chain and unmatched consumed nonce.
- `npm run demo:local`: a local mock purchase plus duplicate returns one attempt/receipt, one signing call and one settlement call. Fake transaction hash only.
- `npm ls --depth=0`: all workspaces and pinned direct dependencies resolved.

Initial RED results were fixed, not skipped: the original future-window/null/overflow reproductions; one merchant SQL insert placeholder error; the duplicate caller's order-paid race. The sandbox initially blocked localhost listen with EPERM; the actual HTTP tests were rerun with loopback permission and passed.

NOT RUN: Basis Theory APIs, actual runtime key retrieval, Base Sepolia RPC, public facilitator, deployment, or real settlement. Gate A evidence in `docs/handoff/gate-a.md` is still empty. This phase does not pass Gate A or Gate B.

## Migrations / DB state

- Fresh `CREATE TABLE IF NOT EXISTS` schemas in each store. Separate merchant/spend SQLite files, WAL and FULL synchronous mode. DB files chmod 0600; SQLite files and sidecars ignored by Git.
- Spend schema enforces I1-I5 with partial/nonce uniqueness, tuple immutability and order/terminal guards. Signature/header must exist for signed/submitted; receipt/tx must exist for settled.
- Merchant persists proof history and an active/paid per-order claim, plus unique network/asset/from/nonce binding. A confirmed expired-unused unknown claim can become failed_confirmed; history is retained.
- Tests/demo use temporary databases removed on successful cleanup. No live DB was migrated. These are initial schemas, not a migration framework for a preexisting deployment.

## Contract changes for Claude to review in phase 3

1. `intent-core.cjs`: exact shape check in checkRules; malformed MAC input returns false; uint256 bounds; valid_after must be strictly before now; valid_before no later than now plus the hard maximum. Do not inline the old core.
2. Retry rejection can free an attempt only on a definite first-call refusal with no earlier uncertain invocation. A later rejection never disproves an earlier lost signature.
3. Immutable recovery data includes intent, MAC, accepted requirements/resource and chain scan boundary. Only failed_confirmed permits a new attempt; settled permanently locks that order.
4. Finalized block state and timestamp are required for expired-unused failure. A consumed nonce without matching transfer evidence remains unknown.
5. Merchant durable ownership and cross-order proof history, startup recovery, and expired-unused replacement semantics are specified in state-machine.md.
6. Attempt JSON schema includes the actual persistent recovery fields. Golden was regenerated with additional negatives; the happy-path header did not change.
7. SPEC's payment challenge is POST, consistent with the route. SPEC's separate buyer-side service takes precedence over the older final-plan paragraph.

All contract edits are in CHANGELOG. Both vendors' agreement on v1.1 is pending Claude's phase 3 review, not assumed.

## Deployment IDs

None. No deployment or BT interaction in this phase.

## Open questions / limits for the other vendor

- Review the full phase 1 attack report and v1.1 before writing/inlining signer code. Confirm Gate A's real request/applicationOptions contract from sanitized operator evidence. The nonexistent node-sdk-2 sample and inconsistent handler naming are documentation caveats, not resolved runtime evidence.
- Review the first-refusal classifications, CAS ownership and durable boundaries. Phase 4 still needs comprehensive kill/restart fault injection; phase 2 local tests are not that full gate.
- RPC evidence scanning is bounded to 100,000 blocks in 5,000-block chunks. Longer outages stay unknown and need a reviewed indexed/manual evidence path. Batch/atypical receipts without matching evidence remain unknown.
- The final public facilitator/USDC integration is unverified until Gate B. Actual services bind localhost and have no production authentication or aggregate budgets.
- Startup handles interrupted signing/submission. Unknown signing may be retried through the internal `process(attempt_id)` method with the identical envelope, while public duplicate pay only returns status. There is no caller-controlled retry/refresh endpoint.
- Normal response paths intentionally do not log request bodies or full errors. Phase 5 adds the audit view and must obey the existing field allowlist.

## Next action

Claude phase 3: read `docs/review/phase-1-review.md`, this handoff, CHANGELOG and contracts v1.1; review the spend/merchant invariants, then implement the signer using the updated core. Robert runs Gate A separately. Do not run the human-only runtime entry points in an agent session.
