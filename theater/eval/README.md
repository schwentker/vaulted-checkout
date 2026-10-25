# Frozen replay evaluation interface

Only Codex edits this folder. Freeze the four files listed in FROZEN.sha256
before any Argon repair. Run `node theater/eval/verify-frozen.mjs` first and
abort the loop on exit 2. Hashing detects changes relative to the committed
manifest, not an adversary who can rewrite both code and manifest. Review the
commit diff as well. Do not regenerate hashes to conceal a repair-time edit.

## Invocation

`node theater/eval/checks.mjs --events fixtures/events-gate-b.jsonl --scene path/to/scene.html --out path/to/checks.json`

Or, after a separate renderer saves observation.json:

`node theater/eval/checks.mjs --events events.jsonl --observation observation.json --out checks.json`

The positional form `checks.mjs events.jsonl observation.json` also works.
stdout is JSON. Bad scenes, missing files, malformed input, unavailable browsers,
and capture failures produce nonzero error counts and exit 0. The loop must
inspect total_bad. Infrastructure or process termination is not a scene result.

The exported `captureScene(scenePath, {videoDir})` renders at 1280x720, captures
six PNG frames at 5%, 20%, 40%, 60%, 80%, and 95% of duration, observes done,
and optionally saves render.webm. It returns the observation accepted by
`evaluate(events, observation)`. Validate events first using `readEvents(path)`.
The CLI validates them automatically. `clock:true` is solely for evaluator
self-tests, never measured runs. No remote model calls are made here.

## Scene and observation contract

Scene: `window.__theater = {duration, marks, done, snapshot()}`. Duration is
seconds, 30 through 45 inclusive. All mark and snapshot times are milliseconds
since replay start. Event log t is original run time, not replay time. Preserve
event file order when scaling the replay. Each event must have exactly one mark
`{t,kind,orderId?,element}` when that event becomes visible. Use the same kind
and orderId as the event, and a role such as packet, coin, or refusal for element.
Repeated kind/orderId pairs are matched in occurrence order.

`snapshot()` returns `{labels:[{text,t}], elements:[{name,visibleFrom,visibleTo}]}`.
This is a cumulative history of everything shown, including objects removed
before the end. visibleTo is the removal time, or duration * 1000 if still
visible. Labels record their first visible time, and each changed text is a new
entry. Include every visible amount, receipt, outcome label, and moving object.
Use semantic roles: coin, settled, refusal, packet, agent, spend, vault,
merchant, chain, buyer. A static station can be present at t=0.

Bind elements to orders using `name:"coin:ord_example"`. Labels can contain the
orderId as a whole token. Both records may instead add `orderId:"ord_example"`.
For the minimal shape, an exact time match to marks for a single order also
binds the record. Ambiguous or unknown payment bindings fail. Explicit bindings
are recommended for overlapping beats and required to distinguish an early
appearance from another order's beat. An unbound role cannot hide a payment.

Label amounts as `<decimal> USDC`, using at most six fractional digits. Label
receipts with exactly `txHash.slice(0,10)`, including 0x. The evaluator compares
amounts using integer string math, so 1.5 and 1.50 are equal. Use plain outcome
words: settled/paid or refused/refusal/rejected, with the refusal code.

Observation JSON contains duration, done, marks, snapshot (the return value),
elapsedMs (independently observed time to done), consoleErrors and pageErrors
(arrays), and frames (six `{pngBase64}` objects containing actual PNG bytes).
Do not supply precomputed variance or error counts. Missing telemetry fails.
The supplied renderer collects this without trusting page-reported frame data.
Labels and 3D visibility history are page telemetry: a lying snapshot is outside
this evaluator's guarantees. Video critique remains separate evidence.

## Exact counts

- contradictions: one per coin/settled element on a refused order, refusal
  element on a settled order, contradictory outcome label, unobserved outcome,
  wrong tx token, missing settled receipt label, or wrong amount token.
- order_errors: one per missing/extra event mark, one per reversed event pair
  (array order or timestamps), one per element or semantic/amount label that
  precedes its matching event mark. Static unbound stations are exempt at t=0.
- amount_errors: one per wrong amount token, plus one per settled order missing
  an amount label. Wrong amounts also count as contradictions by design.
- render_failures: one per console error or uncaught page error, missing done,
  invalid declared duration, invalid independently observed duration, blank
  frame, invalid frame, wrong frame size, missing frame set, invalid/ambiguous
  telemetry record, capture failure, or invalid input. A blank frame has spatial
  luminance variance below 4 in byte intensity units. RGB and RGBA 8-bit PNGs
  are accepted. Unsupported formats fail instead of being treated as nonblank.

total_bad is the unweighted sum. Counts are deterministic for fixed evidence.
Browser scheduling and rendered pixels can vary between captures. Record every
repeat independently. Model critique never changes these counts.

`node theater/eval/metrics.mjs --iterations theater/iterations` writes an array
to theater/eval/results.json with iteration, the four counts, and total_bad.
Use `--out` for another run. It requires every numbered iteration starting at
0, rejects missing checks and inconsistent totals, and retains regressions.
No results file is shipped before actual iterations exist.

`npm run theater:self-test` checks two hand-written tiny pages plus adversarial
evaluator and frozen-hash cases. The correct page scores zero. The otherwise
identical page with a coin on the refused order scores exactly one contradiction.
