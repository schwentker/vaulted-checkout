# Visual critique rubric v1

Report these scores separately from deterministic checks. Label them:
"model-judged, same model family as the generator". Score each axis from
0 to 10 using the full video at 1280x720. Scores are integers. Do not alter,
average, subtract from, or replace the deterministic counts.

| Axis | What to inspect | 0 | 5 | 10 |
| --- | --- | --- | --- | --- |
| legibility | Read labels and captions at 1280x720 without zooming. Check size, contrast, overlap, and time on screen. | Unreadable | Some labels need pausing or overlap | Every essential label is readable at normal playback |
| sequence | Follow the agent, spend policy, vault, merchant, and chain in observed event order. | Causal story is reversed or incoherent | Mostly clear with an ambiguous transition | Every step follows visibly from the preceding evidence |
| beat_discipline | Introduce one new meaningful element per beat. Allow the viewer to understand it before the next beat. | Many competing arrivals | Occasional competing arrivals or rushed beats | One clear new element per beat throughout |
| style | Use blue for Basis Theory, red for money and chain, yellow for messages, and a paper background. Keep shapes and movement consistent. | Palette roles are confused | Mostly consistent with distracting exceptions | Roles and visual hierarchy are consistent throughout |
| truth_visual | Captions plainly distinguish a request, refusal, pending state, and confirmed settlement. Show the correct price and receipt. The key stays in the vault. | Invents a payment or reverses a refusal | Accurate facts with unclear captions | Accurate facts and captions with no misleading implication |

For every issue, give the time in seconds, severity, rule, what was seen,
what the evidence requires, and a concrete fix. A high aesthetic score cannot
excuse a contradiction. Judge the whole iteration, including regressions.
