// Buying agent for Vaulted Checkout. Talks to the store only through the MCP adapter (stdio, 4 tools).
// Usage: node agent/buyer.ts [--scripted] [task text]
// Env: SPEND_ORIGIN (passed to the adapter), GEMINI_MODEL, GEMINI_API_KEY, GEMINI_BASE_URL (model mode only), RUNS_DIR (default runs/).
import { appendFileSync,copyFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { GeminiInteractions,type FunctionCall,type Model,type ModelTurn,type ToolDecl } from './gemini.ts';

export const ALLOWED_TOOLS=['list_products','create_order','pay_order','get_order'];
export const MAX_TURNS=10;
export const DEFAULT_TASK='Buy the hepatotoxicity paper. Then buy the full assay dataset.';
export const SYSTEM_PROMPT=[
  'You are a research assistant for a small drug-discovery team.',
  'You buy papers and datasets from one approved store, using only the tools you are given.',
  'Payment rules are enforced outside you, in a vault you cannot see or change.',
  'For each purchase, report what you bought, the price in USDC, and the transaction link.',
  'If a payment is refused, say so plainly with the reason, and do not try to work around it: no new orders, no smaller quantities, no other products to get the same thing.',
].join(' ');
export const SCRIPT:{name:string;args:(s:Record<string,string>)=>Record<string,unknown>}[]=[
  {name:'list_products',args:()=>({})},
  {name:'create_order',args:()=>({productId:'paper-tox-2026',quantity:1})},
  {name:'pay_order',args:s=>({orderId:s.paper})},
  {name:'create_order',args:()=>({productId:'dataset-tox-full',quantity:1})},
  {name:'pay_order',args:s=>({orderId:s.dataset})},
];
const ROOT=fileURLToPath(new URL('..',import.meta.url));
const ADAPTER=join(ROOT,'packages/mcp-adapter/src/server.ts');

type Event={t:number;actor:'agent'|'spend'|'vault'|'merchant'|'chain';kind:'list'|'order_created'|'pay_requested'|'refused'|'settled'|'pending';orderId?:string;productId?:string;amount?:string;code?:string;txHash?:string};
const SIGNER_CODES=new Set(['bad_request','bad_mac','rule_chain','rule_asset','rule_from','rule_payto','rule_amount','rule_window','rule_policy','rule_audience','stale_intent']);

export class EventLog {
  start=Date.now();events:Event[]=[];files:string[];seen=new Set<string>();runDir:string;
  constructor(runsDir:string) {
    const stamp=new Date(this.start).toISOString().replace(/[:.]/g,'-');
    this.runDir=join(runsDir,stamp);mkdirSync(this.runDir,{recursive:true});mkdirSync(join(runsDir,'latest'),{recursive:true});
    this.files=[join(this.runDir,'events.jsonl'),join(runsDir,'latest','events.jsonl')];
    for(const f of this.files) writeFileSync(f,'');
  }
  emit(e:Omit<Event,'t'>,once?:string) {
    if(once){if(this.seen.has(once))return;this.seen.add(once);}
    const event={t:Date.now()-this.start,...e} as Event;this.events.push(event);
    for(const f of this.files) appendFileSync(f,JSON.stringify(event)+'\n');
  }
}

const args=(a:unknown)=>a&&typeof a==='object'?a as Record<string,unknown>:{};
function describe(name:string,a:Record<string,unknown>) {
  if(name==='create_order') return `create_order ${a.productId} x${a.quantity}`;
  if(name==='pay_order'||name==='get_order') return `${name} ${a.orderId}`;
  return name;
}

export async function runBuyer(o:{scripted?:boolean;task?:string;model?:Model;env?:Record<string,string|undefined>;runsDir?:string;out?:(line:string)=>void;maxTurns?:number}={}) {
  const env=o.env??process.env;const lines:string[]=[];
  const out=(l:string)=>{lines.push(l);(o.out??((x:string)=>{process.stdout.write(x+"\n");}))(l);};
  const log=new EventLog(o.runsDir??env.RUNS_DIR??join(ROOT,'runs'));
  // The adapter gets only what it needs: no model key, no other secrets.
  const transport=new StdioClientTransport({command:process.execPath,args:[ADAPTER],env:{PATH:env.PATH??'',...(env.SPEND_ORIGIN?{SPEND_ORIGIN:env.SPEND_ORIGIN}:{})},stderr:'ignore'});
  const client=new Client({name:'vaulted-checkout-buyer',version:'0.2.0'});
  await client.connect(transport);
  let status='done';
  try {
    const listed=(await client.listTools()).tools.filter(t=>ALLOWED_TOOLS.includes(t.name));
    const tools:ToolDecl[]=listed.map(t=>({name:t.name,description:t.description??'',inputSchema:t.inputSchema as Record<string,unknown>}));
    const exec=async(name:string,raw:unknown):Promise<unknown>=>{
      const a=args(raw);
      if(!ALLOWED_TOOLS.includes(name)||!listed.some(t=>t.name===name)) { out(`agent -> ${name} blocked: not an allowed tool`);return {status:'error',code:'tool_not_allowed'}; }
      out(`agent -> ${describe(name,a)}`);
      if(name==='pay_order'&&typeof a.orderId==='string') log.emit({actor:'agent',kind:'pay_requested',orderId:a.orderId});
      const r=await client.callTool({name,arguments:a});
      const text=(r.content as any[])?.[0]?.text;
      let v:any;try{v=JSON.parse(text);}catch{v={status:'error',code:'bad_adapter_output'};}
      observe(name,v,a);return v;
    };
    const observe=(name:string,v:any,a:Record<string,unknown>)=>{
      if(v.status==='ok'&&name==='list_products') { out(`store  <- ${v.products.length} products: ${v.products.map((p:any)=>`${p.productId} ${p.price} USDC`).join(', ')}`);log.emit({actor:'agent',kind:'list'}); }
      else if(v.status==='created') { const p=v.items[0]?.productId;out(`store  <- order ${v.orderId} ${v.amount} USDC`);log.emit({actor:'merchant',kind:'order_created',orderId:v.orderId,...(p?{productId:p}:{}),amount:v.amount}); }
      else if(v.status==='order') { out(`store  <- order ${v.orderId} ${v.paymentStatus}`);if(v.payment)payment(v.payment); }
      else if(v.status==='error') {
        out(`spend  <- error ${v.code}`);
        if(name==='pay_order'&&typeof a.orderId==='string'&&(/^rule_/.test(v.code)||v.code==='requirements_rejected')) log.emit({actor:'spend',kind:'refused',orderId:a.orderId,code:v.code},`refused:${a.orderId}`);
      }
      else payment(v);
    };
    const payment=(v:any)=>{
      if(v.status==='settled') { out(`vault  <- settled ${v.amount} USDC ${v.explorer}`);log.emit({actor:'chain',kind:'settled',orderId:v.orderId,amount:v.amount,txHash:v.txHash},`settled:${v.orderId}`); }
      else if(v.status==='refused') { out(`vault  <- refused ${v.code}: ${v.reason}`);log.emit({actor:SIGNER_CODES.has(v.code)?'vault':'spend',kind:'refused',orderId:v.orderId,code:v.code},`refused:${v.orderId}`); }
      else if(v.status==='pending') { out(`spend  <- pending ${v.state}: ${v.hint}`);log.emit({actor:'spend',kind:'pending',orderId:v.orderId},`pending:${v.orderId}:${v.state}`); }
    };

    if(o.scripted) {
      const ids:Record<string,string>={};
      for(const step of SCRIPT) {
        const a=step.args(ids);
        if(Object.values(a).some(x=>x===undefined)) { out(`agent -> ${step.name} skipped: no order id`);continue; }
        const v:any=await exec(step.name,a);
        if(v.status==='created') ids[a.productId==='paper-tox-2026'?'paper':'dataset']=v.orderId;
      }
    } else {
      const model=o.model??new GeminiInteractions(env);
      const max=o.maxTurns??MAX_TURNS;
      let turn:ModelTurn=await model.start(SYSTEM_PROMPT,o.task??DEFAULT_TASK,tools);let turns=1;
      for(;;) {
        if(!turn.calls.length) { if(turn.text) for(const l of turn.text.split('\n')) out(`agent  : ${l}`);break; }
        if(turns>=max) { out(`agent  : stopped after ${max} model turns`);status='turn_limit';break; }
        const results:{call:FunctionCall;result:unknown}[]=[];
        for(const call of turn.calls as FunctionCall[]) results.push({call,result:await exec(call.name,call.args)});
        turn=await model.reply(results);turns++;
      }
    }
  } finally { await client.close().catch(()=>{}); }
  writeFileSync(join(log.runDir,'transcript.txt'),lines.join('\n')+'\n');
  return {status,lines,events:log.events,runDir:log.runDir};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  const argv=process.argv.slice(2);const scripted=argv.includes('--scripted');
  const task=argv.filter(a=>a!=='--scripted').join(' ')||undefined;
  try { const r=await runBuyer({scripted,task});process.exitCode=r.status==='done'?0:3; }
  catch(e) { process.stderr.write(`buyer: ${(e as Error).message}\n`);process.exitCode=1; }
}
