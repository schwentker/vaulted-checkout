# AG-1 addendum: run 1 result, revised plan, Codex prompts (2026-10-25)

Supersedes the "Robert runs" order in ag-1.md where they differ. Builder: Claude Code, Opus 5.5 high (run 1 driven by Robert's terminal, key never seen by an agent).

## Run 1 result (fixture log, API mode, real Gemini 4 Argon)

Source: theater/iterations/scoreboard.json, results.json. All three iterations kept.

| Iter | contradictions | order_errors | amount_errors | render_failures | total_bad | critic verdict (model-judged, same family as generator) |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | 2 | 2 | revise: legibility 7, sequence 4, beat_discipline 8, style 9, truth_visual 5 |
| 1 | 0 | 0 | 0 | 1 | 1 | revise: 9, 7, 6, 9, 9 |
| 2 | 0 | 0 | 0 | 0 | 0 | pass: 9, 9, 9, 9, 9 |

Loop stopped early at iteration 2 (pass and total_bad 0). Timings: generate 437 s, repair 210 s and over 330 s. beat_discipline went 8 to 6 at iteration 1 (a model-judged regression; keep it in the story).

Caveat that must travel with these numbers (corrected after Codex's CX-2 theater review, c865b49; my first explanation here was wrong):

- Three spec versions existed. v0 (original, coin merchant to chain, no ledger text): sha 7933261f..., used to BUILD iteration 0 of run 1. v1 (my first Codex-note edit, told the model to record the chain block as an element named `ledger:<orderId>`): sha 24153670..., used by the critic and repairer in run 1, and, because the corrected file never reached Robert's disk (a file-copy lag on my side), also to build iteration 0 of run r1. v2 (final, ledger cue as a label only): sha ec8ea965..., on disk since 21:5x UTC.
- So run 1's iteration 0 failures are NOT explained by the ledger line (that spec did not contain it). Codex found they concern packet elements; the ledger-named failure appears in a later iteration. The `unbound_element_event` failures are the model's own unbound moving elements, plus, from iteration 1 on, the v1 instruction.
- Run 1 and run r1 are both exploratory: label them "spec v0/v1" and "spec v1". Neither is a clean measured run. r1 result: total_bad 3 -> 0, stopped early at iteration 1 (critic pass).
- Zero checker errors does not prove completeness: Codex found the final scene omits some visible objects from its reported snapshot, and the evaluator trusts scene telemetry (theater/eval/README.md). Say "checked against the recorded payment log through scene telemetry", and rely on the video critique and a human look for what telemetry misses.
- Loop bug found by Codex, fixed after run r1: resuming a run could reuse saved checks and critiques after the events changed. Each iteration folder now stores inputs.json (sha256 of events, spec, rubric, scene) and the loop refuses to resume on any mismatch. Test added (8 loop tests green).

## Revised plan

1. Commit code, then run 1 evidence (below).
2. Archive run 1 (done: theater/runs/run1-spec-v1/) and r1 (theater/runs/r1 with its manifest) before the next build.
3. When Gate D produces runs/latest/events.jsonl (main repo), copy it into this worktree (for example fixtures/events-gate-d.jsonl). Build iteration 0 from it with the final spec, then run the loop up to three times, each with `--out theater/runs/rN`.
4. Optional `--min-rounds N` so every run does at least two repair rounds (not built; ask).
5. AG-3 report: run 1 is shown as the spec-v1 run, measured runs as AG-2. Never best-of.

## Robert runs

Commit code:
```
cd /Users/andres/dev/vaulted-checkout-theater
git status --short
git add theater/spec.md theater/*.mjs theater/.gitignore theater/test docs/handoff/ag-1.md docs/handoff/ag-1-run1.md
git commit -m "AG-1: Spend Theater loop (spec, model layer, build-scene, loop, ingest, scoreboard, ping, fake-model tests)"
```
Commit run 1 evidence (about 23 MB with the render.webm files; the duplicate page@*.webm are ignored):
```
git add theater/iterations theater/manifest.json theater/run.json theater/build.json theater/packets
git commit -m "AG-1 run 1 evidence: fixture log, api mode, spec v1 (exploratory)"
```
Archive for the next clean run:
```
mkdir -p theater/runs/run1-spec-v1
git mv theater/iterations theater/manifest.json theater/run.json theater/build.json theater/packets theater/runs/run1-spec-v1/
git commit -m "AG-1: archive run 1 before rebuilding iteration 0 from the final spec"
```
Rebuild and run (with the Gate D log when it exists, else the fixture):
```
node theater/ping.mjs
node theater/build-scene.mjs <events.jsonl> --mode api
node theater/loop.mjs --events <events.jsonl> --iterations 3 --mode api --out theater/runs/r1
```
Note: the scoreboard links inside a run folder are relative to that folder, so open theater/runs/r1/scoreboard.html.

## Codex prompts

CX-2 (theater part), paste into the Codex session on codex/accept:
```
Review only, no code changes except tests/acceptance additions. Read docs/handoff/ag-1.md and ag-1-run1.md in ../vaulted-checkout-theater, theater/*.mjs (not theater/eval), theater/spec.md, theater/runs or theater/iterations, theater/manifest.json. Check and write docs/review/cx-2-theater.md with file:line, severity, VERIFIED/UNVERIFIED:
1. theater/eval unchanged since FROZEN.sha256 (npm run theater:verify).
2. Iteration 0 scene.html sha256 equals manifest.iteration0.scene_sha256; every manifest call has input and output hashes and mode; raw responses exist.
3. scoreboard.json rows equal results.json exactly for every run.
4. Only spec, events, rubric, checks, scene, critique, video were sent to the model (read model.mjs and loop.mjs).
5. GEMINI_API_KEY is never logged or written (grep outputs, manifest, run.json).
6. Run 1 used a mid-edit spec (manifest spec_sha256 7933261f..., final 24153670...). Confirm the failures trace to the ledger:<orderId> instruction, and say whether the report must label run 1 as spec v1.
7. spec.md settled beat: coin buyer to merchant, ledger cue as label only; confirm the frozen checker accepts that shape and flag any contradiction with theater/eval/README.md.
8. Add "theater:test": "node --test theater/test/*.test.mjs" to package.json (you own it) and run it. Report reds, never loosen tests.
9. Does the loop stop rule (pass and total_bad 0) match the intended experiment? Recommend whether to add --min-rounds.
10. Any claim in the report or explainer that goes beyond the numbers.
```
Codex status check, paste into the Codex session:
```
Report in 10 lines: branch and commit, what is committed vs uncommitted, npm test and npm run theater:self-test results now (counts), which adapter acceptance cases are red and why, whether cc/buyer has landed in your tree, and what you are blocked on.
```
