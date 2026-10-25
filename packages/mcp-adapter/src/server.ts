// stdio MCP server. Env: SPEND_ORIGIN (default http://127.0.0.1:4001, loopback http only). No other config, no secrets.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema,ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SpendClient,TOOLS,handle,spendOrigin } from './tools.ts';

let origin:string;
try { origin=spendOrigin(process.env.SPEND_ORIGIN); } catch { process.stderr.write('mcp-adapter: SPEND_ORIGIN must be http://127.0.0.1 or http://localhost\n'); process.exit(2); }
const client=new SpendClient(origin);
const server=new Server({name:'vaulted-checkout',version:'0.2.0'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:TOOLS}));
server.setRequestHandler(CallToolRequestSchema,async req=>{
  const {isError,value}=await handle(client,req.params.name,req.params.arguments);
  return {isError,content:[{type:'text',text:JSON.stringify(value)}]};
});
await server.connect(new StdioServerTransport());
