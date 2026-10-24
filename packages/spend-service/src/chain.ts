import { createPublicClient,http,parseAbi,parseAbiItem,parseEventLogs } from 'viem';
import { baseSepolia } from 'viem/chains';
import { equalAddress } from '../../shared/src/wire.ts';
import type { Chain,Hex,Intent,Observation } from '../../shared/src/types.ts';

const ASSET='0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
const ABI=parseAbi(['function authorizationState(address authorizer, bytes32 nonce) view returns (bool)','event Transfer(address indexed from,address indexed to,uint256 value)']);
const USED=parseAbiItem('event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)');
const rpcClient=(url:string)=>createPublicClient({chain:baseSepolia,transport:http(url,{retryCount:0,timeout:10000})});
export class RpcChain implements Chain {
  client:ReturnType<typeof rpcClient>;
  constructor(url='https://sepolia.base.org') {
    const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw new Error('bad_rpc_url');
    this.client=rpcClient(url);
  }
  async startBlock() {if(await this.client.getChainId()!==84532)throw new Error('wrong_chain');const head=await this.client.getBlockNumber();return head>128n?head-128n:0n;}
  async observe(intent:Intent,startBlock:bigint):Promise<Observation> {
    if(intent.chain_id!=='84532'||!equalAddress(intent.asset,ASSET)||await this.client.getChainId()!==84532)throw new Error('wrong_chain');
    const block=await this.client.getBlock({blockTag:'finalized'});
    if(block.number===null)throw new Error('missing_finalized_block');
    const used=await this.client.readContract({address:ASSET,abi:ABI,functionName:'authorizationState',args:[intent.from as Hex,intent.nonce as Hex],blockNumber:block.number});
    if(!used) return block.timestamp>BigInt(intent.valid_before)?{kind:'expired_unused'}:{kind:'unknown',code:'authorization_live'};
    // Bound each lookup. If a provider cannot supply the evidence, retain uncertainty.
    if(block.number-startBlock>100000n)return {kind:'unknown',code:'scan_range_exceeded'};
    for(let from=startBlock;from<=block.number;from+=5000n) {
      const to=from+4999n<block.number?from+4999n:block.number;
      const events=await this.client.getLogs({address:ASSET,event:USED,args:{authorizer:intent.from as Hex,nonce:intent.nonce as Hex},fromBlock:from,toBlock:to});
      for(const event of events) {
        if(!event.transactionHash)continue;
        const receipt=await this.client.getTransactionReceipt({hash:event.transactionHash});
        if(receipt.status!=='success'||receipt.blockNumber>block.number)continue;
        const transfers=parseEventLogs({abi:ABI,eventName:'Transfer',logs:receipt.logs.filter(l=>equalAddress(l.address,ASSET)),strict:true});
        if(transfers.some(t=>equalAddress(t.args.from,intent.from)&&equalAddress(t.args.to,intent.to)&&t.args.value===BigInt(intent.value))) return {kind:'settled',transaction:event.transactionHash};
      }
    }
    return {kind:'unknown',code:'consumed_nonce_unmatched'};
  }
}
