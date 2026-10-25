# CC-1 handoff: buyer, MCP adapter, event log (Claude Code, 2026-10-25)

Branch: cc/buyer (uncommitted; Robert commits). Model: Claude Opus 5.5, effort low/fast.

## Result
`npm test`: 27/27 before, 41/41 after (10 adapter + 4 buyer tests added). `tsc` not run (tsc 7 binary is macOS only; run `npm run typecheck` on the laptop; note tsconfig `include` does not list `agent/**/*.ts` yet).

## Files
- packages/mcp-adapter/src/tools.ts: 4 tools, origin check, 30 s timeout, 64 KB cap, allowlisted outputs, string-math USDC.
- packages/mcp-adapter/src/server.ts: stdio entry (low-level MCP Server, SDK 1.32.2). Codex acceptance can spawn `node packages/mcp-adapter/src/server.ts`.
- packages/mcp-adapter/README.md: output shapes. Every output carries a `status` discriminator (settled, refused, pending, error, ok, created, order).
- agent/buyer.ts: buyer loop, `--scripted`, event log, transcript. agent/gemini.ts: model layer.
- scripts/start-merchant.ts: catalog now paper-tox-2026 (1500000) and dataset-tox-full (7500000). Not run.
- tests/adapter.test.ts, tests/buyer.test.ts, tests/support/buyer-harness.ts.

## Decisions
- Gemini: Interactions API (`POST {GEMINI_BASE_URL}/interactions`, `x-goog-api-key`, `generation_config.thinking_level: "medium"`, `previous_interaction_id`, tools resent each turn) via plain fetch, no new dependency. Covers patch 1's API choice without waiting for `@google/genai`. Docs cited in agent/gemini.ts. Unverified against the live API: whether `function_result` needs `call_id` (examples use it; reference lists name/result only). Swap to the SDK later is one file.
- The adapter child gets only PATH and SPEND_ORIGIN; the Gemini key never reaches it. Gemini errors print `gemini_http_<status>` only.
- Unknown tool from the model: blocked in the buyer (no adapter call) and answered `tool_not_allowed`; the adapter itself also returns `unknown_tool`.
- Events: `list` (agent), `order_created` (merchant), `pay_requested` (agent, when pay_order is called), `settled` (chain), `refused` (vault if the code is a signer code, else spend; spend-side rule errors on pay_order also log `refused` by spend), `pending` (spend). settled/refused once per order. Written live to runs/<ISO stamp>/events.jsonl and runs/latest/events.jsonl, plus transcript.txt. `RUNS_DIR` overrides.

## For Codex
- package.json scripts please: `"buyer": "node agent/buyer.ts"`, `"buyer:scripted": "node agent/buyer.ts --scripted"`. Consider `runs/*/` in .gitignore except runs/latest.
- tsconfig: add `agent/**/*.ts` to include.
- events.schema.json: conform to the field list above; tell me if actor for `list` should differ.

## Robert runs (Gate D)
Env names only; start merchant and spend yourself as in the v4 plan (MERCHANT_PAYTO, RPC_URL; spend env plus MAX_AMOUNT=10000000, then back to 5000000).
1. Fallback first, no model: `SPEND_ORIGIN=http://127.0.0.1:4001 node agent/buyer.ts --scripted`
2. Gemini: `read -s GEMINI_API_KEY; export GEMINI_API_KEY GEMINI_MODEL=<argon id>; node agent/buyer.ts` (optional GEMINI_BASE_URL; optional task text as args).
Expect: `vault  <- settled 1.50 USDC https://sepolia.basescan.org/tx/...` then `vault  <- refused rule_amount: over the per-payment limit set in the vault`. Exit 0 done, 3 turn limit, 1 error. Log: runs/latest/events.jsonl.
Note: merchant.sqlite keeps the old `demo` product (INSERT OR IGNORE); harmless, it shows in list_products. Use a fresh MERCHANT_DB_PATH if you want only the two items.
