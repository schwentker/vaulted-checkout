// Live check of the Gemini Interactions API function-calling round trip used by agent/gemini.ts.
// Robert runs this in his own terminal. No spend service, no merchant, no payments.
// Env: GEMINI_API_KEY (required, never printed), GEMINI_MODEL (required), GEMINI_BASE_URL (optional).
// Pass: turn 1 returns a function_call with an id; turn 2 accepts our function_result (with call_id)
// and answers with the price we returned. On failure it probes once without call_id to show which shape the API wants.
import { GeminiInteractions } from '../agent/gemini.ts';

const env=process.env;
const key=env.GEMINI_API_KEY??'';
if(!key||!env.GEMINI_MODEL) { console.error('set GEMINI_API_KEY and GEMINI_MODEL'); process.exit(1); }
const base=(env.GEMINI_BASE_URL??'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/,'');
const redact=(s:string)=>s.split(key).join('<key>').slice(0,300);
const TOOL={name:'lookup_price',description:'Look up the price of a catalog item in USDC.',inputSchema:{type:'object',properties:{productId:{type:'string'}},required:['productId'],additionalProperties:false}};
const SYSTEM='You answer questions about a catalog. Always use the lookup_price tool; never guess prices.';
const TASK='What does item paper-tox-2026 cost? Answer with the price.';
const PRICE='4.25';

async function probe(previous:string,call:{id:string;name:string}) {
  const body={model:env.GEMINI_MODEL,previous_interaction_id:previous,system_instruction:SYSTEM,generation_config:{thinking_level:'medium'},
    tools:[{type:'function',name:TOOL.name,description:TOOL.description,parameters:TOOL.inputSchema}],
    input:[{type:'function_result',name:call.name,result:[{type:'text',text:JSON.stringify({price:PRICE,currency:'USDC'})}]}]};
  const res=await fetch(`${base}/interactions`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify(body)});
  const text=await res.text();
  console.log(`probe without call_id: HTTP ${res.status} ${res.ok?'':redact(text)}`);
}

const m=new GeminiInteractions(env);
const t0=Date.now();
let turn;
try { turn=await m.start(SYSTEM,TASK,[TOOL]); }
catch(e) { console.log(`FAIL turn 1: ${redact((e as Error).message)}`); process.exit(2); }
const call=turn.calls[0];
console.log(`turn 1: ${turn.calls.length} function_call(s)${call?`, name=${call.name}, id=${call.id?'present':'MISSING'}, args=${JSON.stringify(call.args)}`:''} (${Date.now()-t0} ms)`);
if(!call||call.name!=='lookup_price') { console.log(`FAIL: expected a lookup_price call. Text: ${redact(turn.text)}`); process.exit(2); }
const firstId=m.previous!;
try {
  const t1=Date.now();
  const second=await m.reply([{call,result:{price:PRICE,currency:'USDC'}}]);
  console.log(`turn 2: ${second.calls.length} call(s), text: ${redact(second.text)} (${Date.now()-t1} ms)`);
  if(second.text.includes(PRICE)) { console.log('PASS: function_result with call_id accepted; agent/gemini.ts shape works.'); process.exit(0); }
  console.log('FAIL: model did not use the returned price.'); process.exit(2);
} catch(e) {
  console.log(`FAIL turn 2 with call_id: ${redact((e as Error).message)}`);
  await probe(firstId,call).catch(err=>console.log(`probe failed: ${redact(String(err?.message))}`));
  process.exit(2);
}
