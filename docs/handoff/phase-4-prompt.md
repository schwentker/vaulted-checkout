# Codex phase 4 prompt (paste into Codex at repo root)

Model: GPT-6.1 Sol, effort High.

You are the phase 4 builder for Vaulted Checkout. Read in order: AGENTS.md, SPEC.md, FINAL-BUILD-PLAN.md, CHANGELOG.md, contracts/state-machine.md, contracts/intent.md, docs/handoff/phase-3.md, docs/review/phase-2-review.md, docs/handoff/gate-b.md (Robert's Gate B evidence, if filled). Follow AGENTS.md strictly (no keys, no .env reads, no em dashes, do not run scripts/start-*.ts or anything in runbooks/).

Start from branch `claude/phase-3` (create `codex/phase-4` from it). If Gate B is not done yet, work anyway: everything here is local.

Part A: review the signer (adversarial, write docs/review/phase-3-review.md)
- Attack reactors/signer/main.js, scripts/build-signer.mjs and the generated reactor.js: rule bypass, request fields reaching rules, key fetched before rules pass, response shape drift vs contracts/schemas/signer-response.schema.json, logging, error paths that could return a signature with a refusal, build drift from the core. Cite file + line, severity, VERIFIED/UNVERIFIED.
- Review runbooks/deploy-signer.sh and runbooks/signer-probe.mjs for secret exposure (command lines, files, output) without running them.

Part B: fix the phase 2 review findings you agree with, each with a test
1. med: retry `sign_unknown` with the identical stored envelope from `recover()` and from duplicate `pay()` while now < valid_before - 60. Never mint, never refresh. A refusal on that retry must keep `sign_unknown`.
2. med: `pay()` must not create a new attempt while the merchant reports the order `pending`; return a stable code (suggest `merchant_pending`, 409).
3. low: buyer valid_before margin (maxTimeoutSeconds - 30) or merchant skew allowance; low: one public rules file shared by start-spend.ts and deploy-signer.sh; low: remove the no-op in wire.ts authorization(). Skip any you disagree with and say why.
If you disagree with a finding, write why in your handoff instead of changing code.

Part C: fault injection (the phase 4 gate)
Use tests/signer-integration.test.ts (real generated Reactor behind a local invoke stand-in) as the signer wherever possible, the mock signer elsewhere. Cover every durable boundary:
- process killed (simulate by abandoning the promise and reopening both SQLite files) at: after authorize, after signing claim, after Reactor returned but before `signed` persisted, after `submitted`, merchant after claim before verify, after verify before settle, after settle before `complete`.
- lost sign response, lost settle response, facilitator 5xx, malformed PAYMENT-RESPONSE, settle success:false.
- duplicate and concurrent pay (buyer) and duplicate and concurrent PAYMENT-SIGNATURE (merchant), including across a restart.
- forged intent (MAC tamper), changed expiry or nonce on retry, cross-order proof replay, payee not allowlisted, amount over cap at Reactor only.
- caller reveal attempt: nothing reachable from the spend HTTP API or MCP placeholder returns intent_mac, signature before settle, or any key.
Pass criteria: no false `paid`/`settled`, no second authorization for one attempt, unknowns stay unknown until finalized chain evidence, every recovery path ends in settled or failed_confirmed under the mock chain. Red tests stay red and get reported, never skipped.

Do not: deploy, touch Basis Theory, change contracts without a CHANGELOG entry, edit reactors/signer/reactor.js by hand (edit main.js or the core, then `node scripts/build-signer.mjs`). A core change needs a Reactor redeploy, so flag it loudly in the handoff.

End with docs/handoff/phase-4.md (TEMPLATE.md format), including model + effort used, test counts, and what Claude reviews before the signer freeze.
