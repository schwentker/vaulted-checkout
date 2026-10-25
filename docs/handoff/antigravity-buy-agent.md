# Vaulted Checkout: buy agent build (Antigravity prompts)

2026-10-25. Repo: /Users/andres/dev/vaulted-checkout. Copy also at docs/handoff/antigravity-buy-agent.md in the repo.

## Where things stand

- Done: merchant + spend-service (phase 2), signer Reactor (phase 3), Gate B (real 1.5 USDC settle, duplicate pay idempotent).
- Not done: phase 4 fault injection (Codex), MCP adapter (packages/mcp-adapter is a placeholder), any agent that buys.
- Uncommitted: all phase 3 work sits untracked on `claude/phase-3`. Commit before Antigravity touches the repo.
- Spend-service HTTP API (127.0.0.1:4001): `GET /products`, `POST /orders {items}`, `GET /orders/:id`, `POST /pay {orderId}`. Already sanitized (`service.public()`).
- Reactor hard cap: `MAX_AMOUNT=5000000` (5 USDC), fixed in BT config. Spend cap comes from env `MAX_AMOUNT` (default same).

## Recommendation

Build the buyer side in 3 Antigravity phases, Codex phase 4 in parallel on its own branch:

1. **AG-1 MCP adapter** (4 tools, stdio, pinned spend origin). Unblocks every client: Claude Code, Gemini CLI, Antigravity itself.
2. **AG-2 demo catalog + two-outcome test**: a 1.50 USDC paper settles; a 7.50 USDC dataset is refused **by the vault** (`rule_amount`), not just by the spend service. This is the answer for Hallie.
3. **AG-3 Gemini buyer**: small CLI agent (Gemini REST via fetch, no new deps) that spawns the adapter over MCP and narrates its tool calls. Plus `--scripted` fallback that calls the same tools without an LLM, for stage safety.
4. **Gate D (Robert)**: live run on Base Sepolia, record.

How the vault refusal works honestly: run spend with a looser cap (`MAX_AMOUNT=10000000`) than the Reactor (5 USDC). Story line: "the policy service was misconfigured (or compromised); the vault still said no." The agent can ask, only the vault can sign.

Optional second refusal: unlisted payee. Skip unless time allows.

## Before you start (Robert, no AI)

1. `git add -A && git commit -m "Phase 3 signer + Gate B evidence"` on `claude/phase-3` (check `git status` first: no `.env`, no sqlite, no mp3 you do not want tracked; add `vo/ *.mp3` to .gitignore if needed).
2. `git switch -c ag/buy-agent`.
3. Antigravity settings: terminal auto-execution OFF (review each command). If there is an option to block agent access to gitignored files, turn it on. Otherwise move `.env` out of the repo folder while Antigravity runs.
4. Model: strongest Gemini available, high thinking, for AG-1 and AG-3. AG-2 can run at default.
5. Codex phase 4 (docs/handoff/phase-4-prompt.md) can run at the same time on `codex/phase-4`. It touches spend-service internals; Antigravity stays out of those files.

---

## AG-1 prompt: MCP adapter

