# Handoff: CX-1

- Builder / model / effort: Codex. Requested configuration: GPT-6.1 Sol, high, per the v4 plan. The runtime identifies the assistant as GPT-6 but does not expose a verifiable exact model slug or effort setting; actual slug/effort are unverified.
- Date (UTC): 2026-10-25.
- Branch + commit: codex/accept in ../vaulted-checkout-codex. Base 1cff0a4. This checkpoint is the commit containing this handoff; resolve with `git log -1 --format=%H` after checkout.
- Uncommitted files: none after the CX-1 checkpoint commit.
- Contract version: new events v1, recorded in CHANGELOG.md. Existing payment contracts remain v1.1.
- What is done: exact Playwright dependency and reconciled lockfile; event schema and evidence-backed Gate B fixture; independent stdio adapter acceptance suite; frozen evaluator, rubric, metrics, tamper verifier, two browser fixtures and nine self-tests.
- Completion status: evaluator and dependency work ready to land first. Overall CX-1 acceptance gate is NOT GREEN. The adapter implementation has not landed, so all eight adapter acceptance cases fail explicitly. No test is skipped or relaxed for the missing implementation.
- Migrations / DB state: none. Tests use temporary local databases.
- Deployment ids: no deployment performed. No operational credentials or .env files were accessed; only the repository's existing public test fixtures were used.
- Open questions for the other vendor: implement the adapter contract and run the independent suite. Argon must use the snapshot interface and measurement rules in theater/eval/README.md.
- Next action: Robert merges this checkpoint first; cc/buyer and argon/theater rebase on it. After CC-1 lands, run `npm test` and `npm run theater:self-test`. Investigate every remaining red without weakening the tests. Do not claim adapter acceptance from this checkpoint.

## Validation

All commands below run in ../vaulted-checkout-codex. Loopback HTTP and Chromium
required execution outside the filesystem/network sandbox. The first sandbox
baseline had 22 EPERM failures from loopback listening; rerunning with listening
permitted gave the original 27/27 passing tests.

| Command / check | Result |
| --- | --- |
| `npm test` before adding acceptance tests | GREEN: 27 passed, 0 failed |
| `npm ci --offline --ignore-scripts --no-audit --no-fund` | GREEN: clean offline install, 127 packages, no package scripts |
| `npm test` with acceptance suite | RED: 37 total, 29 passed, 8 failed, 0 skipped. All failures are the explicit missing packages/mcp-adapter/src/server.ts assertion |
| `npm run theater:self-test` | GREEN: 9 passed, 0 failed, 0 skipped |
| `npm run theater:verify` | GREEN: frozen true |
| `npm run typecheck` | GREEN |
| `npm ls --depth=0` plus exact-pin/lock/engine assertions | GREEN: root versions match lock and installed packages, Node 26.12.0, npm 11.20.0 |
| Real-time CLI replay of theater/eval/self-test/correct.html with its embedded events extracted to a temporary JSONL | GREEN: 36-second scene, all four counts and total_bad are 0 |
| Direct local Reactor refusal setup used by acceptance | GREEN: 7.5 USDC, spend cap 10, Reactor cap 5, one Reactor call, rule_amount, failed_confirmed, zero settlements |
| `git diff --check` | GREEN |

The local Reactor setup check does not replace the missing adapter test. The
cc/buyer ref was still 1cff0a4 and no adapter source existed in either worktree
at the final check. Adapter conformance remains UNVERIFIED.

## Dependencies and Robert runs

Playwright 1.62.1 is the only new direct dependency. Its matching
playwright-core 1.62.1 and optional macOS fsevents 2.3.2 are transitive. The
existing MCP SDK's public AJV provider validates the event schema, so no new
schema/image library was added. three.js remains a scene-owned pinned CDN
reference. Node 26.12.0 and npm 11.20.0 are unchanged; both Playwright packages
require Node >=20. npm also restored better-sqlite3's hasInstallScript metadata
in the lockfile; no version changed and install scripts stayed disabled.

The cache contained the 1.62.1 tarballs but incomplete registry metadata for
playwright-core. The safe installation sequence was:

1. An offline 1.62.1 install failed on incomplete core metadata. A temporary
   1.61.1 install verified the baseline, then was fully replaced.
2. `npm install --offline --ignore-scripts --no-audit --no-fund --save-dev --save-exact https://registry.npmjs.org/playwright/-/playwright-1.62.1.tgz https://registry.npmjs.org/playwright-core/-/playwright-core-1.62.1.tgz`
3. Remove the temporary direct core entry, set the root Playwright pin to
   1.62.1 in manifest and lock root, then
   `npm install --offline --ignore-scripts --no-audit --no-fund --package-lock-only`.
4. Verify from scratch with
   `npm ci --offline --ignore-scripts --no-audit --no-fund`.

