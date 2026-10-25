// MCP adapter core: 4 fixed tools over the spend-service HTTP API. Untrusted side of the system.
// Tool args never choose a URL, payee, amount or header. Every output is built from an explicit allowlist.
import { id } from '../../shared/src/wire.ts';

export const TOOL_NAMES=['list_products','create_order','pay_order','get_order'] as const;
export type ToolName=typeof TOOL_NAMES[number];
export const TIMEOUT_MS=30_000;
export const MAX_BYTES=65_536;
export const EXPLORER='https://sepolia.basescan.org/tx/';
export const REASONS:Record<string,string>={rule_amount:'over the per-payment limit set in the vault',rule_payto:'payee not on the vault allowlist'};
const DEFAULT_REASON='refused by payment policy';
const PENDING_STATES=['authorized','signing','sign_unknown','signed','submitted','settlement_unknown','rejected'];
const PENDING_HINT='payment outcome not final yet; check again with get_order, do not create a new order';

export const TOOLS=[
  {name:'list_products',description:'List products in the approved store with prices in USDC.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'create_order',description:'Create an order for one product. Price comes from the store, not from you.',inputSchema:{type:'object',properties:{productId:{type:'string',description:'Product id from list_products'},quantity:{type:'integer',minimum:1,maximum:10}},required:['productId','quantity'],additionalProperties:false}},
  {name:'pay_order',description:'Pay an order. Payment rules are enforced outside the agent; a refusal is final.',inputSchema:{type:'object',properties:{orderId:{type:'string'}},required:['orderId'],additionalProperties:false}},
  {name:'get_order',description:'Get the status of an order and its payment.',inputSchema:{type:'object',properties:{orderId:{type:'string'}},required:['orderId'],additionalProperties:false}},
];

export type Settled={status:'settled';orderId:string;amount:string;txHash:string;explorer:string};
export type Refused={status:'refused';orderId:string;code:string;reason:string};
export type Pending={status:'pending';orderId:string;state:string;hint:string};
export type ErrorOut={status:'error';code:string};
export type PaymentOut=Settled|Refused|Pending;

export class AdapterError extends Error { code:string; constructor(code:string){super(code);this.code=code;} }
const bad=(code:string):never=>{throw new AdapterError(code);};
const CODE=/^[a-z0-9_]{1,64}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;

export function spendOrigin(raw:string|undefined=process.env.SPEND_ORIGIN):string {
  let u:URL;
  try { u=new URL(raw??'http://127.0.0.1:4001'); } catch { return bad('bad_spend_origin'); }
  if(u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash) bad('bad_spend_origin');
  return u.origin;
}
function safeId(v:unknown,code='bad_id'):string { try { return id(v); } catch { return bad(code); } }
function obj(v:unknown):Record<string,unknown> { if(!v||typeof v!=='object'||Array.isArray(v)) bad('bad_response'); return v as Record<string,unknown>; }
function args(v:unknown,names:string[]):Record<string,unknown> {
  const o=v===undefined?{}:v;
  if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!names.includes(k))) bad('bad_arguments');
  return o as Record<string,unknown>;
}
// Atomic USDC (6 decimals) to a decimal string, string math only. 1500000 -> "1.50".
export function usdc(atomic:unknown):string {
  if(typeof atomic!=='string'||!/^(0|[1-9][0-9]{0,40})$/.test(atomic)) return bad('bad_amount');
  const p=atomic.padStart(7,'0');
  const frac=p.slice(-6).replace(/0+$/,'').padEnd(2,'0');
  return `${p.slice(0,-6)}.${frac}`;
}

export function payment(v:unknown):PaymentOut {
  const a=obj(v);const orderId=safeId(a.orderId,'bad_response');
  if(a.state==='settled') {
    const r=obj(a.receipt);
    if(typeof r.transaction!=='string'||!HASH.test(r.transaction)) bad('bad_response');
    const tx=r.transaction as string;
    return {status:'settled',orderId,amount:usdc(a.amount),txHash:tx,explorer:EXPLORER+tx};
  }
  if(a.state==='failed_confirmed') {
    const code=typeof a.code==='string'&&CODE.test(a.code)?a.code:'refused';
    return {status:'refused',orderId,code,reason:REASONS[code]??DEFAULT_REASON};
  }
  if(typeof a.state==='string'&&PENDING_STATES.includes(a.state)) return {status:'pending',orderId,state:a.state,hint:PENDING_HINT};
  return bad('bad_response');
}

