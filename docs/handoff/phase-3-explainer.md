# Handoff: explainer phase 3

- Builder / model / effort: Codex / GPT-6 family, exact runtime identifier not exposed / runtime effort setting not exposed. No subagents.
- Date (UTC): 2026-10-25.
- Branch + commit: `claude/phase-3`, `4376547f192e76001507dc47043a710d2c274e2d`. No branch change or commit.
- Scope: User-authorized overhaul of the explainer, live presentation, 49-beat storyboard and ManimCE pipeline, at 90 seconds and 30 fps. No application or contract edits.
- Contract version: v1.1, unchanged. Existing CHANGELOG entry from 2026-10-24 phase 3.
- Current status: Complete for the requested storyboard, deck, pipeline update and S1 through S5 signoff stills. Final voice synthesis and full-resolution movie production remain subsequent production steps.
- Deployment context: The user supplies active MCP deployment status. The local MCP package README still identifies a placeholder, so no new implementation or deployment verification is claimed. SPEC.md supplies the complete agent to MCP to spend-service architecture. Gate B remains historical HTTP evidence and its real public transaction is retained as evidence, without claiming a newly executed MCP payment.
- Protocol decisions: Fixed wallet glyph coordinates. Runtime key retrieval occurs inside Basis Theory, as specified. Light and access pulses are visual metaphors. No HSM certification, transient-handle mechanism or key confined permanently to storage is asserted. Intent HMAC covers the canonical envelope, not a raw 402 header. Five rule ticks summarize payee, amount, remaining expiry, network/asset and policy version. Authentication and schema validation are separate.
- Other accuracy decisions: Idempotency uses a durable settled attempt and existing receipt. Provisioner deletion remains unconfirmed, so its label is `one-time use` without a deletion mark. Closing phrase identifies the signer as the executing component. Facilitator and merchant settlement/paid states follow confirmed settlement. Three red discs represent 1.5 USDC in total.
- Migrations / DB state: None.
- Secrets: No environment file or secret value read or needed. All credential glyphs are abstract.
- Next action: User reviews the live deck and signoff ZIP before final video and ElevenLabs voice generation.

## Deliverables

- Live native editable presentation: `artifact_VvbnjJtOKIBryWexpz5gdI-fbhjPs1pF`, state version 6, 49 slides.
- Shared source: `explainer/storyboard/storyboard.mjs` and enriched `storyboard.json`. Exactly 2,700 frames at 30 fps, 90 seconds.
- 49 landscape and 49 portrait SVG/PNG beat pairs. S1 through S5 contain 29 beats rendered again by ManimCE at full resolution in each aspect ratio.
- Signoff archive: `explainer/stills/S1-S5-signoff.zip`, 116 assets plus scene timing/narration.
- Manim dynamic scenes, anchored glyph guard, explicit packet paths, integer-frame transitions, bounded portrait camera, seven original SFX WAVs, SRT captions and cue sheet.
- Updated scene guide, production spec and renderer documentation. No final synthesized voice or full-resolution 90-second film generated.

## Validation and repairs

- All 49 final native slide previews inspected individually. Five label-clearance edits re-rendered and inspected again. Representative portrait focus views inspected, including the final S4 exit view.
- `verify_storyboard.py` passes: exact timeline, scene allocations, narration cadence, immutable glyph coordinates, containment, safe commercial routes, non-overlapping packet endpoints, confirmation ordering, assets and lexical constraints.
- Manim S1 through S5 full-resolution beat render commands passed for both landscape and portrait. Archive integrity verified.
- All ten low-resolution motion scenes rendered successfully in both aspects. ffprobe confirms each exact scene frame count and 2,700 total frames in each aspect. Original runtime assertions remain enabled.
- Final post-interpolation geometry guard passes all visible key frames. S4 landscape has 330 checked frames, S5 landscape 270, S4 portrait 324 after its initial camera entry. Composition and camera are checked together after interpolation.
- Encoded-video visibility checked separately. Landscape S4 key remains visible throughout. Portrait S4 key remains visible after its 14-frame camera/fade entry. The paid badge appears only after S5 frame 210. A moving packet can cross the future badge region earlier, so pixel color alone does not identify paid state.
- Actual defect fixed: the access pulse could occlude the key during a fade. Key body/hole now have permanent semantic layers 500/501.
- Actual defect fixed: mixed frozen and dynamic waits rounded fractional seconds differently. All transition lengths are quantized to integer frames and waits use dynamic frame sampling. Exact durations pass without loosening assertions.
- Exploratory diagnostics retained as failed observations, not green tests: exact H.264 threshold-pixel bounding boxes vary by one pixel with compression; an all-frame portrait pixel test includes the intentional view entry; a zero-amber-pixel paid-region test also detects a traveling packet. Exact geometry, post-entry visibility and badge-state checks measure the respective invariants separately.
- An intermediate mobject-updater diagnostic also ran on Manim animation copies before camera interpolation. Moving the same exact geometry assertion to the scene updater checks actual rendered objects after both interpolations.
- No application tests required for this isolated media change. No contract, dependency package or lockfile changed. No secret values or environment files read.
