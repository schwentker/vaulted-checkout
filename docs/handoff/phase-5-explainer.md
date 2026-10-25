# Handoff: explainer phase 5

- Builder / model / effort: Codex / GPT-6 family, exact runtime identifier and effort setting not exposed. No subagents.
- Date (UTC): 2026-10-25.
- Branch + commit: `claude/phase-3`, `4376547f192e76001507dc47043a710d2c274e2d`. No branch change or commit.
- Scope: Four-role voice casting, first-person dialogue script, revised opening 15-second movie and cast audition reel.
- Status: Complete for the revised 15-second opening, full dialogue script and four-role audition reel.
- Authorization: Prior explicit authorization to use the ElevenLabs credential persists for the requested voice work. Only the ElevenLabs credential is selected, never printed or stored. No BT or wallet credential is used.
- Contract version: v1.1, unchanged.
- Accuracy: Buyer-side voice represents the buyer and their trusted spend service. Speaker labels distinguish them. The untrusted agent never claims policy authority. Basis Theory voice represents the signer when saying it signs. Key containment means inside Basis Theory, including runtime retrieval. Merchant releases paid receipt only after confirmed settlement.
- Cast: Bella narrator, QStar neutral buyer side, Brian male Basis Theory, Matilda female merchant. Selected from current account voice descriptions. No claim of listening to the entire library or inferring performers' identities.
- Next action: User reviews the ensemble cast and opening before full-length voiced production.

## Deliverables and validation

- `explainer/renders/vaulted-checkout-first-15s-ensemble.mp4`: 1920x1080, 30 fps, exactly 15 seconds and 450 frames, stereo AAC. Original single-voice preview preserved.
- `explainer/renders/vaulted-checkout-cast-reel.mp3`: approximately 16 seconds, in narrator, buyer-side, Basis Theory, merchant order. It includes the later signing and merchant lines.
- `explainer/voice/casting/ensemble-script.md`: all 49 beats rewritten with first-person component dialogue and narrator handoffs, at the same 90-second timings. Every scene stays at or below 2.5 words per second.
- Four distinct voice IDs confirmed through current ElevenLabs account inventory and successful synthesis. Cast decisions derive from returned voice descriptions and intended register contrast. No claim of independently hearing all available voices.
- Model: eleven_multilingual_v2. Four API requests generated the role takes plus audition sentences. No API key printed, stored in output or sent to a service other than ElevenLabs.
- Speaker labels distinguish buyer, buyer's spend service, Basis Theory signer, merchant and narrator. The neutral buyer-side actor never gives the untrusted agent signing or policy authority.
- Separate ensemble storyboard preserves the original deck and dialogue edition. Manim accepts an explicit alternate storyboard through VC_EXPLAINER_STORYBOARD.
- Successful commands using existing pinned renderer environment: `python explainer/voice/casting/build_script.py`; Manim S0 and S1 at 1920x1080 and 30 fps with alternate storyboard; `python explainer/voice/casting/assemble.py`; `python explainer/storyboard/verify_storyboard.py`.
- Verified four unique selected voice IDs, ten synchronized opening phrases, no beat overruns, finite audio samples, no clipping and audible speech in every corresponding window. Maximum pitch-preserving tempo adjustment 1.259.
- Opening, vault, MCP connection, policy and ledger frames inspected with updated first-person captions and speaker labels. The silent final partial beat retains the next visual caption without cutting a spoken phrase.
- Full 90-second ensemble movie and merchant scene animation are not rendered in this phase. Merchant is included in the cast reel and full dialogue script.
- No contract, dependency, database or deployed service changes.
