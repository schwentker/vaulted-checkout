#!/usr/bin/env bash
# Gate B step 2: create the signer Reactor (vc-signer) on the TEST tenant with its fixed rules, wait until active.
# Needs env: BT_MANAGEMENT_KEY, INTENT_HMAC_KEY, MERCHANT_PAYTO. Reads wallet token id + address from evidence/gate-a-provision.json.
# Prints ids and state only. Secrets go to curl on stdin, never on a command line or into a file.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${BT_API_BASE:-https://api.test.basistheory.com}"
case "$BASE" in https://api.test.basistheory.com) ;; *) echo "Refusing: not the test host"; exit 1;; esac
: "${BT_MANAGEMENT_KEY:?set BT_MANAGEMENT_KEY first}" "${INTENT_HMAC_KEY:?source your spend.env first}" "${MERCHANT_PAYTO:?export MERCHANT_PAYTO=0x... first}"
command -v jq >/dev/null || { echo "install jq: brew install jq"; exit 1; }
[[ "$MERCHANT_PAYTO" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "MERCHANT_PAYTO is not a 0x address"; exit 1; }
[ "${#INTENT_HMAC_KEY}" -ge 32 ] || { echo "INTENT_HMAC_KEY is shorter than 32 characters"; exit 1; }

node scripts/build-signer.mjs --check
node reactors/signer/test.mjs >/dev/null && echo "signer local tests PASS"

PROV=$(sed -n '/^{/,/^}/p' evidence/gate-a-provision.json)
TID=$(echo "$PROV" | jq -r .token_id)
ADDR=$(echo "$PROV" | jq -r .address)
[[ "$ADDR" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "no wallet address in evidence/gate-a-provision.json"; exit 1; }
[ "$(echo "$MERCHANT_PAYTO" | tr 'A-F' 'a-f')" != "$(echo "$ADDR" | tr 'A-F' 'a-f')" ] || { echo "MERCHANT_PAYTO must not be the vaulted wallet"; exit 1; }
mkdir -p evidence

# Must match the rules in scripts/start-spend.ts exactly (AUDIENCE, POLICY_VERSION, MAX_AMOUNT, MAX_WINDOW_SECONDS).
RESP=$(jq -n --rawfile code reactors/signer/reactor.js --arg tid "$TID" --arg addr "$ADDR" --arg payto "$MERCHANT_PAYTO" \
  --arg mac "$INTENT_HMAC_KEY" '{
  name: "vc-signer", code: $code,
  configuration: {
    INTENT_HMAC_KEY: $mac, WALLET_TOKEN_ID: $tid, WALLET_ADDRESS: $addr, PAYTO_ALLOWLIST: $payto,
    AUDIENCE: "vc-signer", CHAIN_ID: "84532", ASSET: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    DOMAIN_NAME: "USDC", DOMAIN_VERSION: "2", POLICY_VERSION: "p1", MAX_AMOUNT: "5000000", MAX_WINDOW_SECONDS: "600"
  },
  runtime: { image: "node24", dependencies: { viem: "2.57.11" }, timeout: 30, permissions: ["token:read", "token:reveal"] }
}' | curl -sS "$BASE/reactors" -H "BT-API-KEY: $BT_MANAGEMENT_KEY" -H "Content-Type: application/json" --data-binary @-)
echo "$RESP" | jq '{id, state, image: .runtime.image, permissions: .runtime.permissions}' | tee evidence/gate-b-create.json
ID=$(echo "$RESP" | jq -r .id)
[ "$ID" != "null" ] || { echo "$RESP" | jq '{title, status, detail, errors: (.errors // {} | keys)}'; echo "create failed: send Claude the lines above (field names only, no values)"; exit 1; }
unset RESP

for i in $(seq 1 60); do
  STATE=$(curl -sS "$BASE/reactors/$ID" -H "BT-API-KEY: $BT_MANAGEMENT_KEY" | jq -r .state)
  echo "state: $STATE"
  [ "$STATE" = "active" ] && { echo "SIGNER_ID=$ID" | tee evidence/signer-id.env; echo "Next: export SIGNER_ID=$ID"; exit 0; }
  [ "$STATE" = "failed" ] && { echo "Reactor failed to build; send Claude: curl -sS \$BT_API_BASE/reactors/$ID -H \"BT-API-KEY: \$BT_MANAGEMENT_KEY\" | jq '{state, requested, error_code}'"; exit 1; }
  sleep 5
done
echo "still not active after 300 s; run this script's poll again later with SIGNER_ID=$ID"; exit 1
