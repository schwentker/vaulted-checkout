import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters,encodeEventTopics,parseAbiItem } from 'viem';
import { RpcChain } from '../packages/spend-service/src/chain.ts';
import { golden,harness } from './support/fixtures.ts';
import type { Hex } from '../packages/shared/src/types.ts';

const hash=('0x'+'33'.repeat(32)) as Hex;
function rpcFixture(options:{used:boolean;expired?:boolean;event?:boolean;matchingTransfer?:boolean}) {
  const chain=new RpcChain();const reads:any[]=[];
  const transfer=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)');
  const matching=options.matchingTransfer!==false;
  chain.client={
    async getChainId(){return 84532;},
    async getBlock(request:any){assert.equal(request.blockTag,'finalized');return {number:200n,timestamp:BigInt(golden.now+(options.expired?400:0))};},
    async readContract(request:any){reads.push(request);assert.equal(request.blockNumber,200n);return options.used;},
    async getLogs(request:any){assert(request.toBlock<=200n);return options.event?[{transactionHash:hash}]:[];},
    async getTransactionReceipt(){return {status:'success',blockNumber:150n,logs:[{address:golden.intent.asset,topics:encodeEventTopics({abi:[transfer],eventName:'Transfer',args:{from:golden.intent.from,to:golden.intent.to}}),data:encodeAbiParameters([{type:'uint256'}],[BigInt(golden.intent.value)+(matching?0n:1n)])}]};},
  } as any;
  return {chain,reads};
}
test('reconciliation uses finalized block state and timestamp for unused expiry',async()=>{
  const live=rpcFixture({used:false});assert.deepEqual(await live.chain.observe(golden.intent,100n),{kind:'unknown',code:'authorization_live'});
  const expired=rpcFixture({used:false,expired:true});assert.deepEqual(await expired.chain.observe(golden.intent,100n),{kind:'expired_unused'});
  assert.equal(live.reads.length,1);
});
test('consumed nonce requires matching finalized successful transfer, not nonce state alone',async()=>{
  const missing=rpcFixture({used:true,event:false});assert.equal((await missing.chain.observe(golden.intent,100n)).kind,'unknown');
  const wrong=rpcFixture({used:true,event:true,matchingTransfer:false});assert.equal((await wrong.chain.observe(golden.intent,100n)).kind,'unknown');
  const matching=rpcFixture({used:true,event:true});assert.deepEqual(await matching.chain.observe(golden.intent,100n),{kind:'settled',transaction:hash});
});
test('wrong RPC chain and oversized historical scan fail closed',async()=>{
  const wrong=rpcFixture({used:false});wrong.chain.client.getChainId=async()=>8453;
  await assert.rejects(()=>wrong.chain.observe(golden.intent,100n),/wrong_chain/);
  const wide=rpcFixture({used:true});assert.equal((await wide.chain.observe(golden.intent,-100000n)).kind,'unknown');
});
test('pending settlement status is not reported as paid and can reconcile',async t=>{
  const h=await harness();t.after(()=>h.close());h.settleMode='pending';const o=await h.order();
  assert.equal((await h.service.pay(o.id)).state,'settlement_unknown');
  assert.notEqual((await h.client.order(o.id)).paymentStatus,'paid');
  await h.service.reconcile(o.id);await h.merchant.reconcile();
  assert.equal((await h.service.pay(o.id)).state,'settled');assert.equal(h.settles,1);
});
test('uncertain unused merchant claim frees only after finalized expiry',async t=>{
  const h=await harness();t.after(()=>h.close());h.settleMode='error';const o=await h.order();
  const first=await h.service.pay(o.id);assert.equal(first.state,'settlement_unknown');
  await h.service.reconcile(o.id);await h.merchant.reconcile();assert.equal(h.store.latest(o.id)!.state,'settlement_unknown');
  h.chain.now+=400;await h.service.reconcile(o.id);await h.merchant.reconcile();
  assert.equal(h.store.latest(o.id)!.state,'failed_confirmed');h.settleMode='ok';
  const second=await h.service.pay(o.id);assert.equal(second.state,'settled');assert.notEqual(second.attemptId,first.attemptId);
});
