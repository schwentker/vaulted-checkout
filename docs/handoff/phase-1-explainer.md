# Handoff: explainer phase 1

This is the explainer's Describe step, separate from software build phases 1 through 5. It does not replace their handoffs.

- Builder / model / effort: Codex / GPT-6 family; exact runtime model identifier not exposed / runtime effort setting not exposed. No subagents used.
- Date (UTC): 2026-10-25.
- Branch + commit: `claude/phase-3` at `4376547f192e76001507dc47043a710d2c274e2d`. No branch change or commit made.
- Uncommitted files for this work: `explainer/scenes.md`, `explainer/production-upgrade.md`, `docs/handoff/phase-1-explainer.md`. Existing modified and untracked implementation, runbook, evidence, and handoff files were left untouched.
- Contract version (CHANGELOG entry): v1.1, unchanged; existing 2026-10-24 phase 3 entry. No contract or CHANGELOG edits for this work.
- What is done: Ten-scene, 75-second plan with narration, labels, movement and start/end states, active color blocks, and one takeaway per scene. Includes a shared visual grammar, source traceability, public-value reference, and explicit review gates.
- User choices incorporated: S4 trimmed to 25 words while retaining 12 seconds; ElevenLabs voice-over plus captions; provisioner labeled `one-time use`; refused destination labeled `unapproved payee` instead of an address placeholder.
- Source review: Read SPEC.md, contracts/intent.md, contracts/state-machine.md, contracts/README.md, docs/handoff/gate-b.md, docs/handoff/gate-a.md, docs/handoff/phase-3.md, and CHANGELOG.md. Used the current checkout in place of the brief's old cloud paths. No environment file or secret was opened or needed.
- MCP status note superseded by the user-provided active deployment status. Current explainer source: `explainer/scenes.md`.
- Tests: Documentation validation below passed: 10 complete scenes, 75 seconds, every narration at most 25 words, S4 exactly 25 words, diagram labels at most four words, valid local source links, no em dashes, and no trailing whitespace. Application tests are not needed for this scene-plan-only change. No image render, video render, live payment, or voice generation was attempted.
- Migrations / DB state: None.
- Deployment ids (sanitized, no keys): No deployment created or changed. Only public testnet addresses and the recorded transaction are included in the scene plan.
- Open questions for the other vendor: None blocking the written plan. Runtime model identifier and effort were not available and have not been guessed. Carry forward the unconfirmed operator checks in Gate B without portraying them as done.
- Next action (first thing the next builder does): Obtain Robert's review of `explainer/scenes.md`. After approval, create only the labeled S1 overview SVG and PNG and stop for its review. Do not begin scene keyframes or animation before their respective approvals.

## Motion direction review

The user requested a principal motion director's critique of pacing, audio synchronization, mobile layout, and S8 ownership. Added `explainer/production-upgrade.md` as a proposal; the original scene list is unchanged. It retains all durations and gives side-by-side narration edits, detailed S4/S5 timings, SFX cues, mobile layout targets, ManimCE constraints, and later animatic acceptance criteria. The proposed S4 narration is still exactly 25 words. The proposed clean-video versus annotated-reference overview split requires review because it refines the original overview requirement.

Consulted official ManimCE configuration, text, AnimationGroup, and Scene audio documentation, plus ElevenLabs pause guidance. Links are embedded next to the implementation claims. No dependencies installed, no secrets accessed, and no stills, audio, or video generated. This remains explainer phase 1, pending content review.

Additional validation command and result: PASS, S4 has 25 words; nine production items; no em dashes or trailing whitespace.

```sh
python3 - <<'PY'
from pathlib import Path
import re
p = Path('explainer/production-upgrade.md')
s = p.read_text()
row = next(line for line in s.splitlines() if line.startswith('| S4 |'))
narration = row.split('|')[3].strip().strip('“”')
assert len(narration.split()) == 25
assert len(re.findall(r'^\d+\. \*\*', s, re.M)) == 9
for name in [str(p), 'docs/handoff/phase-1-explainer.md']:
    content = Path(name).read_text()
    assert '\u2014' not in content
    assert all(line == line.rstrip() for line in content.splitlines())
print('PASS: S4 has 25 words; nine production items; no em dashes or trailing whitespace')
PY
```

## Documentation validation

Exact command, run from the repository root:

```sh
python3 - <<'PY'
from pathlib import Path
import re
p = Path('explainer/scenes.md')
s = p.read_text()
scenes = re.findall(r'^## (S\d+):[^\n]*\n(.*?)(?=^## |\Z)', s, re.M | re.S)
assert [sid for sid, _ in scenes] == [f'S{i}' for i in range(10)]
total = 0
for sid, body in scenes:
    seconds = int(re.search(r'\*\*Duration:\*\* (\d+) s', body)[1])
    words = len(re.search(r'\*\*Narration:\*\* (.+)', body)[1].split())
    assert words <= 25 and (sid != 'S4' or words == 25), (sid, words)
    for field in ['On-screen labels', 'Start state', 'What moves', 'End state', 'Lit blocks', 'One idea']:
        assert f'**{field}:**' in body, (sid, field)
    for line in body.splitlines():
        if line.startswith(('- **On-screen labels:', '- **Supporting labels:')):
            assert all(len(label.split()) <= 4 for label in re.findall(r'`([^`]+)`', line)), sid
    total += seconds
    print(f'{sid}: {seconds}s, {words} narration words')
assert total == 75, total
for name in ['explainer/scenes.md', 'docs/handoff/phase-1-explainer.md']:
    text = Path(name).read_text()
    assert '\u2014' not in text and text.endswith('\n'), name
    assert all(line == line.rstrip() for line in text.splitlines()), name
for target in re.findall(r'\]\((\.\./[^)]+)\)', s):
    assert (p.parent / target).is_file(), target
print('PASS: all scene-plan checks')
PY
```
