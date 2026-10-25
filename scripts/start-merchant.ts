// Operator-only runtime entry point. This does not load .env files.
import { MerchantStore } from '../packages/merchant/src/store.ts';
import { MerchantService } from '../packages/merchant/src/service.ts';
import { merchantServer } from '../packages/merchant/src/server.ts';
import { publicFacilitator } from '../packages/merchant/src/facilitator.ts';
import { RpcChain } from '../packages/spend-service/src/chain.ts';
const port=Number(process.env.MERCHANT_PORT??4000);
if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('bad_port');
const origin=process.env.MERCHANT_ORIGIN??`http://127.0.0.1:${port}`;
const payTo=process.env.MERCHANT_PAYTO??'';
const store=new MerchantStore(process.env.MERCHANT_DB_PATH??'merchant.sqlite',[{id:'demo',name:'Demo resource',unitAmount:'1500000',currency:'USDC'}]);
store.recoverInterrupted();
const service=new MerchantService(store,{origin,payTo,maxTimeoutSeconds:300},publicFacilitator(),new RpcChain(process.env.RPC_URL));
const server=merchantServer(service);const stop=service.startReconcileJob();
server.listen(port,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{stop();server.close(()=>store.close());});
