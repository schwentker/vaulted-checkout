// Human-operated runtime only. Never run this entry point in an agent session.
// Secrets are supplied by the operator's environment, never by .env file loading.
import { SpendService } from '../packages/spend-service/src/service.ts';
import { AttemptStore } from '../packages/spend-service/src/store.ts';
import { HttpMerchantClient,reactorSignerFromEnvironment } from '../packages/spend-service/src/clients.ts';
import { RpcChain } from '../packages/spend-service/src/chain.ts';
import { spendServer } from '../packages/spend-service/src/server.ts';
const env=process.env;
const port=Number(env.SPEND_PORT??4001);
if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('bad_port');
const origin=env.MERCHANT_ORIGIN??'http://127.0.0.1:4000';
const store=new AttemptStore(env.SPEND_DB_PATH??'spend.sqlite');
const service=new SpendService({store,merchant:new HttpMerchantClient(origin,{allowLocalHttp:true}),signer:reactorSignerFromEnvironment(env),chain:new RpcChain(env.RPC_URL),merchantOrigin:origin,macKey:env.INTENT_HMAC_KEY??'',rules:{AUDIENCE:'vc-signer',CHAIN_ID:'84532',ASSET:'0x036CbD53842c5426634e7929541eC2318f3dCF7e',DOMAIN_NAME:'USDC',DOMAIN_VERSION:'2',WALLET_ADDRESS:env.WALLET_ADDRESS??'',PAYTO_ALLOWLIST:env.MERCHANT_PAYTO??'',POLICY_VERSION:env.POLICY_VERSION??'p1',MAX_AMOUNT:env.MAX_AMOUNT??'5000000',MAX_WINDOW_SECONDS:'600'}});
await service.recover();
const server=spendServer(service);const stop=service.startReconcileJob();
server.listen(port,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{stop();server.close(()=>store.close());});
