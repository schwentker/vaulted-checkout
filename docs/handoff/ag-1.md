# Handoff: AG-1 (Spend Theater loop)

- Builder / model / effort: Claude Code, Opus 5.5, effort high. Built in place of Antigravity for AG-1, same ownership (theater/ except theater/eval/).
- Date (UTC): 2026-10-25.
- Branch + commit: argon/theater in ../vaulted-checkout-theater. Not committed by the builder (its shell has no git access to this worktree). Robert commits with the commands below.
- Uncommitted files: theater/spec.md, theater/manifest.mjs, theater/prompts.mjs, theater/model.mjs, theater/build-scene.mjs, theater/loop.mjs, theater/ingest.mjs, theater/scoreboard.mjs, theater/.gitignore, theater/test/fake-gemini.mjs, theater/test/loop.test.mjs, docs/handoff/ag-1.md.
- Contract version (CHANGELOG entry): none changed. Scene contract follows theater/eval/README.md and cx-1.md "Argon conformance notes".
- What is done: spec.md (shared goal), model layer with --mode api|manual, build-scene (iteration 0, one call, refuses overwrite), loop (verify-frozen first, render, frozen checks, critique, repair, resumable), ingest (manual mode), scoreboard (every iteration, frozen counts first, model-judged scores labeled), fake-model tests.
- Migrations / DB state: none.
- Deployment ids: none. No key was read or used; tests use a fake model and a local fake Interactions server with a dummy key string.

## Robert runs (Tab 2, theater worktree)

Commit first:

```
cd /Users/andres/dev/vaulted-checkout-theater
git add theater/spec.md theater/*.mjs theater/.gitignore theater/test docs/handoff/ag-1.md
git commit -m "AG-1: Spend Theater loop (spec, model layer, build-scene, loop, ingest, scoreboard, fake-model tests)"
```

Check (no key needed):

```
npm run theater:verify
npm run theater:self-test
node --test theater/test/*.test.mjs
```

If renders come back with `capture_failed` or no render.webm: `npx playwright install chromium ffmpeg` (video recording needs Playwright's ffmpeg).

Mode is explicit on both commands; there is no default.

API mode (after the key smoke test passes):

```
read -s GEMINI_API_KEY; export GEMINI_API_KEY
node theater/build-scene.mjs fixtures/events-gate-b.jsonl --mode api
node theater/loop.mjs --events fixtures/events-gate-b.jsonl --iterations 3 --mode api
open theater/iterations/scoreboard.html
```

GEMINI_MODEL defaults to gemini-4-argon; GEMINI_BASE_URL defaults to https://generativelanguage.googleapis.com/v1beta.

Manual mode (AI Studio, copy and paste):

```
node theater/build-scene.mjs fixtures/events-gate-b.jsonl --mode manual
# open theater/packets/0/generate/PROMPT.md, attach the files there, paste, save answer as RESPONSE.txt
node theater/ingest.mjs 0 generate
node theater/loop.mjs --events fixtures/events-gate-b.jsonl --iterations 2 --mode manual
# each stop prints a packet folder; save RESPONSE.txt there and run the ingest command in its PROMPT.md, e.g.
node theater/ingest.mjs 0 critique
node theater/ingest.mjs 0 repair
```

Exit codes: 0 done, 1 error, 2 frozen eval tampered (abort), 3 waiting for a manual RESPONSE.txt.

AG-2 measured runs on the Gate D log, new folder each, all kept:

```
node theater/loop.mjs --events runs/latest/events.jsonl --iterations 3 --mode api --out theater/runs/r1
node theater/loop.mjs --events runs/latest/events.jsonl --iterations 3 --mode api --out theater/runs/r2
```

Note: iteration 0 is built once from the events given to build-scene. If AG-2 must use the Gate D log for iteration 0, iteration 0 has to be built from that log, and theater/iterations/0 plus manifest.iteration0 can only exist once. Decide before running build-scene: build iteration 0 from runs/latest/events.jsonl (recommended, the demo log), or keep the fixture iteration 0 and pass `--events fixtures/events-gate-b.jsonl` to the loop.

Each run folder holds per iteration: scene.html, patch.diff (from 1), render.webm, frame-1..6.png, observation.json, checks.json, critique.json, raw model responses; plus results.json (from frozen metrics.mjs), scoreboard.json, scoreboard.html.

## How it works

- loop.mjs: verify-frozen first (exit 2). Iteration 0 must match manifest.iteration0.scene_sha256 or the loop stops. For each i: captureScene() from theater/eval (real time, 1280x720, six frames, render.webm), frozen checks.mjs CLI on the saved observation -> checks.json, critique of the video -> critique.json (one retry on bad JSON, a second bad answer stops the loop), stop if verdict pass AND total_bad 0, else repair -> i+1/scene.html + patch.diff. The final iteration is always rendered, checked and critiqued. Then metrics.mjs -> results.json and the scoreboard.
- Sent to the model only: spec.md, events.jsonl, rubric.md, checks.json, scene.html, critique.json (repair input as specified), render.webm. Thinking: generate high, critique medium, repair high. No temperature, top_p, top_k, thinking_budget or cached_content.
- manifest.json: iteration0 {scene, prompt, response, spec, events sha256, mode} and one entry per model call {mode, step, iteration, thinking_level, prompt_sha256, input sha256 per file, output_sha256, output_file}. No key, no prompt text.
- scoreboard: rows come from frozen metrics.mjs combine(), so they equal results.json. Model scores labeled "model-judged, same model family as the generator". Summary says improved, no change, or WORSE, and lists regressions.

## Tests (fake model only)

Cloud mirror of this worktree with Chromium 151 (Playwright 1.62.1), Node 22:

| Command | Result |
| --- | --- |
| `npm run theater:self-test` | GREEN 9/9 |
| `node --test theater/test/*.test.mjs` | GREEN 7/7 |
| Real-time end to end, fake model, real captureScene + video | GREEN: iteration 0 broken scene total_bad 1 (opposite_outcome_element), repaired iteration 1 total_bad 0, scoreboard "improved 1 -> 0" |

Covered: iteration 0 saved untouched with hashes and refused overwrite; hand-edited iteration 0 blocks the loop; tampered eval -> exit 2 before any render or model call; broken -> fixed with early stop; scoreboard rows equal results.json; bad JSON retried once, two bad answers fail; regression listed as WORSE; manual packets + fixture RESPONSE.txt + ingest with mode manual hashes; api wire shape against a local fake server (x-goog-api-key, thinking levels, inline video item first, banned params absent, key not stored).

NOT run here: `npm test` (repo TS suite, not touched by AG-1) and these tests on Robert's Mac. Run the check block above.

## Open questions / deviations

- @google/genai is not installed (Codex did not pin it). model.mjs uses the Interactions REST shapes over node:https (20 minute timeout; global fetch caps headers at 5 minutes). Shapes cited in model.mjs from ai.google.dev/api/interactions, docs/interactions, docs/thinking, docs/video-understanding, docs/files. Untested against the live API: the first real call is the test. If the response has no text in steps[].content, check raw iterations/0/generate.response.json.
- Codex: please add `"theater:test": "node --test theater/test/*.test.mjs"` to package.json (Claude does not edit it).
- Inline video limit is 15 MB per the brief; larger renders go through the Files API and wait for ACTIVE.
- captureScene saves a duplicate page@<id>.webm next to render.webm; theater/.gitignore ignores it.

## Next action

Robert: commit, run the check block, then the key smoke test and pick --mode.
