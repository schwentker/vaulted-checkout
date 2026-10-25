// CC-1 test support: the in-process spend harness behind its real HTTP server, the demo catalog,
// and the signer Reactor behind a local stand-in for the Basis Theory APIs. Public fixture keys only.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { harness,golden,PUBLIC_HARDHAT_KEY } from './fixtures.ts';
import { spendServer } from '../../packages/spend-service/src/server.ts';
import { listenLocal } from '../../packages/shared/src/http.ts';
import type { Signer,SignerRequest,SignerResult } from '../../packages/shared/src/types.ts';

const require=createRequire(import.meta.url);
const reactor=require('../../reactors/signer/reactor.js') as (event:unknown)=>Promise<{res:{statusCode:number;body:unknown}}>;
const BT='https://api.test.basistheory.com';
const realFetch=globalThis.fetch;
globalThis.fetch=(async(input:any,init?:any)=>{
  const url=String(input);
  if(!url.startsWith(`${BT}/tokens/`)) return realFetch(input,init);
  if(url!==`${BT}/tokens/tok_fixture`||init?.headers?.['BT-API-KEY']!=='runtime-key') return new Response('{}',{status:403});
  return new Response(JSON.stringify({id:'tok_fixture',data:PUBLIC_HARDHAT_KEY}),{status:200});
}) as typeof fetch;

export class LocalReactorSigner implements Signer {
  calls=0;config:Record<string,string>;
  constructor(config:Record<string,string>){this.config=config;}
  async sign(request:SignerRequest):Promise<SignerResult> {
    this.calls++;
    const out=await reactor({req:JSON.parse(JSON.stringify(request)),configuration:{...this.config},applicationOptions:{apiKey:'runtime-key',baseUrl:BT}});
    return {statusCode:out.res.statusCode,body:JSON.parse(JSON.stringify(out.res.body))};
  }
}
export const CATALOG=[
  {id:'paper-tox-2026',name:'Paper: early hepatotoxicity signals in kinase inhibitors (PDF)',unitAmount:'1500000',currency:'USDC'},
  {id:'dataset-tox-full',name:'Full assay dataset, 40k compounds (CSV)',unitAmount:'7500000',currency:'USDC'},
];
// signer 'reactor': vault cap 5 USDC, spend cap 10 USDC, so the dataset refusal comes from the Reactor.
export async function buyerSetup(t:any,signer:'mock'|'reactor'='mock') {
  const h=await harness();
  const insert=h.merchantStore.db.prepare('INSERT OR IGNORE INTO products VALUES (?,?)');
  for(const p of CATALOG) insert.run(p.id,JSON.stringify(p));
  h.service.rules.MAX_AMOUNT='10000000';
  let reactorSigner:LocalReactorSigner|undefined;
  if(signer==='reactor') {
    reactorSigner=new LocalReactorSigner({...golden.reactor_config,WALLET_TOKEN_ID:'tok_fixture',MAX_AMOUNT:'5000000'});
    h.service.signer=reactorSigner;
    const realNow=Date.now;Date.now=()=>h.chain.now*1000;t.after(()=>{Date.now=realNow;});
  }
  const server=spendServer(h.service);let requests=0;server.on('request',()=>{requests++;});
  const origin=await listenLocal(server);
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await h.close();});
  return {h,origin,reactorSigner,get requests(){return requests;}};
}
export const LEAK=/intent_mac|"intent"|nonce|payment_header|PAYMENT-|signature|0x[0-9a-fA-F]{130}/i;
export async function fakeServer(t:any,handler:(req:any,res:any,body:string)=>void) {
  const server=createServer((req,res)=>{let b='';req.on('data',c=>{b+=c;});req.on('end',()=>handler(req,res,b));});
  const origin=await listenLocal(server);
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
  return origin;
}
