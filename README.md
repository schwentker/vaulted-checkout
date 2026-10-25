# Vaulted Checkout, with Spend Theater

Vaulted Checkout is the payment system. Spend Theater is the Gemini 4 Argon part: it takes Vaulted Checkout's real payment log and builds, watches, critiques and repairs a short 3D film of every payment the agent tried, scored by a frozen evaluator Argon cannot edit.

AI agents can ask to pay. Only a vault can sign, and only inside fixed rules.

A Gemini agent shops over MCP and pays in USDC on Base Sepolia. The wallet key never touches the agent, the buyer's spend service, or any AI session. It lives in a Basis Theory vault, and a Reactor signs only the payments that pass the vault's own checks. A second part of the project uses Gemini 4 Argon to build, watch, critique and repair a visual replay of the payment log, scored by a frozen evaluator that Argon cannot edit (see Spend Theater below).

## Why it matters

Spend controls that live in the agent's own process can be talked around. Here the agent's tools are four fixed MCP calls, the spend service only produces a signed intent, and the vault re-checks the payee and the amount before it signs. A mistake or an attack upstream still ends at the vault.

```
Gemini agent --MCP (4 tools)--> spend service --intent (HMAC)--> Basis Theory Reactor + vaulted key
                                                                          |
                              merchant <--x402 v2 payment signature-------+
                                  |
                          Base Sepolia (USDC, EIP-3009)
```

## What the vault enforces

- The payee must be on the vault's allowlist. Anything else is refused with `rule_payto`.
- Each payment is capped inside the Reactor. The acceptance suite runs a 7.5 USDC order against a 5 USDC Reactor cap while the spend service allows 10, and the Reactor refuses it with `rule_amount`.
- An order is marked paid only after confirmed settlement. Paying twice returns the same receipt and settles once.
- The adapter returns allowlisted fields only. Intents, MACs, nonces, signatures and payment headers never reach the agent.

Real evidence: a 1.5 USDC payment settled on Base Sepolia (tx `0xd026fed37c35078edc3254ef5aa7b7c52af4492b77ae777ccdfb7a226e07fb5a`), after an earlier order was refused by the vault with `rule_payto`. See [fixtures/events-gate-b.jsonl](fixtures/events-gate-b.jsonl) and [docs/handoff/gate-b.md](docs/handoff/gate-b.md).

## Basis Theory integration

- Signer: a Node Reactor that checks the intent MAC and its rules, then signs an EIP-3009 `transferWithAuthorization` with the key held in the vault. See `reactors/signer`.
- Merchant: a fixed adapter profile based on the consortium v0.1.0 draft (manifest, products, orders, pay), using x402 v2 headers on `eip155:84532`. It intentionally differs in places and makes no full-conformance claim. Details in [CHANGELOG.md](CHANGELOG.md) and the merchant package.
- Agent skills and docs were treated as untrusted input throughout. No Basis Theory key, wallet key or HMAC key is ever in this repo or in an AI session; operators supply them at run time.

## Gemini 4 Argon: Spend Theater

Spend Theater turns the real payment log into a 30 to 45 second 3D replay and improves it with a loop:

1. **Generate** one single-file scene from `theater/spec.md` and the events (thinking level high). This first draft, iteration 0, is saved with hashes and never edited.
2. **Render** it in Chromium with Playwright and record the video.
3. **Check** it with the frozen evaluator in `theater/eval/`: contradictions with the log, event-order errors, amount and receipt errors, render failures. Counts are deterministic and hash-pinned, and the loop aborts if the evaluator changes.
4. **Watch and critique**: Argon reads the video, spec, rubric, events and check results, and returns timestamped issues and rubric scores (thinking level medium).
5. **Repair**: Argon revises the scene (thinking level high). Repeat, then stop when the critic passes and the frozen checks show zero errors.

Every iteration is listed in a scoreboard, including any that get worse. Frozen counts come first. Critic scores come second and are labeled "model-judged, same model family as the generator".

A clean run on the recorded Gate B log (a real settlement and a real refusal), using the final spec, went 2, 2, 0 frozen-check errors over three iterations and ended with a critic pass. The middle step traded one kind of error for another with no net gain, and is kept in the results. Two earlier exploratory runs on a defective spec (2, 1, 0 and 3, 0) are archived under `theater/runs/`. The frozen checks read the scene's own telemetry, so zero means no recorded contradictions, not proof of every drawn claim. Evidence is under `theater/runs/`.

The loop works with the API (`--mode api`) or by copy and paste through AI Studio (`--mode manual`), with every model input and output hashed in `theater/manifest.json`.

## What is real and what is not

- Real: Base Sepolia testnet USDC settlement, a Basis Theory Reactor signer, and recorded model calls with hashes.
- Not real: testnet only. Spend control is a per-payment cap and a payee allowlist, not budgets or approvals. The replay is a rendering of a log, not a second source of truth. The critic is the same model family as the generator.
- The frozen checks read the scene's own reported telemetry. They do not prove every drawn claim against the chain, and they cannot see objects a scene fails to report.

## Layout

- `packages/merchant`, `packages/spend-service`, `packages/shared`, `packages/mcp-adapter`: the store, the spend service, shared wire code and the four-tool MCP adapter.
- `agent/`: the Gemini buyer (Interactions API function calling).
- `reactors/signer`: the Basis Theory Reactor.
- `contracts/`: payment and event schemas, golden fixtures.
- `theater/`: Spend Theater. `theater/eval/` is frozen.
- `docs/handoff/`, `docs/review/`: build log and independent reviews.

## Run the checks (no keys needed)

```sh
npm ci
npm test
npm run theater:verify
npm run theater:self-test
npm run theater:test
```

Node 26.12.0 and npm 11.20.0, all dependencies pinned. Rendering needs `npx playwright install chromium ffmpeg`.

## Run Spend Theater

Needs a Gemini API key exported in your own shell. It is never committed or logged.

```sh
read -s GEMINI_API_KEY; export GEMINI_API_KEY
node theater/ping.mjs
node theater/build-scene.mjs fixtures/events-gate-b.jsonl --mode api
node theater/loop.mjs --events fixtures/events-gate-b.jsonl --iterations 3 --mode api --out theater/runs/r2
```

## License

MIT. See [LICENSE](LICENSE).
