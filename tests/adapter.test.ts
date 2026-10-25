// CC-1: MCP adapter contract against the in-process spend harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SpendClient,handle,spendOrigin,usdc,MAX_BYTES } from '../packages/mcp-adapter/src/tools.ts';
import { buyerSetup,fakeServer,LEAK } from './support/buyer-harness.ts';

const ADAPTER=join(import.meta.dirname,'../packages/mcp-adapter/src/server.ts');
const call=async(c:SpendClient,name:string,args:unknown)=>(await handle(c,name,args)).value as any;

test('usdc formats atomic amounts with string math',()=>{
  assert.equal(usdc('1500000'),'1.50');assert.equal(usdc('7500000'),'7.50');assert.equal(usdc('1234567'),'1.234567');
  assert.equal(usdc('0'),'0.00');assert.equal(usdc('10'),'0.00001');assert.equal(usdc('123456789012345678901234567890'),'123456789012345678901234.56789');
});

test('SPEND_ORIGIN accepts only loopback http with no path',()=>{
  assert.equal(spendOrigin(undefined),'http://127.0.0.1:4001');
  assert.equal(spendOrigin('http://localhost:9'),'http://localhost:9');
  for(const bad of ['https://127.0.0.1:4001','http://evil.example','http://127.0.0.1.evil.example','http://u:p@127.0.0.1:1','http://127.0.0.1:1/x','http://10.0.0.1:1','nope']) assert.throws(()=>spendOrigin(bad),/bad_spend_origin/,bad);
});

test('stdio server exposes exactly the 4 tools; unknown tool is a fixed error',async t=>{
  const s=await buyerSetup(t);
  const client=new Client({name:'t',version:'1'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[ADAPTER],env:{PATH:process.env.PATH??'',SPEND_ORIGIN:s.origin},stderr:'ignore'}));
  t.after(()=>client.close());
  const tools=(await client.listTools()).tools.map(x=>x.name).sort();
  assert.deepEqual(tools,['create_order','get_order','list_products','pay_order']);
  const before=s.requests;
  const r:any=await client.callTool({name:'transfer_funds',arguments:{to:'0x0000000000000000000000000000000000000001',amount:'1'}});
  assert.equal(r.isError,true);assert.deepEqual(JSON.parse(r.content[0].text),{status:'error',code:'unknown_tool'});
  assert.equal(s.requests,before);
  const p:any=await client.callTool({name:'list_products',arguments:{}});
  assert.deepEqual(JSON.parse(p.content[0].text).products.map((x:any)=>[x.productId,x.price]),[['dataset-tox-full','7.50'],['demo','1.50'],['paper-tox-2026','1.50']]);
});

test('stdio server refuses a non-loopback SPEND_ORIGIN at start',async t=>{
  const client=new Client({name:'t',version:'1'});
  await assert.rejects(client.connect(new StdioClientTransport({command:process.execPath,args:[ADAPTER],env:{PATH:process.env.PATH??'',SPEND_ORIGIN:'http://evil.example'},stderr:'ignore'})));
});

test('settle returns the allowlisted receipt; duplicate pay returns the same txHash and does not settle twice',async t=>{
  const s=await buyerSetup(t);const c=new SpendClient(s.origin);
  const o=await call(c,'create_order',{productId:'paper-tox-2026',quantity:1});
  assert.deepEqual(Object.keys(o).sort(),['amount','currency','items','orderId','paymentStatus','status']);
  assert.equal(o.amount,'1.50');assert.deepEqual(o.items,[{productId:'paper-tox-2026',quantity:1}]);
  const r=await call(c,'pay_order',{orderId:o.orderId});
  assert.deepEqual(Object.keys(r).sort(),['amount','explorer','orderId','status','txHash']);
  assert.equal(r.status,'settled');assert.equal(r.amount,'1.50');assert.match(r.txHash,/^0x[0-9a-f]{64}$/);
  assert.equal(r.explorer,`https://sepolia.basescan.org/tx/${r.txHash}`);
  const again=await call(c,'pay_order',{orderId:o.orderId});
  assert.deepEqual(again,r);assert.equal(s.h.settles,1);
  const g=await call(c,'get_order',{orderId:o.orderId});
  assert.equal(g.paymentStatus,'paid');assert.deepEqual(g.payment,r);
  assert.doesNotMatch(JSON.stringify([o,r,again,g]),LEAK);
});

