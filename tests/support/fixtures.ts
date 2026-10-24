import { readFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { core } from '../../packages/shared/src/core.ts';
import { MerchantStore } from '../../packages/merchant/src/store.ts';
import { MerchantService } from '../../packages/merchant/src/service.ts';
import { merchantServer } from '../../packages/merchant/src/server.ts';
import { AttemptStore } from '../../packages/spend-service/src/store.ts';
import { SpendService } from '../../packages/spend-service/src/service.ts';
import { HttpMerchantClient } from '../../packages/spend-service/src/clients.ts';
import { listenLocal } from '../../packages/shared/src/http.ts';
import type { Chain,Hex,Intent,Observation,Rules,Signer,SignerRequest,SignerResult } from '../../packages/shared/src/types.ts';

// Public Hardhat fixture. Never use this account for actual funds or Gate A provisioning.
export const PUBLIC_HARDHAT_KEY='0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
export const golden=JSON.parse(readFileSync(new URL('../../contracts/fixtures/golden-attempt.json',import.meta.url),'utf8'));
export const rules:Rules={...golden.reactor_config};
export const PUBLIC_MAC=golden.reactor_config.INTENT_HMAC_KEY as string;
export class MockChain implements Chain {
  now=golden.now;results=new Map<string,Observation>();
  async startBlock(){return 100n;}
  async observe(i:Intent):Promise<Observation>{return this.results.get(i.nonce)??(this.now>Number(i.valid_before)?{kind:'expired_unused'}:{kind:'unknown',code:'authorization_live'});}
}
export class MockSigner implements Signer {
  calls=0;requests:SignerRequest[]=[];now:()=>number;
  constructor(now:()=>number){this.now=now;}
  async sign(request:SignerRequest):Promise<SignerResult>{
    this.calls++;this.requests.push(structuredClone(request));
    if(!core.verifyMac(request.intent,request.intent_mac,PUBLIC_MAC)) return {statusCode:401,body:{ok:false,code:'bad_mac'}};
    const code=core.checkRules(request.intent,rules,this.now());
    if(code)return {statusCode:code==='bad_request'?400:403,body:{ok:false,code}};
    const account=privateKeyToAccount(PUBLIC_HARDHAT_KEY);
    const signature=await account.signTypedData(core.typedDataFor(request.intent,rules,getAddress));
    return {statusCode:200,body:{ok:true,from:account.address,signature,attempt_id:request.intent.attempt_id}};
  }
}
export async function harness() {
  const dir=mkdtempSync(join(tmpdir(),'vc-phase2-'));const chain=new MockChain();
  const merchantStore=new MerchantStore(join(dir,'merchant.sqlite'),[{id:'demo',name:'Test resource',unitAmount:'1500000',currency:'USDC'}]);
  let verifies=0,settles=0;let verifyValid=true;let settleMode='ok';
  const facilitator={
    async verify(){verifies++;return {isValid:verifyValid};},
    async settle(payload:any){
      settles++;const transaction=('0x'+settles.toString(16).padStart(64,'0')) as Hex;
      if(settleMode!=='error')chain.results.set(payload.payload.authorization.nonce,{kind:'settled',transaction});
      if(settleMode==='lost'||settleMode==='error')throw new Error('simulated_transport_loss');
      return {success:settleMode!=='pending',transaction,network:'eip155:84532',payer:payload.payload.authorization.from};
    },
  };
  const merchant=new MerchantService(merchantStore,{origin:'https://merchant.example',payTo:rules.PAYTO_ALLOWLIST,maxTimeoutSeconds:300},facilitator,chain,()=>chain.now);
  const server=merchantServer(merchant);const origin=await listenLocal(server);merchant.config.origin=origin;
  const client=new HttpMerchantClient(origin,{allowLocalHttp:true});
  const store=new AttemptStore(join(dir,'spend.sqlite'));
  const signer=new MockSigner(()=>chain.now);
  const service=new SpendService({store,merchant:client,signer,chain,rules,macKey:PUBLIC_MAC,merchantOrigin:origin,now:()=>chain.now});
  return {dir,chain,merchantStore,merchant,server,origin,client,store,signer,service,
    get settles(){return settles;},get verifies(){return verifies;},set verifyValid(v:boolean){verifyValid=v;},set settleMode(v:string){settleMode=v;},
    async order(){return client.createOrder([{productId:'demo',quantity:1}]);},
    async close(){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));store.close();merchantStore.close();rmSync(dir,{recursive:true,force:true});},
  };
}
