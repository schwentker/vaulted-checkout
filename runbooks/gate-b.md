# Gate B runbook (Robert only)

Status: PASSED 2026-10-24 23:37Z. Rerun this file for rehearsals (Gate C) or after any change.

## Constants (edit here, then copy to runbooks/gate-b.env)

| Name | Value | What it is |
|---|---|---|
| BT_API_BASE | https://api.test.basistheory.com | Basis Theory test tenant |
| SIGNER_ID / BT_SIGNER_REACTOR_ID | b548cf32-34d3-4a02-9201-17f9b78b59fb | vc-signer Reactor |
| WALLET_TOKEN_ID | d474d0c3-7c3c-40dd-aec9-98ed68e8c5f3 | vaulted wallet key token (id only) |
| WALLET_ADDRESS | 0x1feD0f4EF284900B88966A05D0a8F5F6C39F0229 | vaulted wallet, payer |
| MERCHANT_PAYTO | 0xc17a7A2A339a071D84B129AB0812a72c3A7cd758 | merchant payee, must equal the Reactor allowlist |
| USDC_ADDRESS | 0x036CbD53842c5426634e7929541eC2318f3dCF7e | Base Sepolia USDC |
| CHAIN_ID | 84532 | Base Sepolia |
| MERCHANT_ORIGIN | http://127.0.0.1:4000 | local merchant |
| SPEND_URL | http://127.0.0.1:4001 | local spend service |
| retired | 607b75c0-03b6-4282-bfe8-b0745c5c7346 | old signer, pays a public test address: delete |

Every terminal starts with:
```
cd ~/dev/vaulted-checkout && source runbooks/gate-b.env
```
Check: `echo ${#MERCHANT_PAYTO}` prints 42.

Secrets never go in that file. `INTENT_HMAC_KEY` lives in `~/.config/vaulted-checkout/spend.env`. BT keys are entered with `read -s`, one line at a time.

If you change MERCHANT_PAYTO: redeploy the signer (step 2), put the new SIGNER_ID in gate-b.env, and probe again (step 3).

## 0. Checks
```
npm test && npm run typecheck
node scripts/build-signer.mjs --check && node reactors/signer/test.mjs
```

## 1. Secrets (once; skip if spend.env exists)
```
mkdir -p ~/.config/vaulted-checkout && chmod 700 ~/.config/vaulted-checkout
( umask 077; printf 'export INTENT_HMAC_KEY=%s\n' "$(openssl rand -hex 32)" > ~/.config/vaulted-checkout/spend.env )
```
Never rerun it after a deploy: a new key will not match the Reactor.

## 2. Deploy the signer (only when payee or signer code changes)
```
source ~/.config/vaulted-checkout/spend.env
read -s BT_MANAGEMENT_KEY; export BT_MANAGEMENT_KEY
./runbooks/deploy-signer.sh        # copy the printed SIGNER_ID into gate-b.env
curl -sS $BT_API_BASE/reactors/$SIGNER_ID -H "BT-API-KEY: $BT_MANAGEMENT_KEY" | jq '{state, permissions: .runtime.permissions, payto: .configuration.PAYTO_ALLOWLIST}'
unset BT_MANAGEMENT_KEY
```
Pass: `active`, `["token:read","token:reveal"]`, payto equals MERCHANT_PAYTO.

## 3. Probe (cannot move funds)
```
source ~/.config/vaulted-checkout/spend.env
read -s BT_INVOKER_KEY; export BT_INVOKER_KEY
(cd runbooks && node signer-probe.mjs)
```
Pass: 7 PASS lines.

## 4. Merchant (terminal 2, no secrets)
```
node scripts/start-merchant.ts      # runs silently; leave it
```

## 5. Spend service (terminal 3)
```
source ~/.config/vaulted-checkout/spend.env
read -s BT_INVOKER_KEY; export BT_INVOKER_KEY
node scripts/start-spend.ts         # runs silently; leave it
```

## 6. Buy (terminal 4)
```
ORDER=$(curl -sS -X POST $SPEND_URL/orders -H 'content-type: application/json' -d '{"items":[{"productId":"demo","quantity":1}]}' | jq -r .id); echo $ORDER
curl -sS -X POST $SPEND_URL/pay -H 'content-type: application/json' -d "{\"orderId\":\"$ORDER\"}" | tee evidence/gate-b-pay.json | jq .
```
Pass: `"state": "settled"` and a tx hash. Check `https://sepolia.basescan.org/tx/<hash>`: 1.5 USDC from WALLET_ADDRESS to MERCHANT_PAYTO.

## 7. Exactly once
```
curl -sS -X POST $SPEND_URL/pay -H 'content-type: application/json' -d "{\"orderId\":\"$ORDER\"}" | tee evidence/gate-b-dup.json | jq '{state, tx: .receipt.transaction}'
curl -sS $SPEND_URL/orders/$ORDER | jq '{status: .order.paymentStatus, state: .payment.state}' | tee evidence/gate-b-order.json
```
Pass: same tx, `paid` / `settled`, no new transfer.

## Troubleshooting seen in the first run
| Symptom | Cause | Fix |
|---|---|---|
| `MERCHANT_PAYTO is not a 0x address` | placeholder or cut-off paste | `source runbooks/gate-b.env`, check length 42 |
| merchant `bad_config` | MERCHANT_PAYTO not 42 characters | same |
| pay returns `failed_confirmed` + `rule_payto` | spend/merchant payee differs from Reactor allowlist | use the SIGNER_ID whose allowlist equals MERCHANT_PAYTO (step 2 curl) |
| GET reactor shows all null | SIGNER_ID or key not set in that terminal | source gate-b.env, redo `read -s` |
| start-*.ts prints nothing | normal, it is a server | use another terminal |
| not settled | facilitator or chain delay | do not make a new order; leave services running and send Claude evidence/gate-b-pay.json |

## After
Ctrl-C both services, `unset BT_MANAGEMENT_KEY BT_INVOKER_KEY`. Keep spend.env. Revoke vc-management after Gate C.
