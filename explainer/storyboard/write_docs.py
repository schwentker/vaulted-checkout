"""Write current scene and timing documentation from the authoritative beat data."""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
d=json.loads((ROOT/'storyboard'/'storyboard.json').read_text())
lines=['# Vaulted Checkout: 90-second scene plan','',
       '49 beats, 30 fps, 2,700 frames. White ground, Mondrian grid, one reveal per beat.',
       '','MCP deployment status is supplied by the user. The architecture uses the active MCP tool server, forwarding through the spend service. The historical Gate B transaction is evidence of settlement, not evidence of a new MCP execution.',
       '','The timing below reserves pauses around a roughly 2.5-word-per-second spoken delivery. Voice synthesis has not yet been generated or measured.',
       '','## Timing','',
       '| Scene | Start | End | Seconds | Beats | Words |',
       '|---|---|---|---|---|---|']
for s in d['scenes']:
    lines.append(f"| {s['scene']} | {s['startFrame']/30:g} | {s['endFrame']/30:g} | {s['durationFrames']/30:g} | {s['beats']} | {len(s['narration'].split())} |")
for s in d['scenes']:
    lines += ['',f"## {s['scene']}: {s['heading']}",'',s['narration'],'',
              '| Beat | Absolute frames | Seconds | Focus | Spoken phrase |',
              '|---|---|---|---|---|']
    for f in d['frames']:
        if f['scene']==s['scene']:
            lines.append(f"| {f['step']} | {f['startFrame']} to {f['endFrame']} | {f['durationFrames']/30:g} | {f['focus']} | {f['cue']} |")
lines += ['','## Protocol and visual constraints','',
          '- The wallet glyph is fixed at master coordinates `(850, 703)`, size 49. The responsive containment view fixes its glyph at `(155, 820)`, size 96. Whole-view camera easing does not represent key export.',
          '- Basis Theory retrieves the key into the signer runtime after authentication and every fixed rule passes. The key can leave token storage inside Basis Theory. The payment application does not receive it after provisioning.',
          '- No session-handle protocol or HSM certification is asserted. Light and shackle changes are visual metaphors.',
          '- Five rule ticks summarize payee allowlist, per-payment amount cap, remaining expiry, network/asset and policy version. Authentication, schemas and domain validation still apply.',
          '- The HMAC seal authenticates the new canonical intent envelope. It does not authenticate the raw merchant 402 card or sign the payment.',
          '- Public commercial traffic uses a distinct upper lane outside the blue enclosure. Invocation uses its own lower lane.',
          '- Only confirmed successful settlement produces settled and paid states. Three red discs together represent 1.5 USDC.',
          '- Duplicate requests use the existing settled attempt and receipt. Nonce and expiry never change.',
          '- Provisioner wording is `one-time use`. Deletion is unconfirmed. Management remains an operator role.',
          '- The six-cell ownership view shows five key classes. The shared seal key appears at two owners.',
          '- Closing wording is `the signer signs`, identifying the executing component.',
          '- Footers are subtle at 40% opacity. Main portrait labels and captions are at least 64 source pixels, equivalent to 16 pt at 360 px wide display.',
          '','## Review assets','',
          'The S1 through S5 sign-off stills are in `explainer/stills/beats/`. All 49 widescreen and 49 responsive portrait beat states come from the same description. Portrait uses a focus composition and bounded camera easing, preserving the complete active containment outline rather than cutting through it.',
          '','Review the stills before final narration and the full video render.']
