import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { PaymentPayloadSchema,PaymentRequiredSchema } from '@x402/core/schemas';
import { decodePaymentSignatureHeader,encodePaymentSignatureHeader } from '@x402/core/http';
import { core } from '../packages/shared/src/core.ts';
import { buildHeader,buildPayload,digest } from '../packages/shared/src/wire.ts';
import { AttemptStore } from '../packages/spend-service/src/store.ts';
import { SpendService } from '../packages/spend-service/src/service.ts';
import { spendServer } from '../packages/spend-service/src/server.ts';
import { listenLocal } from '../packages/shared/src/http.ts';
import { golden,harness,MockSigner,PUBLIC_HARDHAT_KEY,PUBLIC_MAC,rules } from './support/fixtures.ts';
import type { Attempt,Intent,Signer } from '../packages/shared/src/types.ts';

test('golden MAC, deterministic signing and header are byte-identical to phase 1 fixture',async()=>{
  const signer=new MockSigner(()=>golden.now);const result=await signer.sign(golden.signer_request);
  assert.equal(result.statusCode,200);assert.equal(result.body.ok,true);
  if(!result.body.ok)throw new Error('unexpected_refusal');
  assert.equal(result.body.signature,golden.signer_response.body.signature);
  assert.equal(core.canonicalize({...golden.intent}),golden.canonical_intent);
  assert.equal(core.macIntent(golden.intent,PUBLIC_MAC),golden.intent_mac);
  assert.equal(buildHeader(golden.payment_required,golden.intent,result.body.signature),golden.payment_signature_header);
  assert(PaymentPayloadSchema.safeParse(golden.payment_payload).success);
  assert(PaymentRequiredSchema.safeParse(golden.payment_required).success);
});

test('intent attacks reject changes, malformed data, unknown fields and future authorization windows',()=>{
  assert.equal(core.verifyMac(null,golden.intent_mac,PUBLIC_MAC),false);
  assert.equal(core.verifyMac({...golden.intent,value:'1'},golden.intent_mac,PUBLIC_MAC),false);
  assert.equal(core.verifyMac(golden.intent,golden.intent_mac.toUpperCase(),PUBLIC_MAC),false);
  assert.equal(core.checkRules({...golden.intent,extra:'x'},rules,golden.now),'bad_request');
  assert.equal(core.checkRules({...golden.intent,value:'9'.repeat(78)},rules,golden.now),'bad_request');
  assert.equal(core.checkRules({...golden.intent,valid_after:String(golden.now+86400),valid_before:String(golden.now+86460)},rules,golden.now),'rule_window');
  for(const negative of golden.negatives) assert.equal(core.checkRules({...golden.intent,...negative.patch},{...rules,...negative.cfg_patch},golden.now),negative.expect);
});

test('real HTTP merchant challenge, immutable prices and one locally signed purchase',async t=>{
  const h=await harness();t.after(()=>h.close());const order=await h.order();
  assert.equal(order.amount,'1500000');
  const challenge=await h.client.challenge(order.id);assert.equal(challenge.x402Version,2);
  assert.equal(challenge.accepts[0]!.amount,order.amount);
  const result=await h.service.pay(order.id);assert.equal(result.state,'settled');assert.equal(h.settles,1);
  assert.equal((await h.client.order(order.id)).paymentStatus,'paid');
  assert.throws(()=>h.merchantStore.db.prepare('UPDATE orders SET amount=? WHERE id=?').run('1',order.id),/immutable_order/);
  const changed=await fetch(`${h.origin}/api/orders/${order.id}/pay`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({amount:'1'})});
  assert.equal(changed.status,400);
  const before=h.store.latest(order.id)!;
  assert.deepEqual(await h.service.pay(order.id),result);assert.equal(h.signer.calls,1);assert.equal(h.settles,1);
  assert.equal(h.store.latest(order.id)!.intent.nonce,before.intent.nonce);
});

test('parallel pay calls and parallel merchant submissions settle once',async t=>{
  const h=await harness();t.after(()=>h.close());const order=await h.order();
  const results=await Promise.all(Array.from({length:8},()=>h.service.pay(order.id)));
  assert.equal(new Set(results.map(r=>r.attemptId)).size,1);assert.equal(h.signer.calls,1);assert.equal(h.settles,1);
  const row=h.store.latest(order.id)!;
  const submissions=await Promise.all(Array.from({length:5},()=>h.client.submit(order.id,row.payment_header!)));
  assert(submissions.every(r=>r.status===200));assert.equal(h.settles,1);
});

