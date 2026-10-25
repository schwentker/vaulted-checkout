import { httpServer,body,send } from '../../shared/src/http.ts';
import { fields,fail,id } from '../../shared/src/wire.ts';
import type { SpendService } from './service.ts';
export function spendServer(service:SpendService) {
  return httpServer(async(req,res,path)=>{
    if(req.method==='GET'&&path==='/products') return send(res,200,await service.merchant.products());
    if(req.method==='POST'&&path==='/orders') { const b=fields(await body(req),['items']);return send(res,201,await service.merchant.createOrder(b.items as any)); }
    const match=/^\/orders\/([^/]+)$/.exec(path);
    if(req.method==='GET'&&match) {const orderId=id(decodeURIComponent(match[1]!));const a=service.store.latest(orderId);return send(res,200,{order:await service.merchant.order(orderId),...(a?{payment:service.public(a)}:{})});}
    if(req.method==='POST'&&path==='/pay') {const b=fields(await body(req),['orderId']);const result=await service.pay(id(b.orderId));return send(res,result.state==='settled'?200:202,result);}
    return fail('not_found',404);
  });
}
