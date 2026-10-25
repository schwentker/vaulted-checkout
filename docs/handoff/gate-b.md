# Gate B evidence (no keys, no token data)

Result: PASSED 2026-10-24 23:37Z.

- Signer Reactor: b548cf32-34d3-4a02-9201-17f9b78b59fb, active, node24, viem 2.57.11, permissions token:read + token:reveal
- Payee (MERCHANT_PAYTO): 0xc17a7A2A339a071D84B129AB0812a72c3A7cd758
- Payer (vaulted wallet): 0x1feD0f4EF284900B88966A05D0a8F5F6C39F0229
- Probe: 7/7 PASS on the first signer (607b75c0); BT passes res.statusCode through (400/401/403). Probe on b548cf32: run if not yet done.
- Refusal seen live: order ord_429bfdbc-7c9c-4fbe-90be-9323b2b587fa refused with rule_payto (spend pointed at a payee not on the Reactor allowlist); attempt failed_confirmed, no signature, no funds moved.
- Paid order: ord_99b70e93-7b65-4edd-a97f-8464c86f2b0d, attempt a8b2de9f-1f55-4c4c-b955-3d806dd0cc29, 1.5 USDC
- Tx: https://sepolia.basescan.org/tx/0xd026fed37c35078edc3254ef5aa7b7c52af4492b77ae777ccdfb7a226e07fb5a
- Duplicate pay: same tx returned, order paid / settled, no second transfer
- Wallet balance after: expected 18.5 USDC (confirm)
- vc-invoker key rotated: (Robert confirm)
- vc-key-provisioner deleted: (Robert confirm)
- Retired Reactor 607b75c0-03b6-4282-bfe8-b0745c5c7346: allowlist is a public test address; delete
- Problems seen: placeholder and truncated payee pastes; two signer deploys; see runbooks/gate-b.md troubleshooting
