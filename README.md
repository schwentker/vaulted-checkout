# Vaulted Checkout

An AI agent that can ask to buy, while only a vault can sign, inside fixed rules. Built for the Gemini 4 Argon hackathon on Base Sepolia testnet.

## What it does

1. A Gemini agent shops a store over MCP: list products, create an order, pay.
2. The buyer-side spend service checks policy and seals an intent with an HMAC. It never holds the wallet key.
3. A Basis Theory Reactor checks the intent against its own fixed rules (payee, per-payment amount) and signs an EIP-3009 USDC authorization with a vaulted key. The key never leaves the vault.
4. The merchant settles over x402 v2 on Base Sepolia. An order is paid only after confirmed settlement.
5. Gemini 4 Argon turns the recorded payment log into a short 3D replay (Spend Theater), watches the rendered video, critiques it, and repairs it. A frozen, deterministic evaluator checks the replay against the log.

Real evidence from the first live payment: 1.5 USDC settled in tx `0xd026fed37c35078edc3254ef5aa7b7c52af4492b77ae777ccdfb7a226e07fb5a`, after an earlier order was refused by the vault with `rule_payto`. See [fixtures/events-gate-b.jsonl](fixtures/events-gate-b.jsonl) and [docs/handoff/gate-b.md](docs/handoff/gate-b.md).

## What is real, and what is not

- Real: Base Sepolia testnet USDC settlement and a Basis Theory Reactor signer.
- Not real: testnet only, per-payment cap only (no budgets or approvals), the replay is a rendering of a log, and the critic is the same model family as the generator, so its scores are labeled that way.
- The frozen checks (contradictions, order errors, amount errors, render failures) read the scene's own telemetry. They do not prove every rendered claim against the chain, and they cannot see objects a scene fails to report.

## Layout

- `packages/merchant`, `packages/spend-service`, `packages/shared`, `packages/mcp-adapter`: the store, the spend service, shared wire code, and the four-tool MCP adapter.
- `reactors/signer`: the Basis Theory Reactor code.
- `agent/`: the Gemini buyer.
- `contracts/`: payment and event schemas.
- `theater/`: Spend Theater. `theater/eval/` is the frozen evaluator (hash-checked), the rest is the generate, watch, critique, repair loop and scoreboard.
- `docs/handoff/`: build log per phase and per agent. `docs/review/`: independent reviews.

## Run the checks (no keys needed)

```sh
npm ci
npm test
npm run theater:verify
npm run theater:self-test
node --test theater/test/*.test.mjs
```

Needs Node 26.12.0 and npm 11.20.0 (pinned). Rendering needs Playwright's browser: `npx playwright install chromium ffmpeg`.

## Run Spend Theater

Needs a Gemini API key, exported in your own shell and never committed.

```sh
read -s GEMINI_API_KEY; export GEMINI_API_KEY
node theater/ping.mjs
node theater/build-scene.mjs fixtures/events-gate-b.jsonl --mode api
node theater/loop.mjs --events fixtures/events-gate-b.jsonl --iterations 3 --mode api --out theater/runs/r1
```

`--mode manual` writes packets for AI Studio instead of calling the API. See [docs/handoff/ag-1.md](docs/handoff/ag-1.md). Iteration 0 is built once and never edited. Every iteration is kept and listed in the scoreboard, including any that got worse.

## Safety notes

Secrets never go in the repo or in an AI coding session: Basis Theory keys, wallet keys, the intent HMAC key and `GEMINI_API_KEY` are supplied by the operator at run time. `.env` files are ignored.

## License

MIT. See [LICENSE](LICENSE).