```
You are building phase AG-1 of Vaulted Checkout. Read in order, and follow strictly: AGENTS.md, SPEC.md, contracts/README.md, contracts/schemas/audit-event.schema.json, packages/spend-service/src/server.ts, packages/spend-service/src/service.ts (method public()), packages/mcp-adapter/README.md, tests/support/fixtures.ts.

Hard rules (from AGENTS.md, repeated because they matter):
- Never open, print or search .env files or any key. Never run anything in runbooks/ or scripts/start-*.ts.
- No new dependencies. @modelcontextprotocol/sdk@1.32.2 is already pinned. If you think you need another package, stop and write it in the handoff.
- No em dashes in any file.
- Do not edit packages/spend-service, packages/merchant, packages/shared, reactors/, contracts/. Codex is working there in parallel.
- Branch: ag/buy-agent. Commit locally when tests pass. Do not push.

Build packages/mcp-adapter/src/server.ts: an MCP server over stdio with exactly four tools that call the spend-service HTTP API.
- Spend origin: env SPEND_ORIGIN, default http://127.0.0.1:4001. Allow only http://127.0.0.1 or http://localhost origins. Never accept an origin, URL, payee, amount or header from tool arguments.
- list_products(): GET /products. Return id, name, price in USDC as a decimal string (6 decimals, converted from atomic with string math, never floats), currency.
- create_order(productId: string, quantity: integer 1..10): POST /orders {items:[{productId,quantity}]}. Return orderId, items, total (decimal USDC), status.
- pay_order(orderId: string): POST /pay {orderId}. Return one of:
  - settled: orderId, amount, txHash, explorer link https://sepolia.basescan.org/tx/<hash>
  - refused: orderId, code (e.g. rule_amount, rule_payto), and a one-line human reason from a fixed map (rule_amount = "over the per-payment limit set in the vault", rule_payto = "payee not on the vault allowlist", others = "refused by payment policy").
  - pending: orderId, state (signing, sign_unknown, submitted, settlement_unknown), hint "call get_order to check".
  - error: stable code from the spend-service JSON {code}, no stack traces.
- get_order(orderId: string): GET /orders/:id. Return the same shapes as pay_order plus order status.
- Validate ids with the same pattern spend-service uses (see shared/src/wire.ts id()). Reject anything else before any HTTP call.
- Output allowlist: only the fields above. Build every tool result from an explicit allowlist object; never spread or forward a spend-service response. Never output intent, intent_mac, nonce, signature, payment_header, PAYMENT-* headers, wallet token id.
- Timeouts: 30 s per request, bounded response size 64 KB (copy the boundedJson pattern from spend-service/src/clients.ts into the adapter, do not import from spend-service).
- Tool descriptions: plain, short, and say that payment rules are enforced outside the agent.
- Add npm script "mcp": "node packages/mcp-adapter/src/server.ts" only if package.json scripts need it; record the change in CHANGELOG.md.

Tests: tests/mcp-adapter.test.ts using node:test, run by `npm test`.
- Spin up merchant + spend-service in-process with harness() and MockSigner from tests/support/fixtures.ts, point the adapter at it, and drive it with the MCP SDK Client over an in-memory or stdio transport.
- Cases: list -> create -> pay settles; pay twice returns the same txHash; over-cap order returns refused rule_amount (use a spend rules override); unknown orderId; bad id rejected without HTTP; tool output never contains the strings intent_mac, signature, nonce, payment_header, 0x followed by 130 hex chars; origin env set to a non-local host fails at startup.

Acceptance: `npm test` green (all old tests still green, count before and after in the handoff). Then write docs/handoff/ag-1.md using docs/handoff/TEMPLATE.md: branch, commit, test counts, files changed, model + thinking level used, anything you skipped and why.
```

## AG-2 prompt: demo catalog + two-outcome test

```
You are building phase AG-2 of Vaulted Checkout. Read AGENTS.md, SPEC.md, docs/handoff/ag-1.md, scripts/start-merchant.ts, tests/signer-integration.test.ts. Same hard rules as AG-1 (no .env, no runbooks, no new deps, no em dashes, do not edit spend-service/merchant/shared/reactors/contracts, branch ag/buy-agent, commit locally, no push).

Goal: the demo shows one in-policy buy that settles and one off-policy buy that the vault (signer Reactor) refuses.

1. Catalog. In scripts/start-merchant.ts, seed these products in addition to the existing "demo" product (INSERT OR IGNORE already handles existing DBs):
   - id paper-tox-2026, name "Paper: early hepatotoxicity signals in kinase inhibitors (PDF)", unitAmount 1500000, USDC
   - id dataset-tox-full, name "Full assay dataset, 40k compounds (CSV)", unitAmount 7500000, USDC
   This file is operator-run; edit it, do not run it.
2. Test tests/demo-two-outcomes.test.ts using the real generated Reactor behind the local stand-in from tests/signer-integration.test.ts (reuse its LocalReactorSigner approach; extract to tests/support/ only if you can do it without changing the behavior of the existing test). Reactor config MAX_AMOUNT 5000000. Spend-service rules MAX_AMOUNT 10000000 (looser than the vault, on purpose). Drive everything through the AG-1 MCP adapter:
   - buy paper-tox-2026 x1 -> settled, txHash present.
   - buy dataset-tox-full x1 -> refused, code rule_amount, attempt failed_confirmed, Reactor was called exactly once for it, the token API was never read for it, no PAYMENT-SIGNATURE ever reached the merchant for that order, merchant order stays unpaid.
   - repeat pay on the refused order -> still refused, no second Reactor call that could sign.
3. Write docs/demo/two-outcomes.md: one paragraph on why the spend cap is set looser than the vault cap in the demo (simulates a misconfigured or compromised policy service; the vault rule still holds), and the exact env values an operator sets (names and non-secret values only: MAX_AMOUNT for spend = 10000000; Reactor MAX_AMOUNT stays 5000000).

Acceptance: `npm test` green, new test shows both outcomes. Handoff docs/handoff/ag-2.md (TEMPLATE.md format) with model used.
```

## AG-3 prompt: Gemini buyer agent

