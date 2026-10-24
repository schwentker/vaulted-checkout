import { openDatabase } from '../../shared/src/db.ts';
import { randomUUID } from 'node:crypto';
import { fail } from '../../shared/src/wire.ts';
import type { Product, Order, PaymentPayload, Receipt } from '../../shared/src/types.ts';

export type PaymentRow = { id:string; order_id:string; auth_key:string; auth_digest:string; state:'processing'|'settlement_unknown'|'verify_rejected'|'failed_confirmed'|'paid'; payload:PaymentPayload; chain_start_block:string; receipt:Receipt|null };
export class MerchantStore {
  db: ReturnType<typeof openDatabase>;
  constructor(path:string, products:Product[]) {
    this.db=openDatabase(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, data TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, data TEXT NOT NULL, amount TEXT NOT NULL, paid INTEGER NOT NULL DEFAULT 0, receipt TEXT) STRICT;
      CREATE TABLE IF NOT EXISTS merchant_payments (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), auth_key TEXT NOT NULL UNIQUE,
        auth_digest TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('processing','settlement_unknown','verify_rejected','failed_confirmed','paid')),
        payload TEXT NOT NULL, chain_start_block TEXT NOT NULL, receipt TEXT
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS one_live_merchant_payment ON merchant_payments(order_id) WHERE state NOT IN ('verify_rejected','failed_confirmed');
      CREATE TRIGGER IF NOT EXISTS immutable_order BEFORE UPDATE OF amount, data ON orders BEGIN SELECT RAISE(ABORT,'immutable_order'); END;
      CREATE TRIGGER IF NOT EXISTS no_unpay BEFORE UPDATE ON orders WHEN OLD.paid=1 AND (NEW.paid!=1 OR NEW.receipt IS NOT OLD.receipt) BEGIN SELECT RAISE(ABORT,'paid_order_immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_merchant_auth BEFORE UPDATE OF order_id,auth_key,auth_digest,payload,chain_start_block ON merchant_payments BEGIN SELECT RAISE(ABORT,'immutable_payment'); END;
    `);
    const insert=this.db.prepare('INSERT OR IGNORE INTO products VALUES (?,?)');
    for(const p of products) insert.run(p.id,JSON.stringify(p));
  }
  close(){this.db.close();}
  products():Product[]{return this.db.prepare('SELECT data FROM products ORDER BY id').all().map((r:any)=>JSON.parse(r.data));}
  createOrder(items:{productId:string;quantity:number}[]):Order {
    if(!Array.isArray(items)||items.length<1||items.length>20) return fail('bad_items');
    const lines=items.map(item=>{
      if(!item || Object.keys(item).some(k=>!['productId','quantity'].includes(k)) || !Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>100) return fail('bad_items');
      const row=this.db.prepare('SELECT data FROM products WHERE id=?').get(item.productId) as any;
      if(!row) return fail('unknown_product');
      const p=JSON.parse(row.data) as Product;
      return {productId:p.id,quantity:item.quantity,unitAmount:p.unitAmount};
    });
    const amount=lines.reduce((s,i)=>s+BigInt(i.unitAmount)*BigInt(i.quantity),0n).toString();
    const order:Order={id:'ord_'+randomUUID(),items:lines,amount,currency:'USDC',paymentStatus:'unpaid'};
    this.db.prepare('INSERT INTO orders(id,data,amount) VALUES (?,?,?)').run(order.id,JSON.stringify(order),amount);
    return order;
  }
  order(id:string):Order {
    const row=this.db.prepare('SELECT * FROM orders WHERE id=?').get(id) as any;
    if(!row) return fail('order_not_found',404);
    const pending=this.db.prepare("SELECT 1 FROM merchant_payments WHERE order_id=? AND state IN ('processing','settlement_unknown')").get(id);
    return {...JSON.parse(row.data),paymentStatus:row.paid?'paid':pending?'pending':'unpaid',...(row.receipt?{receipt:JSON.parse(row.receipt)}:{})};
  }
  row(raw:any):PaymentRow {return {...raw,payload:JSON.parse(raw.payload),receipt:raw.receipt?JSON.parse(raw.receipt):null};}
  claim(orderId:string,key:string,authDigest:string,payload:PaymentPayload,startBlock:bigint):{owned:boolean;payment:PaymentRow} {
    return this.db.transaction(()=>{
      this.order(orderId);
      const active=this.db.prepare("SELECT * FROM merchant_payments WHERE order_id=? AND state NOT IN ('verify_rejected','failed_confirmed')").get(orderId) as any;
      if(active) {
        if(active.auth_key!==key||active.auth_digest!==authDigest) return fail('order_payment_conflict',409);
        return {owned:false,payment:this.row(active)};
      }
      const old=this.db.prepare('SELECT * FROM merchant_payments WHERE auth_key=?').get(key) as any;
      if(old) {
        if(old.order_id!==orderId||old.auth_digest!==authDigest) return fail('authorization_reused',409);
        if(old.state==='failed_confirmed') return fail('authorization_expired',409);
        this.db.prepare("UPDATE merchant_payments SET state='processing' WHERE id=? AND state='verify_rejected'").run(old.id);
        return {owned:true,payment:{...this.row(old),state:'processing' as const}};
      }
      const payment:PaymentRow={id:randomUUID(),order_id:orderId,auth_key:key,auth_digest:authDigest,state:'processing',payload,chain_start_block:String(startBlock),receipt:null};
      this.db.prepare('INSERT INTO merchant_payments VALUES (?,?,?,?,?,?,?,NULL)').run(payment.id,orderId,key,authDigest,payment.state,JSON.stringify(payload),String(startBlock));
      return {owned:true,payment};
    }).immediate();
  }
  mark(id:string,state:'settlement_unknown'|'verify_rejected') {
    this.db.prepare("UPDATE merchant_payments SET state=? WHERE id=? AND state='processing'").run(state,id);
  }
  complete(payment:PaymentRow,receipt:Receipt) {
    this.db.transaction(()=>{
      this.db.prepare("UPDATE merchant_payments SET state='paid',receipt=? WHERE id=? AND state IN ('processing','settlement_unknown')").run(JSON.stringify(receipt),payment.id);
      this.db.prepare('UPDATE orders SET paid=1,receipt=? WHERE id=? AND paid=0').run(JSON.stringify(receipt),payment.order_id);
    }).immediate();
  }
  recoverInterrupted(){this.db.prepare("UPDATE merchant_payments SET state='settlement_unknown' WHERE state='processing'").run();}
  expire(paymentId:string){this.db.prepare("UPDATE merchant_payments SET state='failed_confirmed' WHERE id=? AND state='settlement_unknown'").run(paymentId);}
  unknowns():PaymentRow[]{return this.db.prepare("SELECT * FROM merchant_payments WHERE state='settlement_unknown'").all().map(r=>this.row(r));}
}
