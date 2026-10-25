#!/usr/bin/env bash
# Gate A steps 5 and 6: give the smoke Reactor read+reveal access to the wallet token, wait for active,
# invoke vault mode as the invoker, and verify the signature recovers to the wallet address.
# Needs env: BT_MANAGEMENT_KEY, BT_INVOKER_KEY, SMOKE_ID. Reads token id + address from evidence/gate-a-provision.json.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${BT_API_BASE:-https://api.test.basistheory.com}"
case "$BASE" in *api.test.*) ;; *) echo "Refusing: not the test host"; exit 1;; esac
: "${BT_MANAGEMENT_KEY:?}" "${BT_INVOKER_KEY:?}" "${SMOKE_ID:?}"
PROV=$(sed -n '/^{/,/^}/p' evidence/gate-a-provision.json)
TID=$(echo "$PROV" | jq -r .token_id)
ADDR=$(echo "$PROV" | jq -r .address)

BODY=$(jq -n --arg tid "$TID" --arg addr "$ADDR" '{
  configuration: { WALLET_TOKEN_ID: $tid, EXPECTED_ADDRESS: $addr },
  runtime: { image: "node24", dependencies: { viem: "2.57.11" }, timeout: 30, permissions: ["token:read","token:reveal"] }
}')
curl -sS -X PATCH "$BASE/reactors/$SMOKE_ID" -H "BT-API-KEY: $BT_MANAGEMENT_KEY" -H "Content-Type: application/merge-patch+json" -d "$BODY" | jq '{state, permissions: .runtime.permissions}'

for i in $(seq 1 60); do
  STATE=$(curl -sS "$BASE/reactors/$SMOKE_ID" -H "BT-API-KEY: $BT_MANAGEMENT_KEY" | jq -r .state)
  echo "state: $STATE"
  [ "$STATE" = "active" ] && break
  [ "$STATE" = "failed" ] && { echo "update failed; paste the output of the GET to Claude"; exit 1; }
  sleep 5
done

echo "--- vault invoke"
curl -sS -X POST "$BASE/reactors/$SMOKE_ID/react" -H "BT-API-KEY: $BT_INVOKER_KEY" -H "Content-Type: application/json" -d '{"mode":"vault"}' | tee evidence/gate-a-vault.json | jq '{ok, mode, address, ms, code, status}'
echo "--- verify"
(cd runbooks && node verify-signature.mjs ../evidence/gate-a-vault.json)
echo "--- negative: invoker must NOT read the token (expect 401 or 403)"
curl -sS -o /dev/null -w "%{http_code}\n" "$BASE/tokens/$TID" -H "BT-API-KEY: $BT_INVOKER_KEY" | tee evidence/gate-a-neg-invoker.txt
echo "Wallet address to fund (Circle faucet, Base Sepolia USDC): $ADDR"
