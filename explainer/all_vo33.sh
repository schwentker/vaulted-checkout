#!/usr/bin/env bash
# One-shot: writes the two scripts here, makes the clips, joins them.
# Run from /Users/andres/dev/vaulted-checkout (where .env lives):  bash all_vo33.sh
set -euo pipefail
cat > make_vo.mjs <<'JSEOF'
// Generates one mp3 per beat with ElevenLabs. Reads the key from ./.env, never prints it.
// Usage (in /Users/andres/dev/vaulted-checkout):  node make_vo.mjs [maxSeconds]
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n")
    .map((l) => l.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const keyName = Object.keys(env).find((k) => /ELEVEN|XI_API/i.test(k) && /KEY/i.test(k));
if (!keyName) { console.error("No ElevenLabs key variable found in .env"); process.exit(1); }
const KEY = env[keyName];
const VOICE = env.ELEVENLABS_VOICE_ID || "bGaO5vdJcnB4WojYqfuK";
const MODEL = "eleven_multilingual_v2";
const MAX = Number(process.argv[2] || 1e9);

const BEATS = [{"id":"s0title_01","start":0,"len":1.44,"text":"A buyer needs something."},{"id":"s0title_02","start":1.44,"len":1.44,"text":"An agent buys it,"},{"id":"s0title_03","start":2.88,"len":1.2,"text":"in testnet USDC."},{"id":"s0title_04","start":4.08,"len":1.92,"text":"The key stays in the vault."},{"id":"s1cast_01","start":6,"len":0.987,"text":"A buyer."},{"id":"s1cast_02","start":6.987,"len":1.974,"text":"Its agent shops, but isn't trusted."},{"id":"s1cast_03","start":8.961,"len":1.481,"text":"A spend service decides."},{"id":"s1cast_04","start":10.442,"len":2.221,"text":"The agent reaches it through fixed tools."},{"id":"s1cast_05","start":12.662,"len":1.234,"text":"It checks policy,"},{"id":"s1cast_06","start":13.896,"len":1.234,"text":"keeps a ledger,"},{"id":"s1cast_07","start":15.13,"len":1.727,"text":"and seals what it approves."},{"id":"s1cast_08","start":16.857,"len":0.987,"text":"Basis Theory."},{"id":"s1cast_09","start":17.844,"len":1.727,"text":"A signer with fixed rules,"},{"id":"s1cast_10","start":19.571,"len":1.974,"text":"and a vault holding the key."},{"id":"s1cast_11","start":21.545,"len":1.727,"text":"Across the line, the merchant,"},{"id":"s1cast_12","start":23.273,"len":1.727,"text":"a facilitator, and the chain."},{"id":"s2order_01","start":25,"len":1.867,"text":"The agent orders the item."},{"id":"s2order_02","start":26.867,"len":1.867,"text":"The merchant fixes the price."},{"id":"s2order_03","start":28.733,"len":1.867,"text":"The agent asks to pay."},{"id":"s2order_04","start":30.6,"len":2.4,"text":"402: pay 1.5 USDC to this address."}];

mkdirSync("vo", { recursive: true });
for (const b of BEATS.filter((x) => x.start < MAX)) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text: b.text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 } }),
  });
  if (!r.ok) { console.error(b.id, r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  writeFileSync(`vo/${b.id}.mp3`, Buffer.from(await r.arrayBuffer()));
  console.log("ok", b.id);
}

JSEOF
node make_vo.mjs 33
ffmpeg -y -i vo/s0title_01.mp3 -i vo/s0title_02.mp3 -i vo/s0title_03.mp3 -i vo/s0title_04.mp3 -i vo/s1cast_01.mp3 -i vo/s1cast_02.mp3 -i vo/s1cast_03.mp3 -i vo/s1cast_04.mp3 -i vo/s1cast_05.mp3 -i vo/s1cast_06.mp3 -i vo/s1cast_07.mp3 -i vo/s1cast_08.mp3 -i vo/s1cast_09.mp3 -i vo/s1cast_10.mp3 -i vo/s1cast_11.mp3 -i vo/s1cast_12.mp3 -i vo/s2order_01.mp3 -i vo/s2order_02.mp3 -i vo/s2order_03.mp3 -i vo/s2order_04.mp3 \
  -filter_complex "[0:a]adelay=0|0[a0];[1:a]adelay=1440|1440[a1];[2:a]adelay=2880|2880[a2];[3:a]adelay=4080|4080[a3];[4:a]adelay=6000|6000[a4];[5:a]adelay=6987|6987[a5];[6:a]adelay=8961|8961[a6];[7:a]adelay=10442|10442[a7];[8:a]adelay=12662|12662[a8];[9:a]adelay=13896|13896[a9];[10:a]adelay=15130|15130[a10];[11:a]adelay=16857|16857[a11];[12:a]adelay=17844|17844[a12];[13:a]adelay=19571|19571[a13];[14:a]adelay=21545|21545[a14];[15:a]adelay=23273|23273[a15];[16:a]adelay=25000|25000[a16];[17:a]adelay=26867|26867[a17];[18:a]adelay=28733|28733[a18];[19:a]adelay=30600|30600[a19];[a0][a1][a2][a3][a4][a5][a6][a7][a8][a9][a10][a11][a12][a13][a14][a15][a16][a17][a18][a19]amix=inputs=20:normalize=0:dropout_transition=0,apad,atrim=0:33[out]" \
  -map "[out]" -c:a libmp3lame -q:a 2 vo33.mp3
echo "wrote vo33.mp3"
