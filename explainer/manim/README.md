# Vaulted Checkout ManimCE pipeline

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
