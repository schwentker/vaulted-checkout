## Add the MCP adapter, Gemini buyer, independent acceptance suite and Spend Theater loop

Builds on the payment core (merchant, spend service, Basis Theory signer Reactor, Gate B evidence).

### What this adds
- `packages/mcp-adapter`: four fixed MCP tools over the spend API, allowlisted outputs, loopback-only origin.
- `agent/`: Gemini buyer on the Interactions API, with a scripted fallback.
- Independent acceptance tests for the adapter, the event schema, and the frozen replay evaluator (`theater/eval/`).
- `theater/`: Spend Theater generate, render, check, watch, critique, repair loop with API and manual modes, hashed manifest, scoreboard, and fake-model tests.
- README, MIT license, handoff notes and independent review.

### How to check
```sh
npm ci && npm test            # 52 tests
npm run theater:verify
npm run theater:self-test
npm run theater:test
```
No keys are needed for any of these.

### What to look at
- Adapter output allowlists and ID validation (`packages/mcp-adapter/src`).
- That the frozen evaluator is hash-checked before every loop (`theater/eval/verify-frozen.mjs`, `theater/loop.mjs`).
- `docs/review/` for the independent reviews and how their findings were handled.

### Honest limits
- Testnet only. Per-payment cap and payee allowlist only.
- Exploratory theater runs are included under `theater/runs/` and labeled as such. A clean measured run will follow.
- The critic is the same model family as the generator, and the evaluator reads the scene's own telemetry.
