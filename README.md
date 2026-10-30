# Vaulted Checkout

**Give an AI agent permission to pay without giving it the wallet key.**

Vaulted Checkout is an experimental agent-payment architecture using Gemini, MCP, Basis Theory, x402 v2 and USDC on Base Sepolia. The agent can shop and request payment without receiving the wallet private key. The spend service creates an HMAC-authenticated intent; trusted Basis Theory Reactor code verifies that intent and fixed policy before retrieving the vaulted key and signing an EIP-3009 authorization.

▶ [Watch the 107-second explainer](https://sandboxlabs.ai/vaulted-checkout-explainer/)

## Payment architecture

```text
Gemini agent
    | MCP
    v
Spend service -- intent + HMAC --> Basis Theory Reactor
                                      | verify HMAC and fixed policy
                                      | retrieve vaulted private key
                                      | sign EIP-3009 authorization
                                      v
                                  Merchant / x402 v2
                                      | submit for settlement
                                      v
                                  Base Sepolia USDC
```

1. The agent requests payment through a four-tool MCP adapter.
2. The spend service constructs a structured payment intent and authenticates it with HMAC-SHA256.
3. Trusted Node Reactor code verifies the HMAC and checks the intent against fixed policy: approved payee, per-payment cap, expected chain, asset and wallet, validity window, nonces and policy version.
4. After those checks pass, the Reactor retrieves the private key from the Basis Theory vault and signs an EIP-3009 `transferWithAuthorization` authorization.
5. The merchant submits the authorization for settlement. The order is marked paid only after settlement is confirmed.

**The vault stores the credential. Trusted Reactor code enforces signing policy and performs signing.** The Reactor's checks are independent of the spend service's upstream decision to permit a request.

## Trust boundaries

- **HMAC authenticates the intent, not human consent.** It establishes message integrity and possession of the shared secret; it does not prove that a human approved the purchase. A party holding that secret can authenticate intents, which must still pass Reactor policy.
- **This is not HSM or non-exportable signing.** Trusted Reactor code retrieves and can access the private key to sign. The design keeps the key outside the agent and spend service, but depends on trusted Reactor code, configuration and credential access controls.
- **Policy is bounded.** The payee allowlist and per-payment cap are not cumulative budgets, delegated-authority management or approval workflows.
- **The adapter limits agent-visible data.** It returns allowlisted fields only, excluding intents, MACs, nonces, signatures and payment headers.

## Recorded evidence

| Case | Observed result |
| --- | --- |
| Disallowed payee | An earlier payment attempt was refused by Reactor policy with `rule_payto`. |
| Independent amount check | A **7.5 USDC** request passed the spend service's **10 USDC** cap but exceeded the Reactor's **5 USDC** cap; the Reactor refused to sign with `rule_amount`. |
| Successful payment | **1.5 USDC** settled on Base Sepolia. |
| Settlement and idempotency | Paid status followed confirmed settlement; repeating the payment operation returned the same receipt and settled once. |

Settlement transaction: [0xd026fed37c35078edc3254ef5aa7b7c52af4492b77ae777ccdfb7a226e07fb5a](https://sepolia.basescan.org/tx/0xd026fed37c35078edc3254ef5aa7b7c52af4492b77ae777ccdfb7a226e07fb5a).

See [recorded Gate B events](fixtures/events-gate-b.jsonl) and the [Gate B handoff](docs/handoff/gate-b.md) for the settlement and earlier payee refusal. These observations demonstrate the tested paths, not general protection against arbitrary malicious Reactor code or every retry failure mode.

## Protocol scope

The merchant uses **x402 v2** payment headers on **`eip155:84532`** (Base Sepolia), with EIP-3009 payment authorizations. Its fixed adapter profile is based on the consortium v0.1.0 draft (manifest, products, orders and pay), with intentional differences. **No full x402 or consortium-profile conformance is claimed.** See [CHANGELOG.md](CHANGELOG.md) and the merchant package.

This is a testnet architecture prototype, not a production wallet or a mainnet payment deployment. Operators supply credentials at runtime; keep wallet keys, Basis Theory credentials and HMAC secrets out of the repository, logs and AI sessions.

## Repository and checks

- `packages/merchant`, `packages/spend-service`, `packages/shared`, `packages/mcp-adapter`: merchant, intent creation, shared wire code and MCP adapter.
- `agent/`: Gemini buyer using Interactions API function calling.
- `reactors/signer`: trusted Basis Theory Reactor signer and policy checks.
- `contracts/`: payment and event schemas, golden fixtures.
- `docs/handoff/`, `docs/review/`: implementation evidence and reviews.

Run the checks without payment credentials:

```sh
npm ci
npm test
```

## License

MIT. See [LICENSE](LICENSE).