test('partial unique order index, unique nonce and settled-order lock survive independent connections',async t=>{
  const h=await harness();t.after(()=>h.close());const order=await h.order();await h.service.pay(order.id);
  const row=h.store.latest(order.id)!;
  const other=new AttemptStore(`${h.dir}/spend.sqlite`);t.after(()=>other.close());
  assert.equal(other.authorize(order.id,()=>{throw new Error('must_not_create');}).created,false);
  assert.throws(()=>h.store.db.prepare("UPDATE attempts SET intent='{}' WHERE attempt_id=?").run(row.attempt_id),/immutable_authorization|terminal_attempt/);
  assert.throws(()=>h.store.db.prepare("UPDATE attempts SET state='authorized' WHERE attempt_id=?").run(row.attempt_id),/terminal_attempt|invalid_transition/);
  const cloneSql=`INSERT INTO attempts(attempt_id,order_id,state,intent,intent_mac,required,payment_requirements_hash,nonce,chain_start_block,created_at,updated_at) SELECT ?,?,'authorized',json_set(intent,'$.attempt_id',?,'$.order_id',?),intent_mac,required,payment_requirements_hash,nonce,chain_start_block,created_at,updated_at FROM attempts WHERE attempt_id=?`;
  const cloneId=randomUUID();
  assert.throws(()=>h.store.db.prepare(cloneSql).run(cloneId,'another_order',cloneId,'another_order',row.attempt_id),/UNIQUE constraint failed: attempts.nonce/);
  assert.throws(()=>h.store.db.prepare(cloneSql).run(cloneId,order.id,cloneId,order.id,row.attempt_id),/order_attempt_locked/);
});

test('proof for one order cannot pay another equal-priced order',async t=>{
  const h=await harness();t.after(()=>h.close());const order=await h.order();await h.service.pay(order.id);
  const second=await h.order();const a=h.store.latest(order.id)!;
  const payload=decodePaymentSignatureHeader(a.payment_header!);
  // Resource URL is outside the EIP-3009 signature. Even rewritten transport metadata must not credit a second order.
  payload.resource={...(await h.client.challenge(second.id)).resource!};
  const response=await h.client.submit(second.id,encodePaymentSignatureHeader(payload));
  assert.equal(response.status,409);assert.equal(h.settles,1);
  assert.equal((await h.client.order(second.id)).paymentStatus,'unpaid');
});

test('merchant reserves a live proof before verification and does not report paid early',async t=>{
  const h=await harness();t.after(()=>h.close());const o=await h.order();
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const original=h.merchant.facilitator.settle;
  h.merchant.facilitator.settle=async(...args)=>{await gate;return original(...args);};
  const purchase=h.service.pay(o.id);
  for(let n=0;n<100&&h.store.latest(o.id)?.state!=='submitted';n++)await new Promise(r=>setTimeout(r,5));
  assert.equal(h.store.latest(o.id)!.state,'submitted');
  assert.notEqual((await h.client.order(o.id)).paymentStatus,'paid');
  const header=h.store.latest(o.id)!.payment_header!;
  const duplicate=await h.client.submit(o.id,header);assert.equal(duplicate.status,202);
  release();assert.equal((await purchase).state,'settled');assert.equal(h.settles,1);
});

test('sign timeout then retry refusal preserves the original possibly signed attempt',async t=>{
  const h=await harness();t.after(()=>h.close());const o=await h.order();
  const original=h.signer.sign.bind(h.signer);h.signer.sign=async request=>{await original(request);throw new Error('response_lost');};
  assert.equal((await h.service.pay(o.id)).state,'sign_unknown');
  const first=h.store.latest(o.id)!;
  h.signer.sign=async()=>({statusCode:403,body:{ok:false,code:'rule_window'}});
  await h.service.process(first.attempt_id);
  const second=h.store.latest(o.id)!;
  assert.equal(second.state,'sign_unknown');assert.equal(second.sign_calls,2);
  assert.deepEqual(second.intent,first.intent);assert.equal(second.intent_mac,first.intent_mac);
  assert.equal((await h.service.pay(o.id)).attemptId,first.attempt_id);
});

test('retry after lost signing response uses identical envelope and proof',async t=>{
  const h=await harness();t.after(()=>h.close());const o=await h.order();
  const original=h.signer.sign.bind(h.signer);let first=true;
  h.signer.sign=async request=>{const result=await original(request);if(first){first=false;throw new Error('lost');}return result;};
  await h.service.pay(o.id);const before=h.store.latest(o.id)!;h.chain.now+=10;
  await h.service.process(before.attempt_id);
  assert.equal(h.store.latest(o.id)!.state,'settled');assert.deepEqual(h.signer.requests[0],h.signer.requests[1]);
});

test('first definite signer refusal permits replacement but unknown 4xx does not',async t=>{
  const h=await harness();t.after(()=>h.close());const o=await h.order();
  h.signer.sign=async()=>({statusCode:403,body:{ok:false,code:'rule_amount'}});
  const first=await h.service.pay(o.id);assert.equal(first.state,'failed_confirmed');
  h.signer.sign=async()=>({statusCode:429,body:{ok:false,code:'internal'}});
  const next=await h.service.pay(o.id);assert.notEqual(first.attemptId,next.attemptId);assert.equal(next.state,'sign_unknown');
});