(ROOT/'scenes.md').write_text('\n'.join(lines)+'\n')
(ROOT/'storyboard'/'README.md').write_text('''# Vaulted Checkout storyboard

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
''')
(ROOT/'manim'/'README.md').write_text('''# Vaulted Checkout ManimCE pipeline

The shared timeline has ten scene classes, 49 beats and exactly 90 seconds.
Dependencies remain pinned to ManimCE 0.19.0 and fonttools 4.67.0, with the full
resolved renderer environment in `requirements-lock.txt`.

## Rendering

Build the shared JSON and vectors first, following `../storyboard/README.md`.
Then use:

```sh
python render.py --beats --scenes S1 S2 S3 S4 S5
python render.py --beats --aspect portrait --scenes S1 S2 S3 S4 S5
python render.py --scenes S0 S1 S2 S3 S4 S5 S6 S7 S8 S9
python render.py --aspect portrait --scenes S0 S1 S2 S3 S4 S5 S6 S7 S8 S9
```

Run those commands from this directory. Add `--quality low` for internal motion
checks. Final output dimensions are 1920x1080 or 1080x1350 at 30 fps. Captions
are rendered into each scene. Original sound cues are synthesized by
`make_sfx.py`; no external voice generation is performed here.

`scenes.py` exposes S0 through S9 and static classes such as S1B01. A beat's
duration includes every transition, packet hop, effect and hold. A runtime
assertion rejects overruns. Portrait has bounded camera easing between active
owner views. The key guard rejects any local wallet glyph translation.

The seven WAV cues are original deterministic synthesized sounds. Voice-over
still requires the selected voice take and a measured synchronization pass.
Narration is 194 words with pauses distributed across the 90-second timeline.

Futura Medium/Bold and Menlo use licensed system font files referenced in
`style.py`. Font files are not redistributed. SVG glyph outlines are generated
in `.glyphs/` and referenced by the shared JSON.

The wallet key icon is a role symbol, never a key value. Signature creation is
inside the Reactor. No HSM guarantee or alternate signing-handle mechanism is
asserted. Review beat stills before generating a final full video.
''')
(ROOT/'production-upgrade.md').write_text('''# Vaulted Checkout production specification

The current 90-second, 49-beat timeline is in `scenes.md`. Its generated source
is `storyboard/storyboard.json`. Both viewport outputs share that description.

- Reveal buyer, agent and infrastructure one at a time. The centered buyer
  shape transforms into its dock. Later scenes reuse the established topology.
- MCP is an active, solid gray node exposing fixed tools. The spend service
  remains on every merchant path. Blue signifies Basis Theory, red chain and
  settlement, amber requests and payloads, gray untrusted actors, black trust
  outlines and abstract credential glyphs.
- Compact headers leave room for routing. Low-opacity provisioning and testnet
  footers stay at the bottom. Commercial traffic uses its own top lane, outside
  the blue enclosure. Signer invocation uses a separate lower lane.
- Collapse policy details into `5 fixed rules`. The animation lights five ticks
  for the policy categories; authentication still precedes them.
- Keep the wallet glyph stationary. The shackle and local light pulse show
  access. A separate signature card forms in the signer and exits. The Reactor
  still reads the key into its Basis Theory runtime; no new signing protocol or
  hardware certification is implied.
- Show verification and submission before the transfer, then confirmed
  settlement and receipt. Paid status follows confirmed settlement. Three discs
  together represent 1.5 USDC.
- Give the duplicate request visible ledger impact and reflect the existing
  receipt. Keep the transfer count at one. The durable ledger, not signature
  bytes or a new payment attempt, supplies the application-level retry behavior.
- S8 retains the wallet anchor while ownership outlines resolve into six cells.
  The shared seal key appears at its two owners. Provisioner wording describes
  one-time use without claiming deletion. The close names the signer.
- Portrait uses a complete active-owner frame with 64 px labels and captions.
  Bounded camera easing follows the semantic focus. The full four-column master
  is not squeezed into a phone frame.
- SFX contact points: intent stamp, seal tick, fixed-rule lock click, signature
  tone, refusal thud, ledger strike and settlement chime. Keep the voice foremost.

The narration is reduced to the timing budget. Voice synthesis has not yet
been measured. Sign-off uses S1 through S5 PNG/SVG beat stills in `stills/beats/`.
''')
def stamp(frames):
    ms=round(frames*1000/30)
    h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'
(ROOT/'manim'/'captions.srt').write_text('\n'.join(f"{f['slide']}\n{stamp(f['startFrame'])} --> {stamp(f['endFrame'])}\n{f['cue']}\n" for f in d['frames']))
(ROOT/'manim'/'audio'/'cue-sheet.json').write_text(json.dumps([{'scene':f['scene'],'beat':f['step'],'startFrame':f['startFrame'],'endFrame':f['endFrame'],'narration':f['cue'],'sfx':f.get('sound')} for f in d['frames']],indent=2)+'\n')
print('Updated current scene, production and renderer documentation.')
