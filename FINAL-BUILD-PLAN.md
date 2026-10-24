# Vaulted Checkout: final build plan (v1.0, 2026-10-24)

Supersedes plan.json (v0.2/v0.3) and build-plan.json (v0.4). Incorporates codex-review-1.md and codex-review-2.md. When files disagree, this file wins.

## What we build (Sunday scope)

An agent buys from one merchant over MCP and pays in testnet USDC (Base Sepolia, x402 v2). A Basis Theory Reactor signs the payment with a wallet key it retrieves inside Basis Theory. A trusted decision module in the merchant service authorizes each attempt; the Reactor verifies that authorization and its own fixed rules before signing.

Claim we may make: "An agent pays in testnet USDC over MCP using a signer inside Basis Theory. After one-time provisioning, the payment application does not hold the wallet private key. A trusted decision service authorizes attempts, and the Reactor enforces fixed per-payment constraints."

Claims we must not make: key only ever existed in the vault; any manifest becomes MCP tools; full consortium compliance; company budgets enforced; voice approves payment; first public implementation; cards (not built).

## Decisions (locked)

| Topic | Decision |
|---|---|
| Threat model | Agent + MCP caller untrusted. Merchant decision module trusted. BT admins trusted. |
| Protocol | x402 v2: `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`; `eip155:84532`; decimal-string atomic amounts. Documented deviation from consortium draft's `X-PAYMENT`. |
| Asset | Base Sepolia USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, EIP-3009 `transferWithAuthorization` |
| Facilitator | https://x402.org/facilitator (advertises v2 exact on eip155:84532) |
| Store | SQLite on one merchant host. No JSON file store. |
| Nonce/expiry | Trusted module generates nonce + validAfter/validBefore ONCE, persists the full authorization tuple before invoking Reactor. Retries reuse the exact tuple. Never refresh expiry. One unresolved attempt per order. |
| Intent auth | Merchant decision module signs an immutable intent envelope (HMAC-SHA256, secret in merchant env + Reactor config, never in MCP). Pattern from agent-checkout mandate.ts. |
| Settlement | Order is `paid` only after confirmed settlement. Unknown outcomes stay `settlement_unknown` until reconciled. |
| MCP | Thin fixed adapter (4 tools), stdio, pinned merchant origin, built after contracts settle. |
| Budgets, approvals, voice, cards, Tempo | Roadmap. Voice only after core recording, isolated, no payment routes. |

## Basis Theory setup

| Item | Type | Permissions | Lifetime |
|---|---|---|---|
| vc-management | management | application:create/read/update, reactor:create/read/update (+ delete/log:read only if used) | Robert only, isolated shell, `BT_MANAGEMENT_KEY` env var. Revoke after final deploy. Never in an AI session. |
| vc-key-provisioner | private | token:create | Delete after tokenizing the key. |
| vc-invoker | private | reactor:invoke | Runtime. No token or management grants. |
| signer Reactor runtime | runtime.permissions | token:read + token:reveal; token ID fixed in configuration | Reviewed code only. |
| public app | none | not needed | |

CLI: `@basis-theory-labs/cli@5.0.0` (MIT), pinned, operator session only. Do not run agent-checkout setup.mjs or quick-reactor-testing Terraform (both leak keys to files/output).

## Who does what

Alternating phases. The builder of one phase is the reviewer of the previous phase. Robert runs every gate that touches credentials.

Model picks (check names against what your pickers show):
- **Claude**: Opus 5.5 for security-critical work, Sonnet 5.5 for routine, effort as listed (Claude Code: low/medium/high/xhigh/max).
- **Codex**: your picker shows GPT-6.1 Sol, GPT-6 Astra/Sol/Luna, GPT-5.6 Sol/Terra/Luna. I do not know OpenAI's tiering for these; I assume newest Sol = strongest, Luna = lighter. Use **GPT-6.1 Sol** for security phases and **GPT-6 Luna** (or Sol at Medium) for routine. Confirm in the picker's descriptions.

