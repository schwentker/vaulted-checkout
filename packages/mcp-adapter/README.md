# MCP adapter

stdio MCP server: `node packages/mcp-adapter/src/server.ts`. Env: `SPEND_ORIGIN` only (default `http://127.0.0.1:4001`; http on 127.0.0.1 or localhost, no path). No secrets.

Exactly 4 tools over the spend-service HTTP API: `list_products`, `create_order(productId, quantity 1..10)`, `pay_order(orderId)`, `get_order(orderId)`. Args are checked against fixed keys; ids use the wire.ts `id()` regex before any HTTP. 30 s timeout, 64 KB response cap.

Outputs (JSON text, built from allowlists):
- settled `{status, orderId, amount, txHash, explorer}` (amount is decimal USDC)
- refused `{status, orderId, code, reason}` (fixed reasons: rule_amount, rule_payto, else "refused by payment policy")
- pending `{status, orderId, state, hint}`
- error `{status:"error", code}` with `isError: true`
- list_products `{status:"ok", products:[{id,name,unitAmount,currency}]}`, create_order `{status:"created", orderId, amount, currency, paymentStatus, items:[{productId,quantity,unitAmount}]}`, get_order `{status:"order", ...same, payment?}`

Never output intent, intent_mac, nonce, signature, payment_header or PAYMENT-* headers.

All amounts in adapter output (amount, unitAmount) are decimal USDC strings, e.g. "1.50", not atomic units.
