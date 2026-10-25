# generate: paste this into AI Studio

Model: Gemini 4 Argon. Thinking level: high.
Attach these files from this folder: spec.md, events.jsonl.

Then paste everything between the lines below as the prompt. Save the model's answer verbatim, unedited, as RESPONSE.txt in this folder, then run:

    node theater/ingest.mjs <iteration> generate

----- PROMPT START -----
You are generating a single-file 3D replay scene.

Attached: spec.md (the goal and the scene contract) and events.jsonl (the real payment log, one JSON object per line).

Write scene.html that follows spec.md exactly. Embed the events array verbatim in <script type="application/json" id="events">. Expose window.__theater exactly as the contract says, including marks and the cumulative snapshot(). Use three.js only from the pinned CDN URL in spec.md. No other network requests, no console errors, real-time playback of 30 to 45 seconds.

Answer with exactly one fenced code block tagged html containing the whole file, and nothing else.
----- PROMPT END -----
