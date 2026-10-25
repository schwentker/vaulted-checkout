#!/usr/bin/env bash
# Gate A step 2: deploy the smoke Reactor to the TEST tenant and wait until it is active.
# Needs: BT_MANAGEMENT_KEY in your environment (read -s BT_MANAGEMENT_KEY; export BT_MANAGEMENT_KEY), jq, curl.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${BT_API_BASE:-https://api.test.basistheory.com}"
case "$BASE" in *api.test.*) ;; *) echo "Refusing: not the test host"; exit 1;; esac
: "${BT_MANAGEMENT_KEY:?set BT_MANAGEMENT_KEY first}"
command -v jq >/dev/null || { echo "install jq: brew install jq"; exit 1; }
mkdir -p evidence

BODY=$(jq -n --rawfile code reactors/smoke/reactor.js '{
  name: "vc-smoke", code: $code,
  runtime: { image: "node24", dependencies: { viem: "2.57.11" }, timeout: 30, permissions: [] }
}')
curl -sS "$BASE/reactors" -H "BT-API-KEY: $BT_MANAGEMENT_KEY" -H "Content-Type: application/json" -d "$BODY" \
  | jq '{id, state, image: .runtime.image}' | tee evidence/gate-a-create.json
ID=$(jq -r .id evidence/gate-a-create.json)
[ "$ID" != "null" ] || { echo "create failed: see output above"; exit 1; }

for i in $(seq 1 30); do
  S=$(curl -sS "$BASE/reactors/$ID" -H "BT-API-KEY: $BT_MANAGEMENT_KEY")
  STATE=$(echo "$S" | jq -r .state)
  echo "state: $STATE"
  [ "$STATE" = "active" ] && { echo "SMOKE_ID=$ID" | tee evidence/smoke-id.env; echo "Next: export SMOKE_ID=$ID"; exit 0; }
  [ "$STATE" = "failed" ] && { echo "$S" | jq '{state, requested}' | tee evidence/gate-a-failed.json; exit 1; }
  sleep 5
done
echo "still not active after 150 s; check state again later"; exit 1
