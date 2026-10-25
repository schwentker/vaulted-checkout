# Vaulted Checkout x Argon: Spend Theater (build plan v2, 2026-10-25)

Supersedes buy-agent-prompts.md for today. Submission 5 pm. Repo: /Users/andres/dev/vaulted-checkout.

## The pitch (Problem Statement Two: More Dimensions)

A Gemini agent buys research with real testnet USDC. A Basis Theory vault signs the in-policy buy and refuses the off-policy one. Then Argon turns the real payment log into a 3D "Spend Theater" scene in one pass, **renders it, watches the video, critiques it against what actually happened on chain, and fixes it in a loop.** We measure the score per iteration against the one-pass baseline.

Why it is more than a pretty loop: the critic has ground truth. Every claim the scene makes (who paid, how much, which payment was refused, where the money stopped) is checked against the real event log and the basescan tx. A scene that shows money moving on the refused buy fails, however good it looks. Visual explainers of money must be true, not just nice.

One line: "The agent can ask, only the vault can sign, and Argon checks that the movie tells the truth."

Problem Statement One is out of scope today. Mention in the writeup only: "next, Argon ports the spend service to Rust; baseline = our hand-written tests."

## Timeline (PT), split across tools, run in parallel

| When | Track A (payments) | Track B (Argon theater) |
|---|---|---|
| 11:50-12:00 | Step 0 (Robert) | Step 0 (Robert) |
| 12:00-13:00 | P1 in **Claude Code** (Opus, high): adapter, buyer, event log. Knows the repo + security rules. | P2 in **Antigravity, Argon high**: spec + one-pass scene from fixtures/events-gate-b.jsonl |
| 13:00-13:20 | **Codex** (GPT-6.1 Sol, high) reviews the P1 diff (paste "Review only" prompt below) | P2 continues; quick visual iteration in **AI Studio** is fine for prompt tuning |
| 13:20-13:40 | Gate D (Robert): live buy, real events.jsonl | |
| 13:40-15:00 | | P3 in **Antigravity, Argon high**: render/watch/critique/fix loop, rerun on the real Gate D log |
| 15:00-15:20 | **Claude Code** reviews the P3 diff (keys, what is sent to the model) | Robert runs the loop, 4 iterations |
| 15:20-16:20 | P4 (Claude Code or Antigravity): submission page, 2:30 video, writeup | |
| 16:20-17:00 | Buffer, submit | |

Argon must do the theater work (that is what the problem statement judges). Claude Code and Codex keep the money path safe.

Review-only prompt (Codex after P1, Claude Code after P3): "Review only, no code changes. Read AGENTS.md, SPEC.md, the latest docs/handoff/p*.md and `git diff claude/phase-3...HEAD`. Find: tool args reaching a URL, payee, amount or header; outputs or logs leaking intent_mac, signature, nonce, payment_header, any key or GEMINI_API_KEY; anything sent to Gemini beyond spec, events, checks, scene, video; pay loops. Write docs/review/<phase>-review.md with file:line, severity, VERIFIED/UNVERIFIED. No em dashes."

P2 note: if fixtures/events-gate-b.jsonl does not exist yet (P1 still running), P2 writes it first from docs/handoff/gate-b.md (real 1.5 USDC tx, real rule_payto refusal), same field list as P1 step 3.

Cut order if late: Gemini-driven buyer (use `--scripted`), loop iterations (min 3), P4 polish. Never cut: the real tx, the refusal, the iteration-0 vs final comparison.

## Step 0 (Robert, no AI)

1. On `claude/phase-3`: `git status`, then commit phase 3 work (keep `.env`, sqlite, mp3 out). `git switch -c ag/spend-theater` (Claude Code works here). For Antigravity: `git worktree add ../vaulted-checkout-theater -b ag/theater` and open that folder in Antigravity, so two agents never commit in the same working tree. Merge ag/theater into ag/spend-theater before P3 runs on the real log. In P2/P3 prompts read "branch ag/theater" where they say ag/spend-theater.
2. Antigravity: terminal auto-run OFF. Move `.env` out of the repo folder while Antigravity runs (or block gitignored files if the setting exists).
3. Antigravity: Gemini 4 Argon, highest thinking, for P2-P3. Claude Code: Opus 5.5, high, for P1.
4. Get the Argon model id from AI Studio; you will export it as `GEMINI_MODEL`.
5. `npx playwright install chromium` in the repo (P3 needs it; do it now so the download is done).

