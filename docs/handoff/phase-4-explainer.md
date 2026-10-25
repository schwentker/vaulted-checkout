# Handoff: explainer phase 4

- Builder / model / effort: Codex / GPT-6 family, exact runtime identifier and effort setting not exposed. No subagents.
- Date (UTC): 2026-10-25.
- Branch + commit: `claude/phase-3`, `4376547f192e76001507dc47043a710d2c274e2d`. No branch change or commit.
- Scope: First 15 seconds of the current explainer, rendered at 1920x1080 and 30 fps with captions and ElevenLabs voice `bGaO5vdJcnB4WojYqfuK`.
- Current status: Complete. Delivered a captioned 15-second 1080p MP4 with the requested ElevenLabs voice.
- Credential authorization: The user's latest explicit request authorizes using the ElevenLabs API credential from `.env` for this voice generation. Only the matching ElevenLabs credential is selected. It is never displayed, written to an artifact, or passed on a command line. No Basis Theory or wallet credential is used.
- Contract version: v1.1, unchanged. No application or contract edits.
- Narration boundary: Only complete beat phrases ending within the preview are voiced. The next visual beat begins at 14.4 seconds, while its full narration belongs beyond this preview. No word is cut at 15 seconds.
- Migrations / DB state: None.
- Next action: User reviews voice, pace and reveals before extending the voiced movie.

## Result and verification

- Output: `explainer/renders/vaulted-checkout-first-15s.mp4`.
- Audio: ElevenLabs `eleven_multilingual_v2`, voice `bGaO5vdJcnB4WojYqfuK`, synthesis speed 1.2. Two short API takes were generated to resolve the initial slow delivery. The retained take is the second one.
- Character timestamps align ten complete phrases to their existing beat windows. Additional pitch-preserving tempo adjustments range from 1.0 to 1.367. No phrase overruns its beat or gets cut at the preview boundary.
- Credentials: Network access needed the sandbox's approved escalation. The API key was sent only in the ElevenLabs authorization header and never printed or stored in the output. No protected BT or wallet credential was selected or used.
- Pipeline: `explainer/manim/preview.py` assembles existing rendered scenes and timestamped speech without credentials or network access.
- Exact commands: `python explainer/manim/render.py --scenes S0 S1`, then `python explainer/manim/preview.py`, using the existing pinned renderer environment. Both passed.
- ffprobe verifies 450 H.264 frames, 30 fps, 1920x1080, exactly 15.000 seconds, with 48 kHz stereo AAC audio. Signal checks verify finite samples, no clipped samples, and audible speech in every corresponding beat window.
- `verify_storyboard.py` passes after the preview changes. No source timeline, narration or slide deck changed.
- Visual QA found an actual renderer layering defect: Transform retained the old object's z-index when a role's focus changed. The target layer is now applied to the existing object before transformation. Re-rendered S0 and S1 and inspected the affected Basis Theory/Base Sepolia and MCP/spend-service frames. Labels remain visible.
- Checked final opening, USDC reveal, vault reveal, agent dock, MCP connection and final intent frames. Initial render defects were fixed before delivery.
- No application dependencies, contracts, database state or deployment changed. No subagents.
- API reference: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