| # | Phase | Builder | Model / effort | Reviewer | Exit gate |
|---|---|---|---|---|---|
| 1 | Foundations: SPEC.md, AGENTS.md, contracts (intent envelope, authorization tuple, x402 v2 wire fixtures, Reactor req/resp, state machine, audit allowlist), golden payment attempt, smoke Reactor code, Gate A runbook, handoff template | Claude | Opus 5.5, high | Codex (GPT-6.1 Sol, high) in phase 2 | Files in repo; contracts self-consistent |
| A | Gate A (Robert, ~1 hr): create BT apps, deploy smoke Reactor that imports viem and signs a fixed message with a throwaway in-code test key, invoke it; then provision real test key, sign, recover address externally, delete provisioner | Robert | Claude Sonnet 5.5 medium on call for errors (no keys pasted) | Codex reviews sanitized evidence | Smoke invoke OK + recovered address matches + provisioner deleted. FAIL = stop signer track, diagnose. |
| 2 | Review phase 1 contracts (adversarial). Init workspace, pin deps, own lockfile. Build merchant: manifest subset, products, orders, decision module (intent signing, nonce/expiry allocation), SQLite store, state machine, x402 v2 402 + verify/settle orchestration, reconciliation | Codex | GPT-6.1 Sol, high (state/security); medium for routes | Claude (Opus high) in phase 3 | Merchant tests green with a local mock signer; contract changes logged in CHANGELOG |
| 3 | Signer Reactor: verify intent HMAC, enforce hard rules from config, build fixed EIP-712 TransferWithAuthorization, retrieve key via token ID, return PAYMENT-SIGNATURE payload; negative tests. Review phase 2 invariants and crash handling | Claude | Opus 5.5, high | Codex (GPT-6.1 Sol, high) in phase 4 | Local tests green; review notes filed |
| B | Gate B (Robert): deploy signer Reactor to test tenant, one real settlement on Base Sepolia through merchant | Robert | Claude Sonnet medium on call | Codex reviews evidence | Tx hash on basescan; order `paid` once |
| 4 | Fault injection across every durable boundary (lost sign response, lost settle response, restart, duplicate/concurrent pay, forged intent, changed expiry, cross-order proof, caller reveal attempt). Review signer | Codex | GPT-6.1 Sol, high | Claude (Opus high) reviews tests before signer freeze | No false success; unknowns stay unknown and reconcile |
| 5 | Thin MCP adapter (list_products, create_order, pay_order, get_order), sanitized outputs, small audit view. Credential/log/alternate-reveal check (T4.3) | Claude | Sonnet 5.5 medium (MCP, UI); Opus 5.5 high (T4.3 check) | Codex in phase 6 | Claude Code buys end to end |
| 6 | Integration test with real Claude client; conformance doc (v2 deviation, fixed adapter, omitted cards); fix list. Final signer freeze review | Codex | GPT-6 Sol, medium (GPT-6.1 Sol high for freeze review) | Claude | Freeze: code, config, permissions, deps |
| C | Gate C (Robert): 3 rehearsals under 3 min (new order each; 1 purchase, 1 rule rejection), record, backup recording. Revoke vc-management | Robert | none | | Recording saved |
| 7 | Article draft from observed behavior + HTML architecture diagram | Claude | Opus 5.5, medium | Codex fact check (GPT-6 Sol, medium) | Robert approves |
| opt | Argon (event day): adversarial review of sanitized read-only snapshot (no .env, .git, db, proofs, deploy outputs); voice mock after recording, no payment routes | Gemini 4 Argon | thinking high (review), medium (build) | Claude + Codex triage | Optional |

Phases 2 and 3 may overlap once phase 1 contracts are reviewed: separate branches, Codex owns lockfile and package.json, contract changes only via CHANGELOG + both agree.

## Handoff rule (token outages)

Checkpoint before a model runs low, not after. Each phase ends (or pauses) with `docs/handoff/phase-N.md`: branch + commit, uncommitted files, exact test commands + results (red is fine, label it), contract version, migrations, sanitized deployment IDs, model + effort used, next action. The other vendor resumes from that file.

## Cut order if behind

Voice, diagram, UI polish, audit view, Argon review. Never cut: Gate A, real settlement, recovery tests.

## Known limits to state in the article

Per-payment cap only; independent purchases can add up past it. Decision module trusted. Admins trusted. Testnet only. No cards. x402 v2 deviates from consortium draft wording.
