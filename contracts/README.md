# Contracts v1.1

| File | What |
|---|---|
| intent.md | Intent envelope, canonical form, MAC |
| state-machine.md | Attempt states, transitions, recovery |
| schemas/intent.schema.json | Intent envelope |
| schemas/signer-request.schema.json | Body sent to `POST /reactors/{id}/react` (becomes `event.req`) |
| schemas/signer-response.schema.json | Reactor `res.body` |
| schemas/attempt.schema.json | spend-service attempt row |
| schemas/audit-event.schema.json | Only fields allowed in logs and the audit view |
| fixtures/golden-attempt.json | One full attempt: intent, MAC, typed data, signature, x402 v2 headers. Generated, do not hand edit |
| fixtures/gen-golden.mjs | Regenerates the golden file. Uses PUBLIC test keys only |

Wire protocol: x402 v2 as implemented by `@x402/core@2.28.0` + `@x402/evm@2.28.0` (exact scheme, EIP-3009). Header encoding = base64(JSON) via `encodePaymentSignatureHeader` from `@x402/core/http`. spend-service owns encoding; the Reactor returns only a signature.

Amounts: decimal strings of atomic units (USDC 6 decimals). Never floats.
Addresses: EIP-55 checksummed in typed data; compare case-insensitively elsewhere.
Times: unix seconds as decimal strings.
