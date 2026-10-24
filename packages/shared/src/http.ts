import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { CheckoutError, fail } from './wire.ts';
export async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[]=[]; let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>65536) fail('request_too_large',413); chunks.push(chunk); }
  if(!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return fail('bad_json'); }
}
export function send(res: ServerResponse, status: number, value: unknown, headers: Record<string,string>={}) {
  res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers}); res.end(JSON.stringify(value));
}
export function httpServer(handler: (req: IncomingMessage,res: ServerResponse,path:string)=>Promise<void>) {
  return createServer((req,res)=>{ void handler(req,res,new URL(req.url??'/', 'http://localhost').pathname).catch(e=>{
    if(!res.headersSent) send(res,e instanceof CheckoutError?e.status:500,{code:e instanceof CheckoutError?e.code:'internal'});
    else res.destroy();
  }); });
}
export async function listenLocal(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve,reject)=>{ server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  const a=server.address(); if(!a || typeof a==='string') throw new Error('listen_failed');
  return `http://127.0.0.1:${a.port}`;
}
