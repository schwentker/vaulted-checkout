# Vaulted Checkout: 90-second scene plan

49 beats, 30 fps, 2,700 frames. White ground, Mondrian grid, one reveal per beat.

MCP deployment status is supplied by the user. The architecture uses the active MCP tool server, forwarding through the spend service. The historical Gate B transaction is evidence of settlement, not evidence of a new MCP execution.

The timing below reserves pauses around a roughly 2.5-word-per-second spoken delivery. Voice synthesis has not yet been generated or measured.

## Timing

| Scene | Start | End | Seconds | Beats | Words |
|---|---|---|---|---|---|
| S0 | 0 | 6 | 6 | 4 | 13 |
| S1 | 6 | 26 | 20 | 12 | 42 |
| S2 | 26 | 34 | 8 | 4 | 14 |
| S3 | 34 | 42 | 8 | 3 | 14 |
| S4 | 42 | 53 | 11 | 5 | 27 |
| S5 | 53 | 62 | 9 | 5 | 19 |
| S6 | 62 | 70 | 8 | 3 | 18 |
| S7 | 70 | 76 | 6 | 3 | 14 |
| S8 | 76 | 86 | 10 | 7 | 25 |
| S9 | 86 | 90 | 4 | 3 | 8 |

## S0: an agent pays

A buyer. An agent buys. In testnet USDC. Basis Theory holds the key.

| Beat | Absolute frames | Seconds | Focus | Spoken phrase |
|---|---|---|---|---|
| 1 | 0 to 30 | 1 | buyer | A buyer. |
| 2 | 30 to 66 | 1.2 | agent | An agent buys. |
| 3 | 66 to 108 | 1.4 | chain | In testnet USDC. |
| 4 | 108 to 180 | 2.4 | vault | Basis Theory holds the key. |

## S1: separate roles, one payment

The buyer. Its agent shops. The spend service decides. Through fixed tools. It checks policy. Keeps a ledger. Seals approved intents. Basis Theory checks five fixed rules. Then accesses the key. The merchant requests payment. A facilitator submits it. The chain settles.

| Beat | Absolute frames | Seconds | Focus | Spoken phrase |
|---|---|---|---|---|
| 1 | 180 to 210 | 1 | buyer | The buyer. |
| 2 | 210 to 252 | 1.4 | agent | Its agent shops. |
| 3 | 252 to 306 | 1.8 | spend | The spend service decides. |
| 4 | 306 to 348 | 1.4 | mcp | Through fixed tools. |
| 5 | 348 to 390 | 1.4 | spend | It checks policy. |
| 6 | 390 to 432 | 1.4 | spend | Keeps a ledger. |
| 7 | 432 to 474 | 1.4 | spend | Seals approved intents. |
| 8 | 474 to 564 | 3 | signer | Basis Theory checks five fixed rules. |
| 9 | 564 to 612 | 1.6 | vault | Then accesses the key. |
| 10 | 612 to 666 | 1.8 | merchant | The merchant requests payment. |
| 11 | 666 to 720 | 1.8 | facilitator | A facilitator submits it. |
| 12 | 720 to 780 | 2 | chain | The chain settles. |

## S2: the order

The agent orders. One and a half USDC. Then asks to pay. Payment required.

| Beat | Absolute frames | Seconds | Focus | Spoken phrase |
|---|---|---|---|---|
| 1 | 780 to 828 | 1.6 | merchant | The agent orders. |
| 2 | 828 to 900 | 2.4 | merchant | One and a half USDC. |
| 3 | 900 to 960 | 2 | spend | Then asks to pay. |
| 4 | 960 to 1020 | 2 | spend | Payment required. |

## S3: the decision

The service checks the terms. Saves a nonce and expiry. Then seals the intent.

| Beat | Absolute frames | Seconds | Focus | Spoken phrase |
|---|---|---|---|---|
| 1 | 1020 to 1092 | 2.4 | spend | The service checks the terms. |
| 2 | 1092 to 1188 | 3.2 | spend | Saves a nonce and expiry. |
| 3 | 1188 to 1260 | 2.4 | spend | Then seals the intent. |

## S4: inside basis theory

The sealed intent enters Basis Theory. The signer checks the seal. Then all five fixed rules. Only then can it sign. The signature leaves. The key stays.

| Beat | Absolute frames | Seconds | Focus | Spoken phrase |
|---|---|---|---|---|
| 1 | 1260 to 1332 | 2.4 | signer | The sealed intent enters Basis Theory. |
| 2 | 1332 to 1392 | 2 | signer | The signer checks the seal. |
| 3 | 1392 to 1452 | 2 | signer | Then all five fixed rules. |
| 4 | 1452 to 1518 | 2.2 | vault | Only then can it sign. |
| 5 | 1518 to 1590 | 2.4 | spend | The signature leaves. The key stays. |

