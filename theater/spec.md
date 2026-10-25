# Spend Theater: shared goal for generator, critic and repairer

This file is the single goal. The generator writes a scene to it, the critic
judges the rendered video against it, the repairer fixes the scene toward it.
The frozen checks in theater/eval/ measure the scene independently; this file
never overrides them.

## What the scene is

A single-file `scene.html` that replays a real payment log as a short 3D film.
A Gemini agent tries to buy research for a small drug-discovery company. Every
payment is asked for by the agent, judged by a spend policy, and signed (or
refused) by a Basis Theory vault that holds the wallet key. Settled payments land
on the Base Sepolia chain. The film shows exactly what the log says, in order,
and nothing else.

## Stage

Six stations, laid out left to right, visible from t=0 as quiet static shapes:

| Station | Name in snapshot | Look |
| --- | --- | --- |
| Buyer company | `buyer` | small building, paper tones |
| Gemini agent | `agent` | figure or terminal, paper tones with yellow message accents |
| Spend policy | `spend` | gate or checkpoint |
| Basis Theory vault | `vault` | blue vault box; the key is drawn inside it and never leaves it |
| Merchant | `merchant` | storefront; dark until it is paid |
| Base Sepolia chain | `chain` | row of red linked blocks |

Palette roles (do not swap them):

- Blue: Basis Theory vault and anything it signs or seals.
- Red: money and the chain (coins, chain blocks, receipt).
- Yellow: messages and requests (packets moving between stations).
- Paper background (warm off-white, for example #f3ead7) with dark ink text.

Camera: fixed or slow drift; every station stays in frame at 1280x720.

## Timeline

- Total duration 30 to 45 seconds of real time (`requestAnimationFrame` or
  timers on `performance.now()`), never faster, never waiting on input.
- Replay the events in file order. Scale the original `t` values into the
  replay, but give each event its own beat of at least 4 seconds so the viewer
  can read it. File order wins over original spacing.
- One new meaningful element per beat. Nothing appears before its event.
- End with a 3 to 5 second hold of the final state, then set `done = true`.

## Beats per event kind

- `refused` (actor vault): a yellow packet travels agent -> spend -> vault and
  stops at the vault. The vault shows a refusal mark (blue seal with a cross)
  and the code text, for example `refused rule_payto`. No coin, no chain block,
  merchant stays dark. Caption: "Vault refused the payment: <code>".
- `settled` (actor chain): a yellow packet travels agent -> spend -> vault, the
  vault seals it (blue), then, only after that, a red coin moves from the Buyer
  company side to the merchant: the buyer pays the merchant, and the chain is
  not the recipient. The chain then shows a separate ledger cue: a new red
  block is appended to the chain row with a short "recorded on the ledger"
  pulse, no coin entering it. Label: `<amount> USDC` and the first 10
  characters of txHash including 0x (for example `0xd026fed3`). Merchant
  lights up. Caption: "Settled on Base Sepolia: <amount> USDC, receipt
  <first 10 of txHash>". The coin element is the payment (`coin:<orderId>`). The appended block is
  part of the static chain station: draw it, but do not add a separate
  snapshot element for it (the evaluator fails any unbound non-station
  element). Record the ledger cue as a label only, containing the orderId and
  the receipt, for example `<orderId> recorded on the ledger <first 10 of txHash>`,
  at or after the coin's time.
- `pay_requested`, `order_created`, `list`, `pending`: a yellow packet or
  message card at the acting station with a plain caption. `pending` never
  shows a coin or the word settled or paid.

If the log has a refusal and a settlement for different orders, they are two
separate stories. Never put a coin, a settled label, or the merchant lighting
on the refused order.

## Caption bar

A bar along the bottom, at least 28px text, high contrast on paper, one plain
sentence per beat, legible at 1280x720 without zooming. Use plain words:
"asked", "refused", "settled", "receipt". Each caption that mentions an
outcome includes the orderId as a whole token (it can be small, after the
sentence) so the evaluator can bind it.

## Truth rules

- The key never leaves the vault. Nothing key-shaped moves.
- Show only amounts, codes and hashes that appear in the events. Amounts as
  `<decimal> USDC`. Receipts as exactly `txHash.slice(0, 10)`.
- Outcome words: settled or paid only for a settled order; refused, refusal or
  rejected plus the code only for a refused order.
- No invented products, prices, stations, or extra payments.

## Scene contract (the frozen evaluator reads this; see theater/eval/README.md)

- Events embedded as `<script type="application/json" id="events">[...]</script>`
  holding the events array exactly as given. The scene reads them from there.
- three.js from the pinned CDN only:
  `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`
  (import in a `<script type="module">`). No other network requests.
- Labels and captions as HTML overlays (CSS2D-style absolutely positioned
  divs) so they stay sharp. No console errors.
- `window.__theater = { duration, marks, done, snapshot() }`, set synchronously
  at the top of the first script, before any module loads:
  - `duration`: seconds, 30 to 45.
  - `marks`: push exactly one `{t, kind, orderId, element}` per event at the
    moment that event becomes visible. `t` is replay milliseconds since the
    replay started. `kind` and `orderId` copy the event. `element` is the role
    that appeared: `packet`, `coin`, `refusal`, `settled`, `agent`, `spend`,
    `vault`, `merchant`, `chain`.
  - `snapshot()` returns a cumulative history `{labels:[{text,t,orderId?}],
    elements:[{name,visibleFrom,visibleTo,orderId?}]}` of everything ever shown,
    including objects removed before the end. `visibleTo` is the removal time,
    or `duration * 1000` if still visible. Each changed label text is a new
    entry with its first visible time.
  - Bind payment things to their order: name moving objects
    `coin:<orderId>`, `refusal:<orderId>`, `packet:<orderId>`, or add an
    explicit `orderId` field. Labels with an amount, txHash, settled/paid or
    refused/refusal words must carry the orderId (field or whole token).
  - Static stations may be recorded with `visibleFrom: 0` and their plain role
    name (`agent`, `vault`, ...).
  - The replay clock starts when `window.__theater` is created. Set
    `done = true` at the end, within the declared duration.