test('lost settlement response stays unknown and reconciles matching chain evidence',async t=>{
  const h=await harness();t.after(()=>h.close());h.settleMode='lost';const o=await h.order();
  assert.equal((await h.service.pay(o.id)).state,'settlement_unknown');
  assert.notEqual((await h.client.order(o.id)).paymentStatus,'paid');
  await h.service.reconcile(o.id);await h.merchant.reconcile();
  assert.equal(h.store.latest(o.id)!.state,'settled');assert.equal((await h.client.order(o.id)).paymentStatus,'paid');
  assert.equal(h.settles,1);assert.equal((await h.service.pay(o.id)).state,'settled');
});

test('verify failure and RPC errors never free a live authorization',async t=>{
  const h=await harness();t.after(()=>h.close());h.verifyValid=false;const o=await h.order();
  assert.equal((await h.service.pay(o.id)).state,'settlement_unknown');assert.equal(h.settles,0);
  const a=h.store.latest(o.id)!;await h.service.reconcile(o.id);assert.equal(h.store.latest(o.id)!.state,'settlement_unknown');
  const observe=h.chain.observe.bind(h.chain);h.chain.observe=async()=>{throw new Error('rpc_down');};h.chain.now+=400;
  await h.service.reconcile(o.id);assert.equal(h.store.latest(o.id)!.state,'settlement_unknown');
  h.chain.observe=observe;await h.service.reconcile(o.id);assert.equal(h.store.latest(o.id)!.state,'failed_confirmed');
  h.verifyValid=true;const next=await h.service.pay(o.id);assert.equal(next.state,'settled');assert.notEqual(next.attemptId,a.attempt_id);
});

test('startup recovers interrupted signing/submission with durable tuple unchanged',async t=>{
  const h=await harness();t.after(()=>h.close());h.signer.sign=async()=>{throw new Error('lost');};const o=await h.order();
  await h.service.pay(o.id);const a=h.store.latest(o.id)!;
  assert.throws(()=>h.store.db.prepare("UPDATE attempts SET state='settled' WHERE attempt_id=?").run(a.attempt_id),/CHECK constraint failed/);
  h.store.transition(a.attempt_id,['sign_unknown'],'signing');h.store.recoverInterrupted();
  assert.equal(h.store.latest(o.id)!.state,'sign_unknown');assert.deepEqual(h.store.latest(o.id)!.intent,a.intent);
  const second=new AttemptStore(`${h.dir}/spend.sqlite`);t.after(()=>second.close());
  assert.deepEqual(second.latest(o.id)!.intent,a.intent);
});

test('signer response is independently recovered before being persisted or submitted',async t=>{
  const h=await harness();t.after(()=>h.close());const o=await h.order();
  const original=h.signer.sign.bind(h.signer);
  h.signer.sign=async r=>{const result=await original(r);if(result.body.ok)result.body.attempt_id=randomUUID();return result;};
  assert.equal((await h.service.pay(o.id)).state,'sign_unknown');assert.equal(h.settles,0);assert.equal(h.store.latest(o.id)!.signature,null);
});

test('requirements are checked before creating any attempt or calling signer',async t=>{
  const h=await harness();t.after(()=>h.close());const o=await h.order();const challenge=h.client.challenge.bind(h.client);
  h.client.challenge=async id=>{const r=await challenge(id);r.accepts[0]!.amount='1';return r;};
  await assert.rejects(()=>h.service.pay(o.id),/requirements_rejected/);assert.equal(h.store.latest(o.id),undefined);assert.equal(h.signer.calls,0);
});

test('spend HTTP surface rejects caller payment fields and returns only sanitized receipts',async t=>{
  const h=await harness();t.after(()=>h.close());const server=spendServer(h.service);const origin=await listenLocal(server);
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
  const o=await h.order();
  const denied=await fetch(`${origin}/pay`,{method:'POST',body:JSON.stringify({orderId:o.id,amount:'1',nonce:golden.intent.nonce})});assert.equal(denied.status,400);
  const paid=await fetch(`${origin}/pay`,{method:'POST',body:JSON.stringify({orderId:o.id})});assert.equal(paid.status,200);
  const text=await paid.text();assert(!text.includes('signature'));assert(!text.includes('intent_mac'));assert(!text.includes(PUBLIC_MAC));assert(!text.includes(PUBLIC_HARDHAT_KEY));
  assert.equal(JSON.parse(text).state,'settled');
  const getOrder=h.merchantStore.order.bind(h.merchantStore);
  h.merchantStore.order=id=>({...getOrder(id),receipt:{...getOrder(id).receipt!,signature:'must-not-reach-adapter'}} as any);
  const status=await fetch(`${origin}/orders/${o.id}`);const statusText=await status.text();
  assert.equal(status.status,200);assert(!statusText.includes('must-not-reach-adapter'));assert(!statusText.includes('signature'));
});