Rule for every prompt: the agent never holds a key. Every command that needs `GEMINI_API_KEY` or the spend env is run by you in your own terminal.

---

## P1 prompt: adapter, buyer, event log

```
(Paste into Claude Code.) You are building phase P1 of Vaulted Checkout "Spend Theater". Read and follow strictly: AGENTS.md, SPEC.md, contracts/README.md, contracts/schemas/audit-event.schema.json, packages/spend-service/src/server.ts, packages/spend-service/src/service.ts (public()), packages/shared/src/wire.ts (id()), scripts/start-merchant.ts, tests/support/fixtures.ts.

Hard rules: never open or print .env files or any key; never run runbooks/ or scripts/start-*.ts; no new dependencies (use @modelcontextprotocol/sdk@1.32.2 already pinned, global fetch for Gemini); no em dashes anywhere; do not edit packages/spend-service, packages/merchant, packages/shared, reactors/, contracts/; branch ag/spend-theater; commit locally, never push; never run anything with a real GEMINI_API_KEY.

1. MCP adapter, packages/mcp-adapter/src/server.ts, stdio, exactly 4 tools calling the spend-service HTTP API at env SPEND_ORIGIN (default http://127.0.0.1:4001; only 127.0.0.1 or localhost allowed; never take a URL, payee, amount or header from tool args):
   list_products, create_order(productId, quantity 1..10), pay_order(orderId), get_order(orderId).
   Results built from explicit allowlist objects only: settled {orderId, amount (decimal USDC via string math), txHash, explorer https://sepolia.basescan.org/tx/<hash>}; refused {orderId, code, reason} with reasons rule_amount = "over the per-payment limit set in the vault", rule_payto = "payee not on the vault allowlist", else "refused by payment policy"; pending {orderId, state, hint}; error {code}. Never output intent, intent_mac, nonce, signature, payment_header, PAYMENT-* headers. 30 s timeout, 64 KB response cap. Validate ids with the same regex as wire.ts id() before any HTTP call.

2. Catalog: in scripts/start-merchant.ts (edit, do not run) seed, besides "demo":
   paper-tox-2026 "Paper: early hepatotoxicity signals in kinase inhibitors (PDF)" 1500000 USDC;
   dataset-tox-full "Full assay dataset, 40k compounds (CSV)" 7500000 USDC.

3. Buyer, agent/buyer.ts:
   - Gemini REST generateContent via fetch. Base env GEMINI_BASE_URL (default https://generativelanguage.googleapis.com/v1beta), model env GEMINI_MODEL (required), key env GEMINI_API_KEY in the x-goog-api-key header, never logged. Check the current function-calling format in Google's official Gemini API docs; cite the URL in a comment.
   - Spawn the adapter with StdioClientTransport, listTools, map to functionDeclarations, allow only the 4 names. Max 10 turns. One call at a time.
   - System prompt: "You are a research assistant for a small drug-discovery team. You buy documents and datasets from an approved store with the tools given. Payment rules are enforced outside you. Report what you bought, the price and the transaction link. If a payment is refused, say so with the reason and do not work around it."
   - Default task: "Buy the hepatotoxicity paper. Then buy the full assay dataset."
   - --scripted: no model; list, create+pay paper, create+pay dataset.
   - Terminal output, one plain line per step, for screen recording: `agent -> create_order paper-tox-2026 x1`, `vault  <- settled 1.50 USDC <explorer link>`, `vault  <- refused rule_amount: over the per-payment limit set in the vault`, then the final answer.
   - Event log: append every step to runs/<timestamp>/events.jsonl and copy to runs/latest/events.jsonl. One JSON object per line: {t (ms since run start), actor: agent|spend|vault|merchant|chain, kind: list|order_created|pay_requested|signed|refused|settled|pending, orderId?, productId?, amount?, code?, txHash?}. Only these fields. (signed is inferred from settled; do not invent events you cannot observe.)
   - Also write fixtures/events-gate-b.jsonl by hand from docs/handoff/gate-b.md (the real 1.5 USDC tx and the real rule_payto refusal) so P2 can start before Gate D.
   - npm scripts: "mcp", "buyer", "buyer:scripted". Log package.json change in CHANGELOG.md.

4. Tests (node:test, `npm test`): tests/mcp-adapter.test.ts and tests/buyer.test.ts against the in-process harness with MockSigner; buyer test uses a local fake Gemini server via GEMINI_BASE_URL. Cover: settle, duplicate pay same txHash, over-cap refused rule_amount (spend rules MAX_AMOUNT 10000000, signer cap 5000000 using the LocalReactorSigner pattern from tests/signer-integration.test.ts), bad id rejected with no HTTP, unknown tool name refused, turn limit, scripted run lines, events.jsonl fields allowlisted, no output anywhere contains intent_mac, nonce, payment_header or a 0x+130-hex signature.

Done when `npm test` is green (report counts before/after). Write docs/handoff/p1.md (TEMPLATE.md format, model + thinking used) with a "Robert runs" section: exact commands for Gate D, env names only.
```