```
You are building phase AG-3 of Vaulted Checkout. Read AGENTS.md, SPEC.md, docs/handoff/ag-1.md, docs/handoff/ag-2.md, packages/mcp-adapter/src/server.ts. Same hard rules (no .env, no runbooks, no new deps, no em dashes, branch ag/buy-agent, commit locally, no push). Never print, log or echo GEMINI_API_KEY; never run the agent with a real key yourself.

Build agent/buyer.ts: a small research-assistant buying agent driven by Gemini.
- Model call: Gemini REST generateContent via global fetch (no SDK). Endpoint base from env GEMINI_BASE_URL (default https://generativelanguage.googleapis.com/v1beta), model from env GEMINI_MODEL (required, no default; fail with a clear message), key from env GEMINI_API_KEY sent as the x-goog-api-key header. Verify the current request and function-calling format (functionDeclarations, functionCall, functionResponse parts) against Google's official Gemini API docs before writing it; cite the doc URL in a code comment.
- Tools: start the AG-1 adapter as a child process with the MCP SDK StdioClientTransport, call listTools, convert each MCP tool's inputSchema to a Gemini functionDeclaration. Only these four tool names are allowed; refuse any other function name the model returns.
- Loop: max 10 model turns, then stop with "turn limit". Execute one function call at a time, return the tool result as the functionResponse.
- System prompt: "You are a research assistant for a small drug-discovery team. You buy research documents and datasets from an approved store using the tools given. You do not know the payment rules; they are enforced outside you. Report what you bought, the price, and the transaction link. If a payment is refused, say so plainly with the reason and do not retry with a different product or quantity unless the user asked."
- Task comes from argv (default: "Buy the hepatotoxicity paper. Then buy the full assay dataset.").
- Output for a screen recording: one line per step, plain text, e.g. `agent -> list_products`, `agent -> create_order paper-tox-2026 x1`, `vault  <- settled 1.50 USDC  https://sepolia.basescan.org/tx/...`, `vault  <- refused rule_amount: over the per-payment limit set in the vault`, then the model's final answer. No JSON dumps.
- Flag --scripted: no model at all; calls the same MCP tools in fixed order (list, create paper, pay, create dataset, pay) and prints the same step lines. This is the on-stage fallback.
- Add npm scripts "buyer": "node agent/buyer.ts" and "buyer:scripted": "node agent/buyer.ts --scripted"; record in CHANGELOG.md.

Tests: tests/buyer.test.ts with a local fake Gemini server (GEMINI_BASE_URL=http://127.0.0.1:<port>) that returns a fixed sequence of functionCall responses, against the in-process merchant + spend harness with MockSigner. Cases: happy path prints settled; over-cap prints refused rule_amount; model asks for an unknown tool -> refused, loop continues safely; turn limit; --scripted run matches expected lines; the fake server never receives anything matching a 0x+130 hex signature or the word intent_mac.

Also write .mcp.example.json (Claude Code / Gemini CLI style mcpServers entry for the adapter, command node, args packages/mcp-adapter/src/server.ts, env SPEND_ORIGIN only) so any MCP client can be the buyer.

Acceptance: `npm test` green. Handoff docs/handoff/ag-3.md with model used, and a "Robert runs" section listing exact commands for the live run (env var names only, no values).
```

## AG-4 prompt (optional): review pass before the live run

```
Review only, no code changes. Read AGENTS.md, SPEC.md, docs/handoff/ag-1.md..ag-3.md and the diff of ag/buy-agent against claude/phase-3. Look for: any path where a tool argument reaches a URL, payee, amount or header; any tool output that leaks intent_mac, signature, nonce, payment_header or a key; any log of GEMINI_API_KEY or request headers; any place the agent could loop on pay_order. Write docs/review/ag-review.md with file:line, severity, VERIFIED/UNVERIFIED. No em dashes.
```

Then have Claude (Opus, high) or Codex read ag-review.md and the diff before Gate D. Same cross-vendor rule as the plan.

---

## Gate D (Robert, live, ~20 min)

Terminals, each env set by you with `read -s` for secrets:

1. Merchant: `MERCHANT_PAYTO=<payee> RPC_URL=<rpc> node scripts/start-merchant.ts`
2. Spend: source your spend env (INTENT_HMAC_KEY, invoker key, signer id, WALLET_ADDRESS, MERCHANT_PAYTO), plus `MAX_AMOUNT=10000000`, then `node scripts/start-spend.ts`
3. Buyer: `read -s GEMINI_API_KEY; export GEMINI_API_KEY GEMINI_MODEL=<model id from AI Studio>; npm run buyer`

Pass: paper settles (new basescan tx, wallet down 1.50), dataset refused `rule_amount`, merchant order for the dataset stays unpaid. Save the terminal transcript to evidence/gate-d.txt (no keys). If Gemini flakes: `npm run buyer:scripted`.

Afterwards: set spend `MAX_AMOUNT` back to 5000000 so the layers agree again.