Cached Chromium revision 1234 (151.0.7922.34) matched Playwright 1.62.1 and ran
both the fast tests and full replay. No browser download was performed.
Robert runs `npx playwright install chromium` wherever this matching browser
is absent. See [Playwright browser installation](https://playwright.dev/docs/browsers).
No key-bearing command is required for this phase.

## Shared event contract and evidence provenance

Claude Code and Argon must validate one object per JSONL line against
contracts/events.schema.json. No extra fields. t is a nonnegative integer in
run milliseconds; file order is event order, with nondecreasing t. Payment
and order events require orderId. settled requires amount and txHash; refused
requires code; non-settled events cannot carry txHash. Amount is decimal USDC,
not atomic units, with at most six fractional digits. Schema validation of a
single row cannot check ordering; readEvents() checks the whole file.

fixtures/events-gate-b.jsonl contains exactly the two observed outcomes from
docs/handoff/gate-b.md: the real rule_payto refusal and the real 1.5 USDC
settlement with the full 0xd026fed3... tx hash. Times 0 and 1000 are synthetic
replay spacing, not measured Gate B latency. The evidence lists the refusal
before the later successful purchase. No product, refusal amount, listing,
order creation, request timestamp, or additional transfer was invented. Actor
names identify the source of each outcome. The fixture passed schema validation.

## Claude Code conformance notes

Acceptance spawns the literal `node packages/mcp-adapter/src/server.ts` command
using process.execPath, over stdio, with only SPEND_ORIGIN supplied by the test.
It imports the existing in-process harness but no adapter implementation or
Claude test helpers. It covers the four tool names, tool argument surface,
products/order shapes, quantity boundaries, settled/refused/pending/error
allowlists, duplicate pay, upstream poison fields, exact amount conversion
beyond Number precision, invalid ids before HTTP, local origin restrictions,
and caller attempts to override origin, payee, amount or headers.

Payment objects follow the v4 shapes exactly, without extra state/status tags:
settled {orderId,amount,txHash,explorer}, refused {orderId,code,reason}, pending
{orderId,state,hint}, error {code}. MCP content is one JSON text item; if
structuredContent is also present it must match. Products retain the current
spend API's id/name/unitAmount/currency allowlist, either an array or {products}.
Orders use id or orderId, amount, currency, paymentStatus, and optional sanitized
items/payment; get_order can wrap {order,payment?}. The tests do not require
one textual formatting of 1.5 USDC. Refusal reasons are the fixed v4 phrases.

The actual generated Reactor is used for the over-cap case, with a 5 USDC cap
and spend cap of 10 USDC. It must refuse before token access. Existing source
files and Reactor code were not modified. Any integration incompatibility is a
red to investigate with the stated contract, not a reason to loosen assertions.

## Argon conformance notes

Read theater/eval/README.md before implementing the renderer. It defines the
CLI, exported renderer, exact counters, and the observation JSON format.

- `duration` is seconds; marks and snapshot times are replay milliseconds.
  Preserve event order after scaling. Exactly one mark per event, including
  repeated kind/orderId occurrences.
- snapshot() must return a cumulative visible-history record, not just objects
  remaining at the last frame. Labels are {text,t}; elements are
  {name,visibleFrom,visibleTo}. Use semantic names such as coin/refusal/packet.
- Bind an element with `name: "coin:<orderId>"`, bind a label by including the
  whole orderId in text, or add an explicit orderId field to either record.
  A unique mark for one order at the exact time also binds a minimal record.
  Explicit bindings are recommended; ambiguous payment records fail.
- Amount labels use `<decimal> USDC`; receipt labels use exactly the first 10
  characters of txHash, including 0x. Outcome captions use settled/paid or
  refused/refusal/rejected and the refusal code.
- Capture six real 1280x720 PNG frames plus console errors, page errors, done,
  and independently measured elapsedMs. captureScene() supplies this and can
  save render.webm. Its clock:true option is for self-tests only. Measured runs
  must use real time. An absent, malformed or blank frame cannot score zero.
- checks.mjs always emits JSON and exits 0 for bad scene/input evidence. Inspect
  total_bad. verify-frozen.mjs instead exits 2 on tampering; abort the loop.
- FROZEN.sha256 covers checks.mjs, rubric.md, metrics.mjs and the event schema.
  This checkpoint is the initial freeze. No Argon repair has happened here.
  Do not edit these files or regenerate the manifest during a repair loop.
- metrics.mjs writes theater/eval/results.json, one row for EVERY iteration
  beginning at 0, retaining regressions and checking totals. Missing evidence
  fails the command. Generated results are not hand edits to the frozen rules.
  No fabricated results.json is committed before real iterations exist.
- Visual scores are separate: legibility, sequence, beat_discipline, style,
  truth_visual, each 0-10. Label them "model-judged, same model family as the
  generator". Do not mix them into total_bad or smooth any metric.

Wrong amount tokens count in both contradictions and amount_errors, as requested.
The total is the raw sum, not a count of unique defects. Pixel variance uses
spatial luminance so a uniform saturated-color frame also fails. Fixed evidence
produces deterministic counts; browser scheduling can vary across captures.
Snapshots are self-reported scene telemetry. A deliberately false snapshot
cannot be disproved by this evaluator; the video critique is separate evidence.
Hash verification detects changes relative to the committed manifest, not an
actor who rewrites both code and manifest. Review the committed diff as well.
