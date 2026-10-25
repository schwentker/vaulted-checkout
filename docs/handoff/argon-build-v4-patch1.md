# v4 patch 1: model access (2026-10-25 19:25Z). Applies on top of argon-build-v4.md; where they differ, this wins.

Problem: the hackathon key cannot be used in Antigravity, and the AI Studio hackathon login can only import a project. I could not read Google's key docs (the page is client rendered), so the steps below for getting a key are your side to verify with the onsite Google team.

## Decision in 10 minutes (Robert)

Test A, key from the imported project. In AI Studio use the API keys page, Import project, pick the pre-provisioned project, create a key. Ask a Google mentor if the import list is empty. Then smoke test from your terminal (call copied from the kickoff guide):

```
python3 -m venv /tmp/gs && /tmp/gs/bin/pip install 'google-genai>=2.3.0'
read -s GEMINI_API_KEY; export GEMINI_API_KEY
/tmp/gs/bin/python -c "from google import genai; c=genai.Client(); i=c.interactions.create(model='gemini-4-argon',input='Say ok',generation_config={'thinking_level':'low'}); print(i.output_text)"
```

- Prints a reply: use MODE=api (everything in v4 works, with the SDK change below).
- Fails or no key possible: use MODE=manual (below). Nothing else changes. Do not spend more than 10 minutes on Test A.

Also run now, once, in your terminal: `npx skills add google-gemini/gemini-skills --skill gemini-api-dev` and `agy plugin install https://github.com/google-gemini/gemini-skills`. Tell each coding agent to read the skill before writing any Gemini code.

## Changes that apply to both modes

- Use the Interactions API with `@google/genai` (JS) at exactly 2.3.0 or later, pinned by Codex in CX-1 (replaces "no SDK, plain fetch generateContent"). Model `gemini-4-argon`.
- Use `thinking_level` ("low"|"medium"|"high"). Never send temperature, top_p, top_k, thinking_budget or cached_content.
- HTTP timeout 20 minutes for "high" thinking calls. Scene generation and repair: high. Critique: medium. Buyer: medium.
- Function calling and video input shapes on the Interactions API: read the gemini-api-dev skill and the official docs, cite the URL in a comment. Do not copy generateContent shapes from older code.
- Output limit 65,536 by default is enough for one scene file. Do not use background/1M tokens unless a single call is cut off.
- Buyer: if no key is available, run `npm run buyer:scripted`. The real tx and refusal are the demo, Gemini-driven buying is a bonus.
- Do not use the hosted Managed Agent (antigravity-preview-09-2026) for the loop: it hides the render and the frozen evaluation.

## Model layer: one module, two modes (replaces the "Gemini call" parts of AG-1)

Add to AG-1: `theater/model.mjs` exporting `generate(spec, events)`, `critique(packet)`, `repair(packet)`. Selected by env MODE.

MODE=api: calls Argon through the Interactions API as above. Key from GEMINI_API_KEY in Robert's terminal only.

MODE=manual: no key anywhere in the repo or in any coding agent. For each step the loop writes a packet and stops; Robert carries it to AI Studio and brings the answer back unedited.
1. `theater/packets/<i>/<step>/` contains: `PROMPT.md` (the exact prompt to paste), the input files (spec.md, events.jsonl, rubric.md, checks.json, scene.html as needed, and for critique render.webm; if the video is over the AI Studio upload limit, the loop also writes a 720p re-encode with ffmpeg and says so).
2. Robert opens AI Studio (Argon, thinking high for generate/repair, medium for critique), attaches the files, pastes PROMPT.md, and saves the model's answer verbatim as `RESPONSE.txt` in the same folder. No editing, no retries except the loop's own "bad JSON" retry packet.
3. `node theater/ingest.mjs <i> <step>` extracts the single html code block or the JSON, validates it, records sha256 of RESPONSE.txt in manifest.json, and continues the loop to the next step.
4. Report states: "generator, critic and repairer: Gemini 4 Argon in AI Studio, inputs and outputs carried by copy and paste, unedited, hashes in manifest." The frozen deterministic evaluation is unchanged and runs locally.
Cost: about 5 to 8 minutes per step by hand; 3 iterations is about 40 minutes. Plan 2 repair rounds, not 4.

Iteration 0 in manual mode is the first RESPONSE.txt from the generate step, saved with its hash before any check runs.

## Who builds what (unchanged ownership)

- Antigravity builds the loop code with its own login, no key needed. Open the worktree only.
- Codex pins `@google/genai`. Its frozen eval stays as is, plus one added check: `manifest.json` must hold a hash for every model response used (RESPONSE.txt in manual mode, saved API response in api mode).
- Claude Code: buyer uses the same SDK and `thinking_level: "medium"` in api mode.

## Patch to the AG-1 prompt (paste this paragraph at the end of AG-1)

```
Model layer. Implement theater/model.mjs with generate/critique/repair and MODE=api|manual. In api mode use @google/genai (exact version Codex pinned, at least 2.3.0) on the Interactions API with model gemini-4-argon and generation_config.thinking_level (high for generate and repair, medium for critique); never send temperature, top_p, top_k, thinking_budget or cached_content; HTTP timeout 20 minutes. Read the official gemini-api-dev skill / docs first and cite the URLs; do not assume generateContent shapes. In manual mode write packets and ingest as described in docs/handoff/argon-build-v4-patch1.md (PROMPT.md with exact paste-ready prompt, input files, ingest.mjs validating and hashing RESPONSE.txt). Both modes record every model input hash, output hash and the mode in theater/manifest.json. Tests use a fake model implementing the same interface for both modes (manual mode test: a fixture RESPONSE.txt dropped into the packet folder). Robert will choose the mode after a key smoke test; make `node theater/loop.mjs --mode manual|api` explicit with no default.
```

## Patch to CC-1 and CX-1

CC-1 step 3: replace the "Gemini REST generateContent via fetch" sentence with: "Gemini 4 Argon via @google/genai (Interactions API, thinking_level medium, function calling per the gemini-api-dev skill; cite the doc URL). Exact version is pinned by Codex; add the import and list the dependency need in your handoff. Buyer tests use a fake client injected through a small interface, not a local HTTP server."
CX-1 step 1: pin `@google/genai` at the newest release that is at least 2.3.0 and `playwright`; report the versions.