## Gate D (Robert, ~20 min)

1. Merchant terminal: `MERCHANT_PAYTO=<payee> RPC_URL=<rpc> node scripts/start-merchant.ts`
2. Spend terminal: source your spend env, plus `export MAX_AMOUNT=10000000` (looser than the vault's 5 USDC on purpose), `node scripts/start-spend.ts`
3. Buyer terminal: `read -s GEMINI_API_KEY; export GEMINI_API_KEY GEMINI_MODEL=<argon id>; npm run buyer` (fallback `npm run buyer:scripted`). Screen-record this terminal.

Pass: paper settles with a new basescan tx; dataset refused `rule_amount` by the Reactor; dataset order unpaid. `runs/latest/events.jsonl` exists. After: set spend `MAX_AMOUNT` back to 5000000.

## P2 prompt: one-pass 3D scene (iteration 0 = baseline)

```
(Paste into Antigravity, Argon.) Phase P2 of Vaulted Checkout "Spend Theater". Read AGENTS.md, SPEC.md, docs/handoff/p1.md (if present), runs/latest/events.jsonl (fall back to fixtures/events-gate-b.jsonl if missing). Same hard rules as P1 (no keys, no .env, no new npm deps, no em dashes, branch ag/spend-theater, commit locally).

Build theater/ :
1. theater/spec.md: the goal the critic will judge against. Write it first, short:
   - Cast as 3D stations left to right: Buyer company, Gemini agent, Spend policy, Basis Theory vault (signer), Merchant, Base Sepolia chain. Palette: blue = Basis Theory, red = money/chain, yellow = messages, neutral paper background.
   - Replays events.jsonl in order, scaled to 30-45 s total. One new element per beat; nothing appears before its event.
   - Settled buy: yellow request packet agent -> spend -> vault, vault seals it, a red coin travels merchant -> chain only after "settled", label shows amount and the first 10 chars of the real txHash.
   - Refused buy: packet reaches the vault and stops there with a refusal mark and the code text (e.g. rule_amount); no coin ever leaves; merchant stays dark.
   - Caption bar at the bottom says what is happening in plain words; legible at 1280x720.
   - The key never moves out of the vault.
2. theater/build-scene.mjs: ONE call to Gemini (env GEMINI_MODEL, GEMINI_API_KEY, GEMINI_BASE_URL; REST generateContent via fetch, key in x-goog-api-key header, never logged) with spec.md + events.jsonl, asking for a complete single-file three.js page. three.js from a pinned CDN URL (e.g. https://cdn.jsdelivr.net/npm/three@<exact version>/build/three.module.js). The page reads events from an inline <script type="application/json" id="events">, exposes window.__theater = {duration, marks: []} and pushes {t, kind, orderId} into marks when each event is shown, and sets window.__theater.done = true at the end. Save to theater/iterations/0/scene.html and the raw prompt to theater/iterations/0/prompt.txt.
   This one-pass output is the baseline. Do not hand-edit it.
3. Since you must not run with a real key, also write theater/test/fake-gemini.mjs returning a tiny valid scene, and a test that build-scene.mjs writes iteration 0 correctly against it.

Done when the test is green and docs/handoff/p2.md lists the exact command Robert runs: `node theater/build-scene.mjs runs/latest/events.jsonl`.
```

## P3 prompt: render, watch, critique, fix loop

```
(Paste into Antigravity, Argon.) Phase P3 of "Spend Theater". Read docs/handoff/p2.md, theater/spec.md, theater/build-scene.mjs. Same hard rules. Playwright is allowed as a dev tool via npx (Robert already ran `npx playwright install chromium`); if it must be added to package.json, pin it exactly and log it in CHANGELOG.md.

Build theater/loop.mjs: for i = 0..N-1 (default N=4):
1. Render: Playwright chromium, 1280x720, recordVideo to theater/iterations/<i>/render.webm, load scene.html from a local static server, wait for window.__theater.done (timeout duration + 10 s), save 6 evenly spaced PNG frames, collect console errors and window.__theater.marks.
2. Deterministic checks (no model), saved to checks.json: page loaded without console errors; done reached; every event in events.jsonl has a mark in order; marks within duration; no mark for a coin/settled on a refused orderId. Each check pass/fail.
3. Watch + critique: one Gemini call with the video (inline_data video/webm if under 15 MB, else the Files API, wait until ACTIVE), spec.md, events.jsonl, and checks.json. Ask for JSON only, schema:
   {scores: {truth: 0-10, sequence: 0-10, legibility: 0-10, one_element_per_beat: 0-10, style: 0-10}, issues: [{at_seconds, severity: high|med|low, rule (quote from spec.md), saw, expected, fix}], verdict: "pass"|"fix"}
   Truth means: everything the video shows matches events.jsonl (amounts, which order settled, which was refused, refusal stops at the vault, tx label matches). Save critique.json. Validate the JSON; one retry on parse failure.
4. Fix: one Gemini call with scene.html + critique.json + checks.json + spec.md, asking for the complete corrected single file. Save as iterations/<i+1>/scene.html plus a unified diff patch.diff.
5. Stop early when verdict is pass and all deterministic checks pass.
Then write theater/scoreboard.json and theater/scoreboard.html: per iteration the 5 scores, total, deterministic pass count, issue counts by severity, a still frame, and links to render.webm. Highlight iteration 0 (one pass baseline) vs final. Pure HTML+inline SVG chart, no build step.

Never send keys, .env content or anything but the scene, spec, events, checks and video to the model. Events are already sanitized.

Tests against fake-gemini.mjs extended to return a critique and a fixed scene: loop runs 2 iterations, files land in the right places, scoreboard renders, early stop works, bad JSON retried once.

Done when tests are green. docs/handoff/p3.md with the command Robert runs: `node theater/loop.mjs --iterations 4`.
```

## P4 prompt: submission package

```
Phase P4. Read docs/handoff/p1.md..p3.md, theater/scoreboard.json, runs/latest/events.jsonl. Same hard rules. Produce:
1. submission/index.html: one page, top to bottom: the one-line pitch; the real buy (embed or link the terminal recording Robert saved at submission/buy.mp4, basescan link from events); iteration 0 vs final scene side by side (video tags of render.webm); the scoreboard chart; "how the critic knows the truth" (events.jsonl + deterministic marks + Argon video critique); architecture in 6 boxes (agent, MCP adapter, spend policy, Basis Theory vault, merchant/x402, chain). No em dashes. Plain, short sentences.
2. submission/README.md: what it is, which problem statement (Two: More Dimensions), measured result (score iteration 0 vs final, issues fixed, number of loop iterations, wall-clock time), how to run, what is real (Base Sepolia testnet USDC, Basis Theory Reactor signer) and what is not (testnet only, per-payment cap only, scene is a replay not live).
3. submission/demo-script.md: 2:30 spoken script: 20 s problem, 50 s live buy (settle + vault refusal), 60 s loop (iteration 0 flaw, critique with timestamp, fixed version, score jump), 20 s close.
```

---

## What judges see in under 3 min

1. Terminal: Gemini agent buys the paper (real tx), tries the dataset, vault refuses `rule_amount`.
2. Iteration 0 scene: Argon's one-pass draft, with a visible mistake (typical: coin moves on the refused buy, or events out of order).
3. Argon's critique JSON with timestamps quoting the spec rule it broke.
4. Final iteration: correct, scoreboard shows the jump.

Close line: "The agent can ask, only the vault can sign, and Argon checks that the story is true."
