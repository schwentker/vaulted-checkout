import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { MerchantStore } from './store.ts';
import { accepted, authorization, authorizationDigest, authorizationKey, equalAddress, fail, makeReceipt, paymentUrl, txHash, verifyPayload } from '../../shared/src/wire.ts';
import type { Chain, Intent, MerchantResult, PaymentPayload, PaymentRequired, PaymentRequirements, Rules } from '../../shared/src/types.ts';

export interface Facilitator {
  verify(payload:PaymentPayload,requirements:PaymentRequirements):Promise<{isValid:boolean;payer?:string}>;
  settle(payload:PaymentPayload,requirements:PaymentRequirements):Promise<{success:boolean;transaction:string;network:string;payer?:string;errorReason?:string}>;
}
export type MerchantConfig={origin:string;payTo:string;maxTimeoutSeconds:number};
export class MerchantService {
  store:MerchantStore; config:MerchantConfig; facilitator:Facilitator; chain:Chain; now:()=>number;
  constructor(store:MerchantStore,config:MerchantConfig,facilitator:Facilitator,chain:Chain,now=()=>Math.floor(Date.now()/1000)) {
    this.store=store; this.config=config; this.facilitator=facilitator; this.chain=chain; this.now=now;
    if(!/^0x[0-9a-fA-F]{40}$/.test(config.payTo)||!Number.isSafeInteger(config.maxTimeoutSeconds)||config.maxTimeoutSeconds<1||config.maxTimeoutSeconds>600) fail('bad_config');
  }
  challenge(orderId:string):PaymentRequired {
    const o=this.store.order(orderId);
    return {x402Version:2,error:'Payment required',resource:{url:paymentUrl(this.config.origin,orderId),description:`Order ${orderId}`,mimeType:'application/json'},accepts:[{
      scheme:'exact',network:'eip155:84532',asset:'0x036CbD53842c5426634e7929541eC2318f3dCF7e',amount:o.amount,payTo:this.config.payTo,maxTimeoutSeconds:this.config.maxTimeoutSeconds,extra:{name:'USDC',version:'2'},
    }]};
  }
  challengeHeader(orderId:string){return encodePaymentRequiredHeader(this.challenge(orderId));}
  manifest(){return {version:'0.1.0-draft-subset',name:'Vaulted Checkout test merchant',endpoints:{products:'/api/products',orders:'/api/orders',order:'/api/orders/{orderId}',pay:'/api/orders/{orderId}/pay'},payments:{acceptedPaymentMethod:[{type:'crypto',protocols:['x402','eip-712'],assets:['USDC'],network:'eip155:84532'}]},deviations:['x402 v2 PAYMENT-* headers','Fixed four-tool adapter profile','Cards, tax, shipping and full consortium schemas omitted'],testnet:true};}
  async pay(orderId:string,payload:PaymentPayload):Promise<MerchantResult> {
    const required=this.challenge(orderId);
    const a=authorization(payload);
    const key=authorizationKey(payload), fingerprint=authorizationDigest(payload);
    const existing=this.store.db.prepare("SELECT * FROM merchant_payments WHERE order_id=? AND state NOT IN ('verify_rejected','failed_confirmed')").get(orderId) as any;
    if(existing) {
      if(existing.auth_key!==key||existing.auth_digest!==fingerprint) return fail('order_payment_conflict',409);
      if(existing.state==='paid') {
        const receipt=JSON.parse(existing.receipt);
        return {status:200,body:{status:'paid',receipt},paymentResponse:encodePaymentResponseHeader({success:true,transaction:receipt.transaction,network:receipt.network,payer:receipt.payer})};
      }
      return {status:202,body:{status:'settlement_unknown'}};
    }
    const cfg={CHAIN_ID:'84532',ASSET:required.accepts[0]!.asset,DOMAIN_NAME:'USDC',DOMAIN_VERSION:'2',MAX_WINDOW_SECONDS:'600'} as Rules;
    await verifyPayload(payload,required,cfg,this.now());
    const start=await this.chain.startBlock();
    const claim=this.store.claim(orderId,key,fingerprint,payload,start);
    if(!claim.owned) return {status:claim.payment.state==='paid'?200:202,body:{status:claim.payment.state==='paid'?'paid':'settlement_unknown',...(claim.payment.receipt?{receipt:claim.payment.receipt}:{})}};
    try {
      const verified=await this.facilitator.verify(payload,accepted(required));
      if(verified.isValid!==true) { this.store.mark(claim.payment.id,'verify_rejected'); return {status:402,body:{status:'verify_rejected'}}; }
      if(verified.payer!==undefined&&!equalAddress(verified.payer,a.from)) throw new Error('payer_mismatch');
      const result=await this.facilitator.settle(payload,accepted(required));
      if(result.success!==true||!txHash(result.transaction)||result.network!=='eip155:84532'||(result.payer!==undefined&&!equalAddress(result.payer,a.from))) throw new Error('unconfirmed_settlement');
      const receipt=makeReceipt(orderId,a.value,a.from,result.transaction);
      this.store.complete(claim.payment,receipt);
      return {status:200,body:{status:'paid',receipt},paymentResponse:encodePaymentResponseHeader(result as any)};
    } catch {
      this.store.mark(claim.payment.id,'settlement_unknown');
      return {status:202,body:{status:'settlement_unknown'}};
    }
  }
  async reconcile() {
    for(const p of this.store.unknowns()) {
      const a=authorization(p.payload);
      const i={order_id:p.order_id,from:a.from,to:a.to,value:a.value,nonce:a.nonce,valid_after:a.validAfter,valid_before:a.validBefore,asset:p.payload.accepted.asset,chain_id:'84532'} as Intent;
      try {
        const observed=await this.chain.observe(i,BigInt(p.chain_start_block));
        if(observed.kind==='settled') this.store.complete(p,makeReceipt(p.order_id,a.value,a.from,observed.transaction));
        else if(observed.kind==='expired_unused') this.store.expire(p.id);
      } catch { /* Unknown remains durable; errors never contain request data. */ }
    }
  }
  startReconcileJob(intervalMs=15000) {
    let running=false;
    const timer=setInterval(()=>{if(running)return;running=true;void this.reconcile().finally(()=>{running=false;});},intervalMs);
    timer.unref();return ()=>clearInterval(timer);
  }
}
