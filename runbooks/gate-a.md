# Gate A runbook (Robert only, about 1 hour)

Goal: prove this test tenant can (1) deploy a node24 Reactor with viem 2.57.11 and run it, (2) let that Reactor retrieve a vaulted wallet key with runtime `token:read` + `token:reveal`, while the invoker app cannot. If step 4 fails, stop and send me the sanitized error. Do not weaken checks.

Rules: use a separate terminal ("operator shell"). No AI agent runs in it. Paste keys only via `read -s`. Never paste a key into chat, a file, or a commit.

## 0. Prep (operator shell)
```
cd ~/dev/vaulted-checkout
npm i -g @basis-theory-labs/cli@5.0.0
(cd runbooks && npm i)            # viem for local scripts
(cd reactors/smoke && npm i && node local-test.mjs)   # expect: smoke local test PASS
export BT_API_BASE=https://api.test.basistheory.com
mkdir -p evidence
```

## 1. Applications (portal, test tenant "sblai Test")
| Name | Type | Permissions |
|---|---|---|
| vc-management | Management | application:create, application:read, application:update, reactor:create, reactor:read, reactor:update |
| vc-invoker | Private | reactor:invoke |

```
read -s BT_MANAGEMENT_KEY; export BT_MANAGEMENT_KEY
read -s BT_INVOKER_KEY;    export BT_INVOKER_KEY
```

## 2. Deploy smoke Reactor (no permissions, no config yet)
REST (explicit test host, no CLI flag guessing):
```
CODE=$(jq -Rs . < reactors/smoke/reactor.js)
curl -sS "$BT_API_BASE/reactors" -H "BT-API-KEY: $BT_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d "{\"name\":\"vc-smoke\",\"code\":$CODE,\"runtime\":{\"image\":\"node24\",\"dependencies\":{\"viem\":\"2.57.11\"},\"timeout\":30,\"permissions\":[]}}" \
  | jq '{id, state, runtime: .runtime.image}' | tee evidence/gate-a-create.json
export SMOKE_ID=$(jq -r .id evidence/gate-a-create.json)
# poll until state is "active" (or "failed": then save .requested / error_code and stop)
curl -sS "$BT_API_BASE/reactors/$SMOKE_ID" -H "BT-API-KEY: $BT_MANAGEMENT_KEY" | jq '{state, requested}'
```
(CLI alternative: `bt reactors create --help`; confirm it targets the test host before using.)

## 3. Invoke selftest twice (cold, then warm)
```
for i in 1 2; do /usr/bin/time -p curl -sS -X POST "$BT_API_BASE/reactors/$SMOKE_ID/react" \
  -H "BT-API-KEY: $BT_INVOKER_KEY" -H "Content-Type: application/json" -d '{"mode":"selftest"}'; echo; done 2>&1 | tee evidence/gate-a-selftest.txt
```
Pass: both return `{"ok":true,"mode":"selftest",...}`. Note `real` seconds for cold and warm.

## 4. Provision the wallet key (once)
Portal: create `vc-key-provisioner`, Private, permission `token:create` only.
```
read -s BT_PROVISIONER_KEY; export BT_PROVISIONER_KEY
(cd runbooks && node provision-key.mjs) | tee evidence/gate-a-provision.json   # prints token_id + address only
```
Portal: DELETE `vc-key-provisioner`. Then `unset BT_PROVISIONER_KEY`.

## 5. Give the Reactor key access
```
export WALLET_TOKEN_ID=$(jq -r .token_id evidence/gate-a-provision.json)
export WALLET_ADDRESS=$(jq -r .address evidence/gate-a-provision.json)
curl -sS -X PATCH "$BT_API_BASE/reactors/$SMOKE_ID" -H "BT-API-KEY: $BT_MANAGEMENT_KEY" -H "Content-Type: application/merge-patch+json" \
  -d "{\"configuration\":{\"WALLET_TOKEN_ID\":\"$WALLET_TOKEN_ID\",\"EXPECTED_ADDRESS\":\"$WALLET_ADDRESS\"},\"runtime\":{\"image\":\"node24\",\"dependencies\":{\"viem\":\"2.57.11\"},\"timeout\":30,\"permissions\":[\"token:read\",\"token:reveal\"]}}" | jq '{state}'
# poll until active again
```

## 6. Invoke vault mode and verify
```
curl -sS -X POST "$BT_API_BASE/reactors/$SMOKE_ID/react" -H "BT-API-KEY: $BT_INVOKER_KEY" \
  -H "Content-Type: application/json" -d '{"mode":"vault"}' | tee evidence/gate-a-vault.json
(cd runbooks && node verify-signature.mjs ../evidence/gate-a-vault.json)   # expect match: true
```
The signed message is expired (validBefore=1) and zero value, so sharing the signature is safe.

## 7. Negative checks
```
# invoker must NOT read the token (expect 401/403)
curl -sS -o /dev/null -w "%{http_code}\n" "$BT_API_BASE/tokens/$WALLET_TOKEN_ID" -H "BT-API-KEY: $BT_INVOKER_KEY" | tee evidence/gate-a-neg-invoker.txt
# deleted provisioner key must fail (wait 60 s after deleting; BT caches permissions ~30 s). Skip if you already unset it.
```

## 8. Fund the wallet
Circle faucet (https://faucet.circle.com), Base Sepolia, USDC, to `$WALLET_ADDRESS`. The payer needs no ETH: the facilitator submits the EIP-3009 transfer.

## 9. Evidence to send back (sanitized)
Fill `docs/handoff/gate-a.md`: Reactor id, final state, image, viem version, selftest ok (cold/warm seconds), vault ok + verify match, wallet address, token id (an id, not data), invoker GET token status code, provisioner deleted (time), faucet tx or balance. Then `unset BT_MANAGEMENT_KEY BT_INVOKER_KEY` when done for the session.

## If something fails
| Symptom | Likely cause | Send me |
|---|---|---|
| state `failed`, error_code `vulnerabilities_detected` | viem dependency CVE | `requested.error_details.vulnerabilities` |
| state `failed`, `restricted_operation` | blocked module | error text |
| 422 `ReactorSandboxError` on invoke | restricted call | error title |
| vault: `key_unavailable`, status `masked_or_bad_format` | reveal not applied; token returned masked | status code only |
| vault: `key_unavailable`, status 403 | runtime permissions missing | status code |
| event.req empty (bad_request on valid body) | handler shape mismatch | full response body |