export type Fetch=typeof fetch;
export class SpendClient {
  origin:string; fetch:Fetch; requests=0;
  constructor(origin:string,f:Fetch=globalThis.fetch){this.origin=spendOrigin(origin);this.fetch=f;}
  async request(path:string,init:{method?:string;body?:unknown}={}):Promise<{status:number;value:unknown}> {
    this.requests++;
    let res:Response;
    try {
      res=await this.fetch(this.origin+path,{method:init.method??'GET',redirect:'error',signal:AbortSignal.timeout(TIMEOUT_MS),
        ...(init.body!==undefined?{headers:{'content-type':'application/json'},body:JSON.stringify(init.body)}:{})});
    } catch(e) { return bad((e as Error)?.name==='TimeoutError'?'spend_timeout':'spend_unavailable'); }
    const chunks:Uint8Array[]=[];let size=0;
    const reader=res.body?.getReader();
    if(reader) {
      try {
        for(;;) {
          const {done,value}=await reader.read();
          if(done) break;
          size+=value.byteLength;
          if(size>MAX_BYTES) { await reader.cancel().catch(()=>{}); return bad('response_too_large'); }
          chunks.push(value);
        }
      } catch(e) { if(e instanceof AdapterError) throw e; return bad((e as Error)?.name==='TimeoutError'?'spend_timeout':'spend_unavailable'); }
    }
    let value:unknown;
    try { value=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return bad('bad_response'); }
    return {status:res.status,value};
  }
}
function httpError(status:number,value:unknown):never {
  const code=value&&typeof value==='object'&&typeof (value as any).code==='string'&&CODE.test((value as any).code)?(value as any).code:`http_${status}`;
  return bad(code);
}
function text(v:unknown,max=200):string { return typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):bad('bad_response'); }
function order(v:unknown) {
  const o=obj(v);
  if(!Array.isArray(o.items)||o.currency!=='USDC'||!['unpaid','pending','paid'].includes(o.paymentStatus as string)) bad('bad_response');
  const items=(o.items as unknown[]).map(i=>{const x=obj(i);if(!Number.isSafeInteger(x.quantity))bad('bad_response');return {productId:safeId(x.productId,'bad_response'),quantity:x.quantity as number};});
  return {orderId:safeId(o.id,'bad_response'),amount:usdc(o.amount),currency:'USDC' as const,paymentStatus:o.paymentStatus as string,items};
}

export async function callTool(client:SpendClient,name:unknown,raw:unknown):Promise<unknown> {
  switch(name) {
    case 'list_products': {
      args(raw,[]);
      const {status,value}=await client.request('/products');
      if(status!==200||!Array.isArray(value)) return httpError(status,value);
      return {status:'ok',products:value.slice(0,50).map(p=>{const x=obj(p);if(x.currency!=='USDC')bad('bad_response');return {productId:safeId(x.id,'bad_response'),name:text(x.name),price:usdc(x.unitAmount),currency:'USDC'};})};
    }
    case 'create_order': {
      const a=args(raw,['productId','quantity']);
      const productId=safeId(a.productId,'bad_product_id');
      if(!Number.isSafeInteger(a.quantity)||(a.quantity as number)<1||(a.quantity as number)>10) bad('bad_quantity');
      const {status,value}=await client.request('/orders',{method:'POST',body:{items:[{productId,quantity:a.quantity}]}});
      if(status!==201) return httpError(status,value);
      return {status:'created',...order(value)};
    }
    case 'pay_order': {
      const orderId=safeId(args(raw,['orderId']).orderId,'bad_order_id');
      const {status,value}=await client.request('/pay',{method:'POST',body:{orderId}});
      if(status!==200&&status!==202) return httpError(status,value);
      return payment(value);
    }
    case 'get_order': {
      const orderId=safeId(args(raw,['orderId']).orderId,'bad_order_id');
      const {status,value}=await client.request(`/orders/${encodeURIComponent(orderId)}`);
      if(status!==200) return httpError(status,value);
      const v=obj(value);
      return {status:'order',...order(v.order),...(v.payment!==undefined?{payment:payment(v.payment)}:{})};
    }
    default: return bad('unknown_tool');
  }
}

// Never throws: every failure becomes {status:'error',code} with a fixed code.
export async function handle(client:SpendClient,name:unknown,raw:unknown):Promise<{isError:boolean;value:unknown}> {
  try { return {isError:false,value:await callTool(client,name,raw)}; }
  catch(e) { return {isError:true,value:{status:'error',code:e instanceof AdapterError?e.code:'internal'} satisfies ErrorOut}; }
}
