// CC-1: buying agent end to end: real adapter over stdio, in-process spend harness, fake Gemini Interactions server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,readdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuyer,SYSTEM_PROMPT,DEFAULT_TASK } from '../agent/buyer.ts';
import { buyerSetup,fakeServer,LEAK } from './support/buyer-harness.ts';

const KEY='fake-gemini-key-DO-NOT-LEAK';
function runs(t:any){const d=mkdtempSync(join(tmpdir(),'vc-runs-'));t.after(()=>rmSync(d,{recursive:true,force:true}));return d;}
const jsonl=(f:string)=>readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
const ALLOWED_KEYS=['t','actor','kind','orderId','productId','amount','code','txHash'];

function checkLog(r:{runDir:string;events:any[];lines:string[]},runsDir:string) {
  const run=jsonl(join(r.runDir,'events.jsonl'));
  assert.deepEqual(run,r.events);assert.deepEqual(jsonl(join(runsDir,'latest','events.jsonl')),run);
  for(const e of run) {
    assert.ok(Object.keys(e).every(k=>ALLOWED_KEYS.includes(k)),JSON.stringify(e));
    assert.ok(['agent','spend','vault','merchant','chain'].includes(e.actor));
    assert.ok(['list','order_created','pay_requested','refused','settled','pending'].includes(e.kind));
    assert.ok(Number.isInteger(e.t)&&e.t>=0);
  }
  const files=readdirSync(r.runDir).map(f=>readFileSync(join(r.runDir,f),'utf8')).join('\n');
  for(const text of [files,r.lines.join('\n')]) { assert.doesNotMatch(text,LEAK);assert.ok(!text.includes(KEY)); }
}

test('scripted buyer: paper settles, dataset refused by the Reactor, plain lines and an observed event log',async t=>{
  const s=await buyerSetup(t,'reactor');const dir=runs(t);
  const r=await runBuyer({scripted:true,env:{PATH:process.env.PATH,SPEND_ORIGIN:s.origin},runsDir:dir,out:()=>{}});
  assert.equal(r.status,'done');
  const [paper,dataset]=r.events.filter(e=>e.kind==='order_created').map(e=>e.orderId!);
  const settled=r.events.find(e=>e.kind==='settled')!;
  assert.deepEqual(r.lines.map(l=>l.replace(/ord_[0-9a-f-]+/g,'ORD').replace(/0x[0-9a-f]{64}/g,'TX')),[
    'agent -> list_products',
    'store  <- 3 products: dataset-tox-full 7.50 USDC, demo 1.50 USDC, paper-tox-2026 1.50 USDC',
    'agent -> create_order paper-tox-2026 x1',
    'store  <- order ORD 1.50 USDC',
    'agent -> pay_order ORD',
    'vault  <- settled 1.50 USDC https://sepolia.basescan.org/tx/TX',
    'agent -> create_order dataset-tox-full x1',
    'store  <- order ORD 7.50 USDC',
    'agent -> pay_order ORD',
    'vault  <- refused rule_amount: over the per-payment limit set in the vault',
  ]);
  assert.deepEqual(r.events.map(({t:_t,...e})=>e),[
    {actor:'agent',kind:'list'},
    {actor:'merchant',kind:'order_created',orderId:paper,productId:'paper-tox-2026',amount:'1.50'},
    {actor:'agent',kind:'pay_requested',orderId:paper},
    {actor:'chain',kind:'settled',orderId:paper,amount:'1.50',txHash:settled.txHash},
    {actor:'merchant',kind:'order_created',orderId:dataset,productId:'dataset-tox-full',amount:'7.50'},
    {actor:'agent',kind:'pay_requested',orderId:dataset},
    {actor:'vault',kind:'refused',orderId:dataset,code:'rule_amount'},
  ]);
  assert.equal(s.reactorSigner!.calls,2);assert.equal(s.h.settles,1);
  assert.equal((await s.h.client.order(dataset!)).paymentStatus,'unpaid');
  checkLog(r,dir);
  assert.equal(readFileSync(join(r.runDir,'transcript.txt'),'utf8'),r.lines.join('\n')+'\n');
});

