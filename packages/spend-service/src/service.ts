import { randomBytes,randomUUID } from 'node:crypto';
import { getAddress,recoverTypedDataAddress } from 'viem';
import { decodePaymentResponseHeader } from '@x402/core/http';
import { core } from '../../shared/src/core.ts';
import { AttemptStore } from './store.ts';
import { buildHeader,equalAddress,fail,id,makeReceipt,object,txHash,validReceipt,validateRequirements,validateRules } from '../../shared/src/wire.ts';
import type { Attempt,Chain,Intent,MerchantClient,PublicAttempt,Rules,Signer } from '../../shared/src/types.ts';

const REFUSALS:Record<string,number>={bad_request:400,bad_mac:401,rule_chain:403,rule_asset:403,rule_from:403,rule_payto:403,rule_amount:403,rule_window:403,rule_policy:403,rule_audience:403,stale_intent:403};
export class SpendService {
  store:AttemptStore; merchant:MerchantClient; signer:Signer; chain:Chain; rules:Rules;
  #macKey:string; origin:string; now:()=>number; nonce:()=>string; attemptId:()=>string;
  constructor(options:{store:AttemptStore;merchant:MerchantClient;signer:Signer;chain:Chain;rules:Rules;macKey:string;merchantOrigin:string;now?:()=>number;nonce?:()=>string;attemptId?:()=>string}) {
    this.store=options.store;this.merchant=options.merchant;this.signer=options.signer;this.chain=options.chain;this.rules={...options.rules};this.#macKey=options.macKey;this.origin=options.merchantOrigin;
    this.now=options.now??(()=>Math.floor(Date.now()/1000));this.nonce=options.nonce??(()=>`0x${randomBytes(32).toString('hex')}`);this.attemptId=options.attemptId??randomUUID;
    validateRules(this.rules); if(!this.#macKey) fail('bad_config');
  }
  public(a:Attempt):PublicAttempt {return {orderId:a.order_id,attemptId:a.attempt_id,state:a.state,amount:a.intent.value,...(a.receipt?{receipt:a.receipt}:{}),...(a.reject_code?{code:a.reject_code}:{})};}
  async pay(orderId:string):Promise<PublicAttempt> {
    id(orderId);
    const existing=this.store.latest(orderId);
    if(existing&&existing.state!=='failed_confirmed') return this.public(existing);
    const order=await this.merchant.order(orderId);
    const current=this.store.latest(orderId);
    if(current&&current.state!=='failed_confirmed') return this.public(current);
    if(order.id!==orderId||order.currency!=='USDC'||order.paymentStatus==='paid') return fail('order_not_payable',409);
    const required=await this.merchant.challenge(orderId);
    const a=validateRequirements(required,this.rules,order,this.origin);
    const start=await this.chain.startBlock();
    const claim=this.store.authorize(orderId,()=>{
      const now=this.now();
      const intent:Intent={v:'vc-intent-1',audience:this.rules.AUDIENCE,order_id:orderId,attempt_id:this.attemptId(),chain_id:this.rules.CHAIN_ID,asset:this.rules.ASSET,from:this.rules.WALLET_ADDRESS,to:a.payTo,value:a.amount,valid_after:'0',valid_before:String(now+a.maxTimeoutSeconds),nonce:this.nonce(),policy_version:this.rules.POLICY_VERSION,issued_at:String(now)};
      const code=core.checkRules(intent,this.rules,now);if(code) return fail(code);
      const date=new Date().toISOString();
      return {attempt_id:intent.attempt_id,order_id:orderId,state:'authorized',intent,intent_mac:core.macIntent(intent,this.#macKey),required,chain_start_block:String(start),sign_calls:0,uncertain_sign:0,signature:null,payment_header:null,tx_hash:null,reject_code:null,receipt:null,created_at:date,updated_at:date};
    });
    if(claim.created) await this.process(claim.attempt.attempt_id);
    return this.public(this.store.get(claim.attempt.attempt_id));
  }
  async process(attemptId:string) {
    let a=this.store.get(attemptId);
    if(a.state==='authorized'||a.state==='sign_unknown') {
      if(!this.store.transition(attemptId,[a.state],'signing')) return;
      a=this.store.get(attemptId);
      try {
        const result=await this.signer.sign({intent:structuredClone(a.intent),intent_mac:a.intent_mac});
        const b=object(result.body);
        if(b.ok===false&&typeof b.code==='string'&&REFUSALS[b.code]===result.statusCode&&Object.keys(b).every(k=>['ok','code'].includes(k))) {
          if(a.sign_calls===1&&!a.uncertain_sign) {
            if(this.store.transition(attemptId,['signing'],'rejected',{reject_code:b.code})) this.store.transition(attemptId,['rejected'],'failed_confirmed');
          } else this.store.transition(attemptId,['signing'],'sign_unknown',{reject_code:b.code});
          return;
        }
        if(result.statusCode!==200||b.ok!==true||b.attempt_id!==a.attempt_id||!equalAddress(b.from,a.intent.from)||typeof b.signature!=='string'||!/^0x[0-9a-fA-F]{130}$/.test(b.signature)||Object.keys(b).some(k=>!['ok','from','signature','attempt_id'].includes(k))) throw new Error('invalid_signer_response');
        const signature=b.signature as `0x${string}`;
        const from=await recoverTypedDataAddress({...core.typedDataFor(a.intent,this.rules,getAddress),signature});
        if(!equalAddress(from,a.intent.from)) throw new Error('signature_mismatch');
        const header=buildHeader(a.required,a.intent,signature);
        if(!this.store.transition(attemptId,['signing'],'signed',{signature,payment_header:header})) return;
      } catch { this.store.transition(attemptId,['signing'],'sign_unknown',{reject_code:'sign_outcome_unknown'});return; }
    }
    a=this.store.get(attemptId);
    if(a.state!=='signed'||!a.payment_header||!this.store.transition(attemptId,['signed'],'submitted')) return;
    try {
      const result=await this.merchant.submit(a.order_id,a.payment_header);
      if(result.status!==200||result.body.status!=='paid'||!validReceipt(result.body.receipt,a.intent)||!result.paymentResponse) throw new Error('settlement_unknown');
      const response=decodePaymentResponseHeader(result.paymentResponse);
      if(response.success!==true||response.network!=='eip155:84532'||!txHash(response.transaction)||response.transaction!==result.body.receipt.transaction||(response.payer!==undefined&&!equalAddress(response.payer,a.intent.from))) throw new Error('settlement_mismatch');
      this.store.transition(attemptId,['submitted'],'settled',{tx_hash:response.transaction,receipt:makeReceipt(a.order_id,a.intent.value,a.intent.from,response.transaction)});
    } catch {this.store.transition(attemptId,['submitted'],'settlement_unknown',{reject_code:'settlement_outcome_unknown'});}
  }
  async reconcile(orderId?:string) {
    const pending=orderId?[this.store.latest(orderId)].filter((a):a is Attempt=>!!a):this.store.pending();
    for(const a of pending) {
      if(['settled','failed_confirmed','signing','submitted'].includes(a.state)) continue;
      try {
        const observed=await this.chain.observe(a.intent,BigInt(a.chain_start_block));
        if(observed.kind==='settled'&&['sign_unknown','signed','settlement_unknown'].includes(a.state)) this.store.transition(a.attempt_id,[a.state],'settled',{tx_hash:observed.transaction,receipt:makeReceipt(a.order_id,a.intent.value,a.intent.from,observed.transaction)});
        else if(observed.kind==='expired_unused') this.store.transition(a.attempt_id,[a.state],'failed_confirmed',{reject_code:'expired_unused'});
      } catch { /* Retain the exact durable state on RPC or evidence failure. */ }
    }
  }
  async recover() {
    this.store.recoverInterrupted();
    await this.reconcile();
    for(const a of this.store.pending()) if(a.state==='authorized'||a.state==='signed') await this.process(a.attempt_id);
  }
  startReconcileJob(intervalMs=15000) {
    let running=false;
    const timer=setInterval(()=>{if(running)return;running=true;void this.reconcile().finally(()=>{running=false;});},intervalMs);
    timer.unref();return ()=>clearInterval(timer);
  }
}
