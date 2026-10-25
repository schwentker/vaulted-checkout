# Handoff: explainer phase 6

- Builder / model / effort: Codex / GPT-6 family, exact runtime identifier and effort setting not exposed. No subagents.
- Date (UTC): 2026-10-25.
- Branch + commit: `claude/phase-3`, `4376547f192e76001507dc47043a710d2c274e2d`. No branch change or commit.
- Scope: Complete voiced ensemble film, approximately 104 seconds, allowing 14 additional seconds for natural dialogue and visual holds.
- Status: Complete. Both films pass final verification and visual review and are ready to play.
- Direction: Same four-role cast. Longer coherent turns, fewer speaker changes, natural delivery speed, complete takes rather than phrase-by-phrase compressed clips. Narrator connects the stages. Actors retain first-person authority within their own components.
- Authorization: Prior authorization to use the ElevenLabs credential persists. Only that credential is selected and sent to ElevenLabs, never printed, stored in output or placed on a command line. No BT or wallet credential is used.
- Protocol: Confirmation precedes paid state, idempotency reuses the settled attempt, nonce/expiry remain fixed, key access occurs inside Basis Theory after checks, and provisioning does not imply deletion.
- Contract version: v1.1, unchanged. No app or contract changes.
- Next action: User reviews the complete film. No remaining production step is needed to play either version.

## Production result

- Runtime: 104 seconds, exactly 3,120 frames at 30 fps. This adds 14 seconds to the earlier edition while retaining 49 progressive reveals.
- Full outputs: `explainer/renders/vaulted-checkout-full-landscape.mp4` (1920x1080) and `vaulted-checkout-full-portrait.mp4` (1080x1350), H.264 video with 48 kHz stereo AAC, captions and ten chapter markers. Sidecar: `vaulted-checkout-full.srt`.
- Dialogue: 222 words in 17 coherent performances. Intro, ownership recap and close are carried by the narrator. The buyer side, signer and merchant speak at meaningful handoffs. Full takes retain their own internal breaths, pauses and cadence. No tempo changes or chopped phrase assembly.
- Cast: Bella narrator, QStar buyer side, Brian Basis Theory signer, Matilda merchant. Seventeen authorized ElevenLabs synthesis requests, model eleven_multilingual_v2 at speed 1.0.
- Loudness: Each actor processed as a continuous reel, then placed intact on the timeline. Measured output dialogue levels span 0.58 LU, with true peaks limited. Seven quiet original cues align to spoken state changes. No music or stereo positioning obscures dialogue.
- Source: `explainer/voice/film/script.py`, `prepare.py`, `assemble.py`, `verify.py`. Final scheduled script is `script.md`. A separate storyboard preserves the earlier deck and previews.
- Visual refinements: Stable semantic role IDs prevent focus bars from turning into glyphs. Ownership outlines morph from the topology and return at the close. Fixed wallet glyph survives every transition. Caption phrases remain coherent across reveals. Mobile caption duplicates removed, speaker/footer spacing checked, refusal label cleared from its panel border. Mobile retry stays in the spend-service view with an explicit chain transfer count.

## Verification

- All ten full-resolution scene renders pass runtime and exact key-geometry assertions in both aspect ratios. Exact timing assertions remain enabled.
- `python explainer/voice/film/verify.py` verifies exact encoded dimensions, durations, frame counts, four distinct voice IDs, intact unaccelerated audio, non-overlapping turns, audible dialogue, no clipped samples, ten chapters, seven cues, key anchors and confirmation ordering.
- The encoded landscape signing scene has 390 frames with the key continuously visible. Paid badge absent before confirmation, present afterward. Both encoded films have 3,120 frames and exactly 104 seconds.
- Text bounding checks pass in both compositions. Deliberate S7 background labels are occluded by the active ledger overlay; they are not simultaneously visible collisions.
- Reviewed representative frames from all ten scenes, including signing, refusal, idempotency, ownership and the final hold. Mobile refusal and retry fixes re-rendered for final review.
- An early verification attempt ran before MP4 muxing finished and reported a missing movie index. That file was not delivered. Verification was rerun after mux completion and passed, without loosening assertions.
- No application, contract, dependencies, database state or deployed service changed. Original 90-second deck and prior preview remain available. No subagents.
