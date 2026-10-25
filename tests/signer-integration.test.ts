// Phase 3: the generated signer Reactor (reactors/signer/reactor.js) runs in place of MockSigner,
// behind a local stand-in for the Basis Theory invoke and token APIs. Public fixture keys only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { getAddress,recoverTypedDataAddress } from 'viem';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { core } from '../packages/shared/src/core.ts';
import { golden,harness,PUBLIC_HARDHAT_KEY,rules } from './support/fixtures.ts';
import type { Signer,SignerRequest,SignerResult } from '../packages/shared/src/types.ts';

const require=createRequire(import.meta.url);
const reactor=require('../reactors/signer/reactor.js') as (event:unknown)=>Promise<{res:{statusCode:number;body:unknown}}>;
const BT='https://api.test.basistheory.com';
const realFetch=globalThis.fetch;
let tokenReads=0;
globalThis.fetch=(async(input:any,init?:any)=>{
  const url=String(input);
  if(!url.startsWith(`${BT}/tokens/`)) return realFetch(input,init);
  tokenReads++;
  if(url!==`${BT}/tokens/tok_fixture`||init?.headers?.['BT-API-KEY']!=='runtime-key') return new Response('{}',{status:403});
  return new Response(JSON.stringify({id:'tok_fixture',data:PUBLIC_HARDHAT_KEY}),{status:200});
}) as typeof fetch;

// Emulates POST /reactors/{id}/react: JSON in, res.statusCode and res.body out, nothing shared by reference.
class LocalReactorSigner implements Signer {
  calls=0;requests:SignerRequest[]=[];config:Record<string,string>;
  constructor(config:Record<string,string>){this.config=config;}
  async sign(request:SignerRequest):Promise<SignerResult> {
    this.calls++;this.requests.push(structuredClone(request));
    const out=await reactor({req:JSON.parse(JSON.stringify(request)),configuration:{...this.config},applicationOptions:{apiKey:'runtime-key',baseUrl:BT}});
    return {statusCode:out.res.statusCode,body:JSON.parse(JSON.stringify(out.res.body))};
  }
}
const reactorConfig=(patch:Record<string,string>={})=>({...golden.reactor_config,WALLET_TOKEN_ID:'tok_fixture',...patch});

async function setup(t:any,patch:Record<string,string>={}) {
  const h=await harness();t.after(()=>h.close());
  const realNow=Date.now;Date.now=()=>h.chain.now*1000;t.after(()=>{Date.now=realNow;});
  const signer=new LocalReactorSigner(reactorConfig(patch));h.service.signer=signer;
  return {h,signer};
}

test('signer Reactor signs a real purchase end to end; proof recovers to the vaulted wallet',async t=>{
  const {h,signer}=await setup(t);const o=await h.order();const reads=tokenReads;
  const result=await h.service.pay(o.id);
  assert.equal(result.state,'settled');assert.equal(signer.calls,1);assert.equal(h.settles,1);assert.equal(tokenReads-reads,1);
  const a=h.store.latest(o.id)!;
  const payload=decodePaymentSignatureHeader(a.payment_header!);
  const recovered=await recoverTypedDataAddress({...core.typedDataFor(a.intent,rules,getAddress),signature:(payload.payload as any).signature});
  assert.equal(recovered,golden.reactor_config.WALLET_ADDRESS);
  assert.equal((await h.client.order(o.id)).paymentStatus,'paid');
  assert.deepEqual(await h.service.pay(o.id),result);assert.equal(signer.calls,1);
});

test('Reactor allowlist refusal on first call fails the attempt without reading the key; fixed config pays',async t=>{
  const {h,signer}=await setup(t,{PAYTO_ALLOWLIST:'0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'});const o=await h.order();const reads=tokenReads;
  const first=await h.service.pay(o.id);
  assert.equal(first.state,'failed_confirmed');assert.equal(first.code,'rule_payto');assert.equal(tokenReads,reads);assert.equal(h.settles,0);
  signer.config=reactorConfig();
  const second=await h.service.pay(o.id);
  assert.notEqual(second.attemptId,first.attemptId);assert.equal(second.state,'settled');assert.equal(h.settles,1);
});

test('MAC key mismatch between spend service and Reactor is a definite refusal',async t=>{
  const {h}=await setup(t,{INTENT_HMAC_KEY:'a-different-reactor-key'});const o=await h.order();
  const r=await h.service.pay(o.id);assert.equal(r.state,'failed_confirmed');assert.equal(r.code,'bad_mac');assert.equal(h.settles,0);
});

test('Reactor cap below spend cap is enforced inside the Reactor',async t=>{
  const {h}=await setup(t,{MAX_AMOUNT:'1000000'});const o=await h.order();
  const r=await h.service.pay(o.id);assert.equal(r.state,'failed_confirmed');assert.equal(r.code,'rule_amount');
});

test('lost Reactor response then retry: identical envelope, identical signature, one settlement',async t=>{
  const {h,signer}=await setup(t);const o=await h.order();
  const sign=signer.sign.bind(signer);const sigs:string[]=[];let lose=true;
  signer.sign=async request=>{const r=await sign(request);if(r.body.ok)sigs.push(r.body.signature);if(lose){lose=false;throw new Error('response_lost');}return r;};
  assert.equal((await h.service.pay(o.id)).state,'sign_unknown');
  const before=h.store.latest(o.id)!;h.chain.now+=10;
  await h.service.process(before.attempt_id);
  const after=h.store.latest(o.id)!;
  assert.equal(after.state,'settled');assert.equal(h.settles,1);
  assert.deepEqual(signer.requests[0],signer.requests[1]);assert.equal(sigs.length,2);assert.equal(sigs[0],sigs[1]);
  assert.equal(after.signature,sigs[0]);
});

test('lost Reactor response then stale retry stays unknown until finalized expiry',async t=>{
  const {h,signer}=await setup(t);const o=await h.order();
  const sign=signer.sign.bind(signer);let lose=true;
  signer.sign=async request=>{const r=await sign(request);if(lose){lose=false;throw new Error('response_lost');}return r;};
  await h.service.pay(o.id);const a=h.store.latest(o.id)!;
  h.chain.now+=700;
  await h.service.process(a.attempt_id);
  assert.equal(h.store.latest(o.id)!.state,'sign_unknown');assert.equal(h.store.latest(o.id)!.reject_code,'rule_window');
  await h.service.reconcile(o.id);
  assert.equal(h.store.latest(o.id)!.state,'failed_confirmed');assert.equal(h.settles,0);
});
