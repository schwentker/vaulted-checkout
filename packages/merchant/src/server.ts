import { decodePaymentSignatureHeader } from '@x402/core/http';
import { httpServer,body,send } from '../../shared/src/http.ts';
import { fields,fail,id } from '../../shared/src/wire.ts';
import type { MerchantService } from './service.ts';
export function merchantServer(service:MerchantService) {
  return httpServer(async(req,res,path)=>{
    if(req.method==='GET'&&path==='/.well-known/commerce-manifest') return send(res,200,service.manifest());
    if(req.method==='GET'&&path==='/api/products') return send(res,200,service.store.products());
    if(req.method==='POST'&&path==='/api/orders') { const b=fields(await body(req),['items']); return send(res,201,service.store.createOrder(b.items as any)); }
    const m=/^\/api\/orders\/([^/]+)(\/pay)?$/.exec(path);
    if(!m) return fail('not_found',404);
    const orderId=id(decodeURIComponent(m[1]!));
    if(req.method==='GET'&&!m[2]) return send(res,200,service.store.order(orderId));
    if(req.method==='POST'&&m[2]) {
      fields(await body(req),[]);
      const header=req.headers['payment-signature'];
      if(!header) return send(res,402,service.challenge(orderId),{'PAYMENT-REQUIRED':service.challengeHeader(orderId)});
      if(typeof header!=='string'||header.length>16384) return fail('bad_payment');
      let payload; try {payload=decodePaymentSignatureHeader(header);} catch {return fail('bad_payment');}
      const result=await service.pay(orderId,payload);
      return send(res,result.status,result.body,result.paymentResponse?{'PAYMENT-RESPONSE':result.paymentResponse}:{});
    }
    return fail('not_found',404);
  });
}
