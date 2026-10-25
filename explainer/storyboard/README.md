# Vaulted Checkout storyboard

Current version: 90 seconds, 49 beats, 30 fps, 2,700 frames.
The live presentation contains one editable slide per beat.

`storyboard.mjs` defines geometry, state transitions, complete narration, sound
cues and exact timestamps. `storyboard.json` is its generated snapshot, enriched
with outlined glyph assets by `render_vectors.py`.

The master contains four columns with solid MCP tool-server connections. The
portrait view follows the active owner with complete containment outlines and
64 px primary text. It uses the same semantic state and fixed local key anchor.

## Build

Run from the repository root:

```sh
node explainer/storyboard/build.mjs
python explainer/storyboard/render_vectors.py
python explainer/storyboard/write_docs.py
python explainer/manim/make_sfx.py
python explainer/manim/render.py --beats --scenes S1 S2 S3 S4 S5
```

Use the existing pinned renderer environment documented in `../manim/README.md`.
The static beat source, live slide writer and Manim renderer share the same
node descriptions. Primary stills are in `../stills/beats/`, responsive stills
in `../stills/portrait/`. The frame listing in `../scenes.md` is generated.

The source of truth remains SPEC.md and contracts/. Active MCP deployment status
comes from the user. Historical Gate B evidence is retained without claiming a
new end-to-end execution. No secret values or environment files are needed.