## S5: settlement

The service checks the signature. Merchant records the claim. Verified. Submitting. USDC moves on chain. Confirmed. The receipt returns.

| Beat | Absolute frames | Seconds | Focus | Spoken phrase |
|---|---|---|---|---|
| 1 | 1590 to 1650 | 2 | spend | The service checks the signature. |
| 2 | 1650 to 1704 | 1.8 | merchant | Merchant records the claim. |
| 3 | 1704 to 1746 | 1.4 | facilitator | Verified. Submitting. |
| 4 | 1746 to 1800 | 1.8 | chain | USDC moves on chain. |
| 5 | 1800 to 1860 | 2 | spend | Confirmed. The receipt returns. |

## S6: the refusal

A separate request names an unlisted payee. The seal passes. The payee fails. Refused. No signature. No transfer.

| Beat | Absolute frames | Seconds | Focus | Spoken phrase |
|---|---|---|---|---|
| 1 | 1860 to 1956 | 3.2 | signer | A separate request names an unlisted payee. |
| 2 | 1956 to 2028 | 2.4 | signer | The seal passes. The payee fails. |
| 3 | 2028 to 2100 | 2.4 | vault | Refused. No signature. No transfer. |

## S7: same order, same receipt

Pay the same order again. The ledger finds its receipt. One transfer. Same receipt.

| Beat | Absolute frames | Seconds | Focus | Spoken phrase |
|---|---|---|---|---|
| 1 | 2100 to 2160 | 2 | spend | Pay the same order again. |
| 2 | 2160 to 2220 | 2 | spend | The ledger finds its receipt. |
| 3 | 2220 to 2280 | 2 | chain | One transfer. Same receipt. |

## S8: who holds what

Wallet key: Basis Theory. Seal key: shared authentication. Invoker: invoke only. Management: operator only. Provisioner: one-time use. Agent: no buyer keys. Merchant: no buyer keys.

| Beat | Absolute frames | Seconds | Focus | Spoken phrase |
|---|---|---|---|---|
| 1 | 2280 to 2328 | 1.6 | vault | Wallet key: Basis Theory. |
| 2 | 2328 to 2376 | 1.6 | seal | Seal key: shared authentication. |
| 3 | 2376 to 2412 | 1.2 | invoker | Invoker: invoke only. |
| 4 | 2412 to 2448 | 1.2 | operator | Management: operator only. |
| 5 | 2448 to 2484 | 1.2 | provisioner | Provisioner: one-time use. |
| 6 | 2484 to 2532 | 1.6 | agent | Agent: no buyer keys. |
| 7 | 2532 to 2580 | 1.6 | merchant | Merchant: no buyer keys. |

## S9: policy, signature, settlement

Policy decides. The signer signs. The chain settles.

| Beat | Absolute frames | Seconds | Focus | Spoken phrase |
|---|---|---|---|---|
| 1 | 2580 to 2610 | 1 | spend | Policy decides. |
| 2 | 2610 to 2655 | 1.5 | signer | The signer signs. |
| 3 | 2655 to 2700 | 1.5 | chain | The chain settles. |

## Protocol and visual constraints

- The wallet glyph is fixed at master coordinates `(850, 703)`, size 49. The responsive containment view fixes its glyph at `(155, 820)`, size 96. Whole-view camera easing does not represent key export.
- Basis Theory retrieves the key into the signer runtime after authentication and every fixed rule passes. The key can leave token storage inside Basis Theory. The payment application does not receive it after provisioning.
- No session-handle protocol or HSM certification is asserted. Light and shackle changes are visual metaphors.
- Five rule ticks summarize payee allowlist, per-payment amount cap, remaining expiry, network/asset and policy version. Authentication, schemas and domain validation still apply.
- The HMAC seal authenticates the new canonical intent envelope. It does not authenticate the raw merchant 402 card or sign the payment.
- Public commercial traffic uses a distinct upper lane outside the blue enclosure. Invocation uses its own lower lane.
- Only confirmed successful settlement produces settled and paid states. Three red discs together represent 1.5 USDC.
- Duplicate requests use the existing settled attempt and receipt. Nonce and expiry never change.
- Provisioner wording is `one-time use`. Deletion is unconfirmed. Management remains an operator role.
- The six-cell ownership view shows five key classes. The shared seal key appears at two owners.
- Closing wording is `the signer signs`, identifying the executing component.
- Footers are subtle at 40% opacity. Main portrait labels and captions are at least 64 source pixels, equivalent to 16 pt at 360 px wide display.

## Review assets

The S1 through S5 sign-off stills are in `explainer/stills/beats/`. All 49 widescreen and 49 responsive portrait beat states come from the same description. Portrait uses a focus composition and bounded camera easing, preserving the complete active containment outline rather than cutting through it.

Review the stills before final narration and the full video render.
