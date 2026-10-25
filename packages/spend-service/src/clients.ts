import { decodePaymentRequiredHeader } from '@x402/core/http';
import { fail,id,object,uint,txHash,makeReceipt } from '../../shared/src/wire.ts';
import type { MerchantClient,MerchantResult,Order,Product,Signer,SignerRequest,SignerResult } from '../../shared/src/types.ts';

async function boundedJson(response:Response) {
  const reader=response.body?.getReader();if(!reader)return {};
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new Error('response_too_large');}chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
function product(value:unknown):Product {
  const p=object(value);
  if(typeof p.name!=='string'||p.name.length>256||!uint(p.unitAmount)||p.currency!=='USDC')return fail('bad_merchant_product',502);
  return {id:id(p.id),name:p.name,unitAmount:p.unitAmount,currency:'USDC'};
}
function order(value:unknown):Order {
  const o=object(value);const orderId=id(o.id);
  if(!uint(o.amount)||o.currency!=='USDC'||!['unpaid','pending','paid'].includes(o.paymentStatus as string)||!Array.isArray(o.items)||o.items.length>20)return fail('bad_merchant_order',502);
  const items=o.items.map(value=>{const i=object(value);if(!uint(i.unitAmount)||!Number.isSafeInteger(i.quantity)||Number(i.quantity)<1||Number(i.quantity)>100)return fail('bad_merchant_order',502);return {productId:id(i.productId),quantity:i.quantity as number,unitAmount:i.unitAmount};});
  const parsed:Order={id:orderId,items,amount:o.amount,currency:'USDC',paymentStatus:o.paymentStatus as Order['paymentStatus']};
  if(o.receipt) {
    const r=object(o.receipt);
    if(r.orderId!==orderId||r.amount!==o.amount||r.network!=='eip155:84532'||typeof r.payer!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(r.payer)||!txHash(r.transaction))return fail('bad_merchant_receipt',502);
    parsed.receipt=makeReceipt(orderId,o.amount,r.payer,r.transaction);
  }
  return parsed;
}
export class HttpMerchantClient implements MerchantClient {
  origin:string;timeoutMs:number;
  constructor(origin:string,options:{allowLocalHttp?:boolean;timeoutMs?:number}={}) {
    const u=new URL(origin);
    if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||(u.protocol!=='https:'&&!(options.allowLocalHttp&&u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname))))fail('bad_merchant_origin');
    this.origin=u.origin;this.timeoutMs=options.timeoutMs??20000;
  }
  async request(path:string,init:RequestInit={}) {
    const url=new URL(path,this.origin);if(url.origin!==this.origin)fail('merchant_origin_changed');
    const response=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(this.timeoutMs)});
    const value=await boundedJson(response);
    return {response,value};
  }
  async products(){const {response,value}=await this.request('/api/products');if(response.status!==200||!Array.isArray(value))return fail('merchant_unavailable',502);return value.map(product);}
  async createOrder(items:{productId:string;quantity:number}[]) {const {response,value}=await this.request('/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items})});if(response.status!==201)return fail('order_creation_failed',502);return order(value);}
  async order(id:string){const {response,value}=await this.request(`/api/orders/${encodeURIComponent(id)}`);if(response.status!==200)return fail('order_not_found',404);return order(value);}
  async challenge(id:string){const {response}=await this.request(`/api/orders/${encodeURIComponent(id)}/pay`,{method:'POST'});const header=response.headers.get('PAYMENT-REQUIRED');if(response.status!==402||!header||header.length>16384)return fail('missing_payment_required',502);return decodePaymentRequiredHeader(header);}
  async submit(id:string,header:string):Promise<MerchantResult> {
    const {response,value}=await this.request(`/api/orders/${encodeURIComponent(id)}/pay`,{method:'POST',headers:{'PAYMENT-SIGNATURE':header}});
    const b=object(value);
    return {status:response.status,body:{status:typeof b.status==='string'?b.status:'unknown',...(b.receipt?{receipt:b.receipt as any}:{} )},...(response.headers.has('PAYMENT-RESPONSE')?{paymentResponse:response.headers.get('PAYMENT-RESPONSE')!}:{})};
  }
}

export class ReactorSigner implements Signer {
  #apiKey:string;url:string;timeoutMs:number;
  constructor(options:{apiBase:string;reactorId:string;apiKey:string;timeoutMs?:number}) {
    if(options.apiBase!=='https://api.test.basistheory.com'||!/^[0-9a-f-]{36}$/i.test(options.reactorId)||!options.apiKey)fail('bad_signer_config');
    this.#apiKey=options.apiKey;this.url=`${options.apiBase}/reactors/${options.reactorId}/react`;this.timeoutMs=options.timeoutMs??35000;
  }
  async sign(request:SignerRequest):Promise<SignerResult> {
    const response=await fetch(this.url,{method:'POST',headers:{'content-type':'application/json','BT-API-KEY':this.#apiKey},body:JSON.stringify(request),redirect:'error',signal:AbortSignal.timeout(this.timeoutMs)});
    return {statusCode:response.status,body:await boundedJson(response) as SignerResult['body']};
  }
}

// Operator-injected environment only. Never called by the local tests or demo.
// This module does not load files, dotenv, or credentials at import time.
export function reactorSignerFromEnvironment(env:NodeJS.ProcessEnv) {
  return new ReactorSigner({apiBase:env.BT_API_BASE??'',reactorId:env.BT_SIGNER_REACTOR_ID??'',apiKey:env.BT_INVOKER_KEY??''});
}
