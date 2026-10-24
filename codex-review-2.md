# Vaulted Checkout pressure test 2

**Verdict: approve with changes.** Approve the Sunday infrastructure-demo scope, conditional on the deployment gate and signing/recovery corrections below. This is a plan review, not a completed security assessment or a deployment result.

The user's latest decisions govern this review: budgets are roadmap; the decision service is trusted; the agent and MCP caller are untrusted; x402 v2 is an intentional documented deviation; a fresh test key is provisioned once and deleted locally. None of those decisions needs reopening.

Reviewed: `build-plan.json` v0.4, `codex-pressure-test-2.json`, the available `plan.json`, current vendor documentation, and the five named repositories. The available `plan.json` is still v0.2, and `codex-review-1.md` is absent. The directory is not yet a Git repository. No application code, credentials, or plan files were changed. No deployment, signing, or settlement test was executed.

VERIFIED means supported by the inspected source or observed local/account state. UNVERIFIED means execution or account-specific evidence is missing. Recommendations are review judgments, not externally proven guarantees.

## Basis Theory account result

**UNVERIFIED: this specific test account can deploy and execute the proposed npm-based signer.**

I inspected the signed-in **sblai Test** tenant. Its Reactors page says **No reactors configured** and directs users to the CLI or API. That confirms access to the tenant's Reactor surface, not a successful deployment or entitlement to every runtime feature. I did not open, copy, or use a management key. The review instructions say “Review only, no code,” and the build plan reserves management-key use to the human operator.

