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

Caveat that must travel with these numbers: the spec changed twice while iteration 0 was being built. theater/manifest.json records iteration0.spec_sha256 7933261f..., the mid-edit spec that told the model to record the chain block as an element named `ledger:<orderId>`. The frozen checker has no such role, so both of iteration 0's failures (and iteration 1's one) are `unbound_element_event` caused by that spec line, not by the model ignoring the contract. The final spec (24153670...) says to record the ledger cue as a label only. The critic and repairer used the final spec. So run 1 is a valid but exploratory run with a spec defect; label it "run 1, spec v1".

## Revised plan

1. Commit code, then run 1 evidence (below).
2. Archive run 1 into theater/runs/run1-spec-v1/ so the next build starts clean.
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