test('over-cap order is refused by the Reactor with the fixed rule_amount reason',async t=>{
  const s=await buyerSetup(t,'reactor');const c=new SpendClient(s.origin);
  const o=await call(c,'create_order',{productId:'dataset-tox-full',quantity:1});
  const r=await call(c,'pay_order',{orderId:o.orderId});
  assert.deepEqual(r,{status:'refused',orderId:o.orderId,code:'rule_amount',reason:'over the per-payment limit set in the vault'});
  assert.equal(s.reactorSigner!.calls,1);assert.equal(s.h.settles,0);
  assert.equal((await call(c,'get_order',{orderId:o.orderId})).paymentStatus,'unpaid');
});

test('rule_payto maps to its fixed reason; other codes get the default reason',async t=>{
  const s=await buyerSetup(t,'reactor');const c=new SpendClient(s.origin);
  s.reactorSigner!.config.PAYTO_ALLOWLIST='0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
  const o=await call(c,'create_order',{productId:'paper-tox-2026',quantity:1});
  assert.deepEqual(await call(c,'pay_order',{orderId:o.orderId}),{status:'refused',orderId:o.orderId,code:'rule_payto',reason:'payee not on the vault allowlist'});
  s.reactorSigner!.config.PAYTO_ALLOWLIST=s.h.service.rules.PAYTO_ALLOWLIST;s.reactorSigner!.config.INTENT_HMAC_KEY='other';
  const o2=await call(c,'create_order',{productId:'paper-tox-2026',quantity:1});
  assert.deepEqual(await call(c,'pay_order',{orderId:o2.orderId}),{status:'refused',orderId:o2.orderId,code:'bad_mac',reason:'refused by payment policy'});
});

test('bad ids, bad quantities and extra args fail before any HTTP request',async t=>{
  const s=await buyerSetup(t);const c=new SpendClient(s.origin);
  const cases:[string,unknown,string][]=[
    ['pay_order',{orderId:'../products'},'bad_order_id'],['pay_order',{orderId:'a/b'},'bad_order_id'],['pay_order',{orderId:''},'bad_order_id'],
    ['pay_order',{orderId:'x'.repeat(129)},'bad_order_id'],['get_order',{orderId:'ord?x=1'},'bad_order_id'],['pay_order',{},'bad_order_id'],
    ['create_order',{productId:'paper tox',quantity:1},'bad_product_id'],['create_order',{productId:'paper-tox-2026',quantity:11},'bad_quantity'],
    ['create_order',{productId:'paper-tox-2026',quantity:0},'bad_quantity'],['create_order',{productId:'paper-tox-2026',quantity:1.5},'bad_quantity'],
    ['pay_order',{orderId:'ord_1',payTo:'0x0000000000000000000000000000000000000001'},'bad_arguments'],
    ['create_order',{productId:'paper-tox-2026',quantity:1,amount:'1'},'bad_arguments'],
    ['pay_order',{orderId:'ord_1',origin:'http://evil.example'},'bad_arguments'],['list_products',{url:'x'},'bad_arguments'],['pay_order','ord_1','bad_arguments'],
  ];
  for(const [name,args,code] of cases) assert.deepEqual(await call(c,name,args),{status:'error',code},`${name} ${JSON.stringify(args)}`);
  assert.equal(c.requests,0);assert.equal(s.requests,0);
});

test('spend errors become fixed codes; oversized responses are cut at 64 KB',async t=>{
  const s=await buyerSetup(t);const c=new SpendClient(s.origin);
  assert.deepEqual(await call(c,'get_order',{orderId:'ord_missing'}),{status:'error',code:'order_not_found'});
  const big=await fakeServer(t,(_q,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(['x'.repeat(MAX_BYTES)]));});
  assert.deepEqual(await call(new SpendClient(big),'list_products',{}),{status:'error',code:'response_too_large'});
  const odd=await fakeServer(t,(_q,res)=>{res.writeHead(500);res.end(JSON.stringify({code:'Some <script> thing',intent_mac:'x'}));});
  assert.deepEqual(await call(new SpendClient(odd),'pay_order',{orderId:'ord_1'}),{status:'error',code:'http_500'});
});

test('pending states return state and hint only, never internal fields',async t=>{
  const s=await buyerSetup(t);const c=new SpendClient(s.origin);s.h.settleMode='lost';
  const o=await call(c,'create_order',{productId:'paper-tox-2026',quantity:1});
  const r=await call(c,'pay_order',{orderId:o.orderId});
  assert.deepEqual(Object.keys(r).sort(),['hint','orderId','state','status']);
  assert.equal(r.status,'pending');assert.equal(r.state,'settlement_unknown');
  assert.doesNotMatch(JSON.stringify(r),LEAK);
});