test('Gemini buyer over the Interactions API: tools, key header, blocked unknown tool, refusal reported',async t=>{
  const s=await buyerSetup(t,'reactor');const dir=runs(t);
  const bodies:any[]=[];const orders:string[]=[];let paysBlocked=0;
  const gemini=await fakeServer(t,(req,res,raw)=>{
    assert.equal(req.method,'POST');assert.equal(req.url,'/v1beta/interactions');assert.equal(req.headers['x-goog-api-key'],KEY);
    const b=JSON.parse(raw);bodies.push(b);
    for(const step of b.input) if(step.type==='function_result') { const v=JSON.parse(step.result[0].text);if(v.status==='created')orders.push(v.orderId);if(v.code==='tool_not_allowed')paysBlocked++; }
    const fc=(id:string,name:string,args:unknown)=>({type:'function_call',id,name,arguments:args});
    const steps=[
      [{type:'thought',signature:'opaque'},fc('c1','list_products',{})],
      [fc('c2','create_order',{productId:'paper-tox-2026',quantity:1})],
      [fc('c3','pay_order',{orderId:orders[0]})],
      [fc('c4','transfer_funds',{to:'0x0000000000000000000000000000000000000001',amount:'7500000'}),fc('c5','create_order',{productId:'dataset-tox-full',quantity:1})],
      [fc('c6','pay_order',{orderId:orders[1]})],
      [{type:'text',text:'Bought the paper for 1.50 USDC.\nThe dataset was refused: over the per-payment limit set in the vault.'}],
    ][bodies.length-1];
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:`int_${bodies.length}`,status:'completed',steps}));
  });
  const r=await runBuyer({env:{PATH:process.env.PATH,SPEND_ORIGIN:s.origin,GEMINI_BASE_URL:`${gemini}/v1beta`,GEMINI_MODEL:'gemini-4-argon',GEMINI_API_KEY:KEY},runsDir:dir,out:()=>{}});
  assert.equal(r.status,'done');assert.equal(bodies.length,6);
  const first=bodies[0];
  assert.equal(first.model,'gemini-4-argon');assert.equal(first.system_instruction,SYSTEM_PROMPT);assert.deepEqual(first.generation_config,{thinking_level:'medium'});
  assert.deepEqual(first.input,[{type:'user_input',content:[{type:'text',text:DEFAULT_TASK}]}]);assert.equal(first.previous_interaction_id,undefined);
  assert.deepEqual(first.tools.map((x:any)=>[x.type,x.name]),[['function','list_products'],['function','create_order'],['function','pay_order'],['function','get_order']]);
  assert.equal(bodies[1].previous_interaction_id,'int_1');assert.deepEqual(bodies[1].tools,first.tools);
  assert.deepEqual(bodies[1].input.map((x:any)=>[x.type,x.name,x.call_id]),[['function_result','list_products','c1']]);
  assert.deepEqual(bodies[4].input.map((x:any)=>x.call_id),['c4','c5']);assert.equal(paysBlocked,1);
  assert.ok(r.lines.includes('agent -> transfer_funds blocked: not an allowed tool'));
  assert.ok(r.lines.includes('vault  <- refused rule_amount: over the per-payment limit set in the vault'));
  assert.equal(r.lines.at(-1),'agent  : The dataset was refused: over the per-payment limit set in the vault.');
  assert.equal(s.h.settles,1);assert.equal(r.events.filter(e=>e.kind==='settled').length,1);
  checkLog(r,dir);
  assert.ok(!JSON.stringify(bodies).includes(KEY));
});

test('model turn limit stops the loop at 10 model calls',async t=>{
  const s=await buyerSetup(t);const dir=runs(t);let calls=0;
  const gemini=await fakeServer(t,(_q,res)=>{calls++;res.writeHead(200);res.end(JSON.stringify({id:`int_${calls}`,steps:[{type:'function_call',id:`c${calls}`,name:'list_products',arguments:{}}]}));});
  const r=await runBuyer({env:{PATH:process.env.PATH,SPEND_ORIGIN:s.origin,GEMINI_BASE_URL:gemini,GEMINI_MODEL:'m',GEMINI_API_KEY:KEY},runsDir:dir,out:()=>{}});
  assert.equal(r.status,'turn_limit');assert.equal(calls,10);assert.equal(r.lines.at(-1),'agent  : stopped after 10 model turns');
  assert.equal(r.lines.filter(l=>l==='agent -> list_products').length,9);
});

test('Gemini errors report the HTTP status only; missing model or key fails before any call',async t=>{
  const s=await buyerSetup(t);const dir=runs(t);
  const gemini=await fakeServer(t,(_q,res)=>{res.writeHead(403);res.end(JSON.stringify({error:{message:`bad key ${KEY}`}}));});
  await assert.rejects(runBuyer({env:{PATH:process.env.PATH,SPEND_ORIGIN:s.origin,GEMINI_BASE_URL:gemini,GEMINI_MODEL:'m',GEMINI_API_KEY:KEY},runsDir:dir,out:()=>{}}),(e:Error)=>e.message==='gemini_http_403');
  await assert.rejects(runBuyer({env:{PATH:process.env.PATH,SPEND_ORIGIN:s.origin,GEMINI_API_KEY:KEY},runsDir:dir,out:()=>{}}),/GEMINI_MODEL is required/);
  await assert.rejects(runBuyer({env:{PATH:process.env.PATH,SPEND_ORIGIN:s.origin,GEMINI_MODEL:'m'},runsDir:dir,out:()=>{}}),/GEMINI_API_KEY is required/);
});