**VERIFIED platform support:** Basis Theory documents `node24`, pinned npm dependencies, asynchronous provisioning, and deployment vulnerability checks. That supports trying the design, not declaring the account gate passed. [Node.js runtime documentation](https://developers.basistheory.com/docs/concepts/runtimes/nodejs).

Make this the first test in T0.1, before substantive parallel implementation:

1. The human operator deploys a disposable Reactor into the test tenant using the exact intended `viem` version and runtime. Set the test API endpoint explicitly. Start with no token permissions or wallet data.
2. Wait for the requested deployment to become active. Invoke a function that actually imports and exercises the signing-related dependency. An empty successful handler does not establish that the dependency works.
3. Record the Reactor ID, runtime, dependency versions, deployment result, request contract, and sanitized invocation result. Record failures rather than weakening checks to get a green deployment.
4. Then extend the test to the actual design: provision the fresh test key, retrieve it inside the Reactor, sign one fixed authorization, and recover its public address externally. Delete the local key copy and provisioning app; demonstrate signing still works. Never include the key in the evidence.
5. The next gate is one real facilitator settlement on Base Sepolia plus the negative tests. Do not let the runtime smoke test stand in for this integration gate.

If step 2 fails, stop the signer track and diagnose the concrete failure. A local signer would change the demo's central claim and is not an equivalent fallback.

## Required changes

| ID | Task | Issue | Severity | Fix | Verification and source |
|---|---|---|---|---|---|
| C1 | T0, T6.2 | Builders are told to use missing v0.3/review inputs, while v0.2 still includes cards, budgets, old headers, and stronger claims. | High | Establish one current source of truth incorporating the user's five decisions. Remove or explicitly supersede the stale requirements before handing work to builders. | **VERIFIED** in local `plan.json` lines 4, 14, 35, 94, 226, 243 and `build-plan.json.depends_on`. |
| C2 | T0.1, T1.4 | The decisive account/package test is not an explicit first gate; deployment appears late in T1. | Blocker | Run the test above first. Keep account capability UNVERIFIED until deployment and invocation pass. | **UNVERIFIED** account execution; **VERIFIED** documented platform support and observed empty Reactor list. [Runtime docs](https://developers.basistheory.com/docs/concepts/runtimes/nodejs). |
| C3 | T0.1, T1.1, T1.4 | Runtime `token:read` alone retrieves masked data. “Only this Reactor can reveal” is stronger than the specified grants establish. | Blocker | For internal retrieval, use runtime `token:read` plus `token:reveal`; configure the token ID internally. Use direct `reactor:invoke` on the private invoker. Test denial of token retrieval and alternate detokenization routes. Do not claim per-Reactor container isolation without proving it. | **VERIFIED** permission names and behavior. **UNVERIFIED** proposed runtime container scoping. [Runtime permissions](https://developers.basistheory.com/docs/concepts/runtimes/nodejs#permissions), [invoke API](https://developers.basistheory.com/docs/api/reactors/invoke-reactors), [access rules](https://developers.basistheory.com/docs/api/applications/access-rules). |
| C4 | T0.2, T1.2, T2.2, T3.2 | The trusted decision service has no authenticated contract with the Reactor. A caller-supplied order/attempt ID is not evidence of an approved attempt. | Blocker | Put the trusted decision module in the merchant service, outside the MCP process. It owns attempt creation and authenticates an immutable payment intent. Reactor verifies that intent and its own hard rules before signing. Its authentication secret/private key must be unavailable to MCP. | **VERIFIED** omission in the plan; exploit is a design inference. [Signed mandate pattern](https://github.com/Basis-Theory-Labs/agent-checkout/blob/main/src/lib/mandate.ts), [EIP-3009 signed fields](https://eips.ethereum.org/EIPS/eip-3009). |
| C5 | T1.1, T1.2 | “Random nonce” and deterministic re-signing are unresolved alternatives. Stable nonce alone does not preserve the full authorization. | High | Choose one design: generate a random nonce once in the trusted service and persist the complete authorized tuple before invoking the Reactor. Authenticate that tuple. Reuse its original times, amount, destination, domain, and nonce on retries. Never refresh expiry silently. | **VERIFIED** inconsistency in T1.1/T1.2; expiry and nonce are signed fields. [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009). |
| C6 | T2.2, T4.1 | State names do not define durable transitions or prove recovery. A lost signing response can leave a live authorization even before the merchant records `signed`. | High | Persist intent before signing and proof before settlement. Permit one unresolved attempt per order. A timed-out claim is not permission to issue another authorization. Define reconciliation for missing transaction hashes and map `settlement_pending` to uncertainty. | **VERIFIED** specification behavior; recovery implementation **UNVERIFIED**. [x402 exact EVM](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md). |
| C7 | T0.2, T2.1, T3.2 | Schemas alone permit compatible-looking mocks that fail real integration. A route handler may run before settlement. | High | Add SDK-produced wire fixtures and settlement ownership. Mark an order paid only after confirmed settlement; use explicit verify/settle orchestration or a verified post-settlement hook. | **VERIFIED** in current reference middleware; recheck selected package version. [Express implementation](https://github.com/x402-foundation/x402/blob/main/typescript/packages/http/express/src/index.ts). |
| C8 | Parallel map, T2, T3 | Three tracks exceed two builder sessions. Claude owns both the signer and merchant state machine; package files, contracts, and integration are shared work. | High | Use two primary tracks: Claude owns signer; Codex owns merchant/state. Schedule MCP after contracts stabilize. Assign one integration/lockfile owner and separate working copies when parallel edits begin. | **VERIFIED** ownership conflict in `build-plan.json`; schedule recommendation is a review judgment. |
| C9 | T0.1, T1.4, T4.3 | The listed management grants omit deletion and log access. Env-only storage is not proof the key cannot reach an agent session. | High | Operator uses an isolated deployment session, explicitly targets test, reviews deployment inputs, and returns sanitized evidence. Add `application:delete`, `reactor:delete`, or `log:read` only for operations actually performed through that key, otherwise use the portal. Revoke after final deployment and validation. | **VERIFIED** API requirements. [Applications](https://developers.basistheory.com/docs/api/applications), [CLI](https://developers.basistheory.com/docs/sdks/cli), [Reactor CLI](https://developers.basistheory.com/docs/sdks/cli/reactors). |
| C10 | T1 gate, T4.1, T4.3 | Freezing the signer before recovery tests prevents necessary fixes; T1.4 has no cross-check. | High | Treat early freeze as a review checkpoint. Final freeze follows recovery tests and covers code, configuration, permissions, and dependencies. Any change reruns affected checks and gets independent review. Verify the requested deployment is active. | **VERIFIED** plan conflict; BT can retain the previous working version after failed updates. [Reactor API](https://developers.basistheory.com/docs/api/reactors). |
| C11 | Token handoff rule | A model already out of budget cannot reliably finish a green commit and write a handoff. | Medium | Checkpoint before exhaustion. Record current state even when tests fail, without labeling it green. Include revision, working copy, uncommitted files, exact test commands/results, contract version, migrations, sanitized deployment IDs, and next action. | **VERIFIED** gap in `token_handoff_rule`; execution **UNVERIFIED**. |
| C12 | T0.3, repo verdicts | CLI is labeled unlicensed and installed without a version pin. | Medium | Correct to “package declares MIT”; pin the audited version. Public npm currently reports `@basis-theory-labs/cli@5.0.0`. Check the distributed license notice if redistribution matters. REST is a smaller dependency path for a one-off deployment. | **VERIFIED** registry metadata and [package.json](https://github.com/Basis-Theory-Labs/basistheory-cli/blob/master/package.json). This is not a legal opinion about unspecified unlicensed software. |
| C13 | T5.1–T5.3 | Optional work still consumes reviewer time and can read secrets or modify agent instructions. | Medium | Defer voice until after the core recording. Give Argon a sanitized read-only snapshot. Keep voice disconnected from real order/payment writes. Review proposed AGENTS.md text before adopting it. | **VERIFIED** plan scope; isolation **UNVERIFIED** until inspected. |
| C14 | T2.3, T6.2 | Old claims imply universal manifest generation, exclusive vault residency, production B2B controls, and novelty. | Medium | Describe the tested fixed adapter and documented consortium subset, testnet settlement, trusted service, and runtime key isolation. Cards are not built. Budgets and real approvals are roadmap. Remove unsupported novelty assertions. | **VERIFIED** contradictions in the local inputs. [Consortium draft](https://basistheory.ai/consortium/v0-1-0). |

## Contracts that T0.2 must settle

The key missing artifact is a concrete golden payment attempt shared by both builders, with exact request/response bytes and expected state transitions. At minimum, agree on:

- **Authority:** the trusted service owns order prices, attempt IDs, nonce/time allocation, and intent authentication. The Reactor's wallet token, signing type, domain, asset, chain, and allowed destinations come from configuration. The MCP caller cannot substitute these.
- **Intent binding:** order ID, attempt ID, payer/wallet identity, chain, asset, destination, integer amount, nonce, validity window, policy version, and intended signer/audience. This is a separate authenticated envelope, not extra invented fields in `TransferWithAuthorization`.
- **Wire format:** x402 v2 `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE`; `eip155:84532`; decimal-string atomic amounts; the `accepted` requirements and EIP-3009 payload. Reject unsupported schemes/transfer methods. Use pinned SDK types and fixtures rather than independently recreating the protocol.
- **Runtime contract:** exact JSON body consumed through `event.req`, response body/status shape, timeout classes, and whether payload encoding happens in Reactor or adapter. Choose one encoding owner.
- **Recovery:** atomic transitions, uniqueness constraints, proof persistence, unknown signing/settlement outcomes, confirmed failure criteria, and what a duplicate request returns. A receipt must match the authorization, not just some transfer of the same value.
- **Transport and output:** pinned merchant/facilitator origins, redirect policy, order/session ownership, sanitized errors, and audit allowlist. Raw proofs belong in protected recovery storage, not model-visible tool output or the audit UI.

EIP-3009 does not sign the order ID or resource URL. Bind the nonce to an order in the trusted store and prevent a proof from crediting multiple orders. A consumed nonce alone is not a complete payment receipt; reconcile the matching transaction and transfer outcome. [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009).

For Sunday, pick one durable store. SQLite on one persistent merchant host is sufficient if that is the deployment model; do not retain the v0.2 JSON-file alternative for concurrent payment state. Cloud multi-instance deployment would need a different persistence decision.

This does not add aggregate budgets back to Sunday. Independent approved purchases may accumulate above the per-payment cap. The demo should make that limitation explicit.

## Basis Theory application decisions

| Component | Revised position |
|---|---|
| `vc-management` | Human-only bootstrap/deployment credential. Retain only until the last required deployment and verification; then revoke. A later repair needs a fresh authorized deployment credential. |
| `vc-key-provisioner` | Private, `token:create` only. Delete after tokenization, then verify the signer can still use the stored token and the old provisioning credential is rejected. |
| `vc-invoker` | Private, direct `reactor:invoke`. No token-read grants, management grants, or container-reveal rules. This is invocation authority, not an authenticated business approval. |
| Signer runtime | `token:read` and `token:reveal` for internal retrieval, with a fixed configured token ID and a narrow input schema. |
| Public application | Not needed for this scope. |

Application access rules describe token containers/transforms; the runtime schema does not establish the proposed per-container runtime restriction. Do not add `token:use` with a reveal transform to the caller merely to work around internal retrieval, because that changes the access model. Verify the invoker cannot reveal through another Reactor or proxy. [Access rules](https://developers.basistheory.com/docs/api/applications/access-rules), [invoke permissions](https://developers.basistheory.com/docs/api/reactors/invoke-reactors).

“Only this Reactor can reveal the key” should become “the demo's payment caller has no plaintext-key retrieval permission; reviewed signer code retrieves the configured key inside Basis Theory.” Administrative control remains trusted. Application revocation may take up to 30 seconds to propagate, so an immediate post-delete call is not a definitive revocation test. [Application deletion](https://developers.basistheory.com/docs/api/applications#delete-application).

“Local copy shredded” should become “local copy deleted after provisioning.” Do not promise secure erasure across SSDs, backups, shell history, or recordings. Generate without displaying the key and avoid persisting it where possible.

## Repository verdicts

| Repository | Revised verdict | Evidence |
|---|---|---|
| `agent-checkout` | **STUDY.** Borrow authenticated mandates, narrow tools, configured destinations, and fail-closed handling. Do not copy its deployment secret handling or assume complete replay protection. HMAC authenticates approval here; it is not a competing wallet-signing primitive. | **VERIFIED** [mandate.ts](https://github.com/Basis-Theory-Labs/agent-checkout/blob/main/src/lib/mandate.ts), [setup.mjs](https://github.com/Basis-Theory-Labs/agent-checkout/blob/main/scripts/setup.mjs), [Reactor](https://github.com/Basis-Theory-Labs/agent-checkout/blob/main/reactors/checkout-injector/reactor.js), [README](https://github.com/Basis-Theory-Labs/agent-checkout/blob/main/README.md). |
| `agentic-commerce-demos` | **SKIP for this build.** Card enrollment, instructions, and virtual credentials are outside scope. Remove the unsupported implication that those APIs are obsolete. The README's clone URL differs from the repository reviewed. | **VERIFIED** [README](https://github.com/Basis-Theory-Labs/agentic-commerce-demos/blob/master/README.md). API obsolescence **UNVERIFIED**. |
| `payment-skills` | **SKIP for this build.** Payment operations and PSP skill packaging do not implement this signer or x402 path. | **VERIFIED** [README](https://github.com/Basis-Theory-Labs/payment-skills/blob/master/README.md). |
| `basistheory-cli` | **USE, pinned, in the operator session**, or use REST for the small bootstrap surface. Correct the license statement. No need to add it to payment runtime dependencies. | **VERIFIED** [package metadata](https://github.com/Basis-Theory-Labs/basistheory-cli/blob/master/package.json), public npm metadata, and [official CLI docs](https://developers.basistheory.com/docs/sdks/cli). |
| `quick-reactor-testing` | **READ, do not run unchanged.** It demonstrates legacy `node-bt` versus `node22` with an external npm package. It is useful evidence for the shape of a smoke test, not proof for this account or `viem`. | **VERIFIED** [main.tf](https://github.com/Basis-Theory-Labs/quick-reactor-testing/blob/master/main.tf), [README](https://github.com/Basis-Theory-Labs/quick-reactor-testing/blob/master/README.md). |

`agent-checkout/scripts/setup.mjs` creates a private application with `/pci/high/` rules for `token:use` with reveal and `token:create` with mask; creates or updates two `node24` Reactors; generates/configures a mandate HMAC key; waits for provisioning; and creates a test card token. It writes the private application key, HMAC secret, Reactor IDs, and card token ID into `.env.local`. Its management and external-service keys are also expected in that environment. It does not create a wallet signer or a dedicated Proxy resource. Do not run that setup for this project.

`quick-reactor-testing/main.tf` creates two Reactors, an invoker application and application key, and explicitly prints the private key through `nonsensitive()`. Its setup expects the management credential in Terraform variables, and Terraform state becomes another sensitive artifact. This conflicts with the intended agent-visible-workspace discipline even for a test tenant.

## Revised task table

Only tasks whose scope, ordering, ownership, or review changes are listed.

| Task | Revised deliverable / dependency | Owner and effort | Check |
|---|---|---|---|
| T0.1 | Synchronize inputs; execute account/npm gate first; then prove token retrieval and application separation. | Human operator; Sonnet medium guidance | Codex high reviews sanitized evidence and grants |
| T0.2 | Add authority, authenticated intent, immutable authorization, durable transitions, and wire fixtures. | Opus high | Codex high adversarial review |
| T0.3 | Initialize repository/workspace; select one MCP SDK API surface; pin explicit package names, CLI, and lockfile; assign lockfile owner. | Codex medium | Sonnet clean install plus runtime gate evidence |
| T1.1–T1.2 | Verify trusted intent; construct fixed EIP-712 message; retrieve key internally; reuse the persisted complete authorization. | Opus high | Codex high, independent test cases |
| T1.3 | Add forged intent, changed attempt, changed expiry, cross-order proof, duplicate/concurrent invocation, and caller retrieval tests. | Codex high | Sonnet independently reruns |
| T1.4 | Operator deployment to explicit test endpoint; correct permissions; inspect requested active revision; record cold/warm measurements. | Human operator; Sonnet medium preparation | Codex reviews deployment inputs and sanitized result |
| T2.1–T2.2 | Merchant plus trusted decision module, one durable store, explicit settlement timing, and reconciliation. Parallel with T1. | Codex high for state/security, medium for routes | Opus high reviews invariants and crash tests |
| T2.3 | Conformance comparison including v2 deviation, fixed adapter, and omitted cards. | Sonnet medium; Haiku may format approved facts | Codex checks source claims |
| T3.1–T3.2 | Thin MCP integration after stable contracts; use existing attempts; preserve unknown outcomes; return sanitized results. | Sonnet medium after signer track checkpoint | Codex real Claude-client integration test |
| T4.1 | Fault injection across every durable boundary; require one settled payment or an honestly unresolved state with recovery, never false success. | Codex high | Opus high reviews tests before final signer freeze |
| T4.3 | Raise effort; inspect credentials, deployed code/configuration, logs, error paths, and alternate reveal routes. | Opus high | Codex high independent check |
| T5.1 | Post-recording only, isolated fixture-based voice mock with no payment credentials or mutation routes. | Argon medium | Reviewer checks actual isolation |
| T5.2–T5.3 | Sanitized read-only snapshot review first; diagram optional; AGENTS.md suggestions remain reviewable text until accepted. | Argon high review, medium diagram | Claude/Codex triage; implementer checks diagram |
| T6.1 | Record the working core before optional voice work. Each rehearsal uses a new order; repeat-pay tests use the same order deliberately. | Human operator + Sonnet low | Check receipts and rejection evidence |
| T6.2 | Article grounded in observed behavior and revised claim language, referencing this review. | Opus medium | Codex fact check |

Critical path: account/npm gate → contracts → signer and merchant/state in two tracks → thin MCP integration → fault tests and final deployment review → rehearsal/recording. Cross-vendor reviews consume builder capacity and need scheduled checkpoints. Sunday is plausible for this reduced scope after the first gate passes; it is not an evidence-backed time estimate yet. If behind, cut voice, interactive diagram, and UI polish before cutting recovery or the actual settlement test.

Keep high effort on authority, signing, persistence, and failure recovery. T0.1 and T1.4 were too low for credential/deployment decisions; T1.3 and T4.3 deserve high effort; conformance interpretation is more than Haiku formatting. “Highest reasoning for every review” is unnecessary for routine UI or prose. Translate `med` into the actual supported setting, and record the selected model and effort in each handoff. Effort controls are model-specific, not a portable four-value enum. [Claude effort](https://platform.claude.com/docs/en/build-with-claude/effort), [OpenAI model effort example](https://developers.openai.com/api/docs/models/gpt-5.3-codex).

**VERIFIED:** Argon supports a unified 1M-token context and low/medium/high thinking; it does not support Live API/audio output. `gemini-3.8-live` is a separate voice model. Event credits and account access remain **UNVERIFIED**. [Argon](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon), [Gemini Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live).

For Argon's snapshot, exclude `.env*` secrets, `.git` history, databases, raw proofs, deployment outputs, recordings with credentials, and local configuration. Include sanitized examples and test fixtures. Read-only access to the live checkout is not enough if secrets remain readable. A prompt saying “no authority” is not isolation; the voice prototype must lack credentials and routes capable of changing real payment state.

## Top three risks, ranked

1. **Actual runtime feasibility remains unproved.** The account, exact dependencies, runtime permissions, signing, and facilitator path must work together. First mitigation: operator-run T0.1 before parallel implementation.
2. **A caller can manufacture or renew signing authority.** Authenticate the trusted service's immutable intent, bind its nonce to the order, and reject caller-created replacements. This addresses the declared threat model without adding budgets.
3. **Timeouts and parallel implementation produce duplicate or falsely reported payment outcomes.** Persist before side effects, reconcile uncertain results, test crash boundaries, and reserve integration time. Two nominally green tracks are not an integrated payment system.

## Claims and open questions

Use: “An agent pays in testnet USDC over MCP using a signer inside Basis Theory. After one-time provisioning, the payment application does not hold the wallet private key. A trusted decision service authorizes attempts, and the Reactor enforces fixed per-payment constraints.”

Avoid: “the key only ever exists in the vault,” “arbitrary manifests become MCP tools,” “full consortium compliance,” “company budgets are enforced,” “voice approves payment,” “first public implementation,” and “cards are simulated” when there is no card implementation. Distinguish per-payment limits from aggregate spend control.

**No additional design questions are required.** The unresolved item is evidence: the human-run deployment/invocation gate has not passed. Keep it UNVERIFIED until the sanitized result exists.
