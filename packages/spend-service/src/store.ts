import { openDatabase } from '../../shared/src/db.ts';
import { digest, fail } from '../../shared/src/wire.ts';
import type { Attempt, State } from '../../shared/src/types.ts';

const NEXT:Record<State,State[]>={authorized:['signing','failed_confirmed'],signing:['signed','sign_unknown','rejected'],sign_unknown:['signing','settled','failed_confirmed'],rejected:['failed_confirmed'],signed:['submitted','settled','failed_confirmed'],submitted:['settled','settlement_unknown','failed_confirmed'],settlement_unknown:['settled','failed_confirmed'],settled:[],failed_confirmed:[]};
export class AttemptStore {
  db: ReturnType<typeof openDatabase>;
  constructor(path:string) {
    this.db=openDatabase(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS attempts (
        attempt_id TEXT PRIMARY KEY, order_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('authorized','signing','sign_unknown','rejected','signed','submitted','settlement_unknown','settled','failed_confirmed')),
        intent TEXT NOT NULL CHECK(json_valid(intent)), intent_mac TEXT NOT NULL, required TEXT NOT NULL, payment_requirements_hash TEXT NOT NULL,
        nonce TEXT NOT NULL UNIQUE, chain_start_block TEXT NOT NULL, sign_calls INTEGER NOT NULL DEFAULT 0,
        uncertain_sign INTEGER NOT NULL DEFAULT 0 CHECK(uncertain_sign IN (0,1)), signature TEXT, payment_header TEXT, tx_hash TEXT, reject_code TEXT, receipt TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        CHECK(attempt_id=json_extract(intent,'$.attempt_id') AND order_id=json_extract(intent,'$.order_id') AND nonce=lower(json_extract(intent,'$.nonce'))),
        CHECK(state NOT IN ('signed','submitted') OR (signature IS NOT NULL AND payment_header IS NOT NULL)),
        CHECK(state!='settled' OR (tx_hash IS NOT NULL AND receipt IS NOT NULL))
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS one_unresolved_attempt_per_order ON attempts(order_id) WHERE state NOT IN ('settled','failed_confirmed');
      CREATE TRIGGER IF NOT EXISTS previous_attempt_must_have_failed BEFORE INSERT ON attempts
        WHEN EXISTS(SELECT 1 FROM attempts WHERE order_id=NEW.order_id AND state!='failed_confirmed')
        BEGIN SELECT RAISE(ABORT,'order_attempt_locked'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_authorization BEFORE UPDATE OF attempt_id,order_id,intent,intent_mac,required,payment_requirements_hash,nonce,chain_start_block,created_at ON attempts
        BEGIN SELECT RAISE(ABORT,'immutable_authorization'); END;
      CREATE TRIGGER IF NOT EXISTS terminal_attempt_immutable BEFORE UPDATE ON attempts WHEN OLD.state IN ('settled','failed_confirmed')
        BEGIN SELECT RAISE(ABORT,'terminal_attempt'); END;
      CREATE TRIGGER IF NOT EXISTS proof_immutable BEFORE UPDATE OF signature,payment_header ON attempts
        WHEN OLD.signature IS NOT NULL AND (NEW.signature IS NOT OLD.signature OR NEW.payment_header IS NOT OLD.payment_header)
        BEGIN SELECT RAISE(ABORT,'immutable_proof'); END;
    `);
    const allowed=Object.entries(NEXT).flatMap(([from,list])=>list.map(to=>`(OLD.state='${from}' AND NEW.state='${to}')`)).join(' OR ');
    this.db.exec(`CREATE TRIGGER IF NOT EXISTS valid_attempt_transition BEFORE UPDATE OF state ON attempts WHEN OLD.state!=NEW.state AND NOT (${allowed}) BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;`);
  }
  close(){this.db.close();}
  row(raw:any):Attempt { return {...raw,intent:JSON.parse(raw.intent),required:JSON.parse(raw.required),receipt:raw.receipt?JSON.parse(raw.receipt):null}; }
  get(attemptId:string):Attempt {const raw=this.db.prepare('SELECT * FROM attempts WHERE attempt_id=?').get(attemptId); if(!raw)return fail('attempt_not_found',404); return this.row(raw);}
  latest(orderId:string):Attempt|undefined {const raw=this.db.prepare('SELECT * FROM attempts WHERE order_id=? ORDER BY rowid DESC LIMIT 1').get(orderId); return raw?this.row(raw):undefined;}
  authorize(orderId:string,make:()=>Attempt):{created:boolean;attempt:Attempt} {
    return this.db.transaction(()=>{
      const previous=this.latest(orderId);
      if(previous&&previous.state!=='failed_confirmed') return {created:false,attempt:previous};
      const a=make();
      this.db.prepare(`INSERT INTO attempts(attempt_id,order_id,state,intent,intent_mac,required,payment_requirements_hash,nonce,chain_start_block,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(a.attempt_id,a.order_id,'authorized',JSON.stringify(a.intent),a.intent_mac,JSON.stringify(a.required),digest(a.required.accepts[0]),a.intent.nonce.toLowerCase(),a.chain_start_block,a.created_at,a.updated_at);
      return {created:true,attempt:this.get(a.attempt_id)};
    }).immediate();
  }
  transition(attemptId:string,from:State[],to:State,patch:Partial<Pick<Attempt,'signature'|'payment_header'|'tx_hash'|'reject_code'|'receipt'>>={}) {
    if(!from.every(s=>NEXT[s].includes(to))) return fail('invalid_transition');
    const entries=Object.entries(patch);
    const columns=entries.map(([k])=>`${k}=?`);
    const values=entries.map(([k,v])=>k==='receipt'&&v!==null?JSON.stringify(v):v??null);
    const assignments=['state=?','updated_at=?',...(to==='signing'?['sign_calls=sign_calls+1']:[]),...(to==='sign_unknown'?['uncertain_sign=1']:[]),...columns];
    return this.db.prepare(`UPDATE attempts SET ${assignments.join(',')} WHERE attempt_id=? AND state IN (${from.map(()=>'?').join(',')})`).run(to,new Date().toISOString(),...values,attemptId,...from).changes===1;
  }
  recoverInterrupted() {
    this.db.prepare("UPDATE attempts SET state='sign_unknown',uncertain_sign=1 WHERE state='signing'").run();
    this.db.prepare("UPDATE attempts SET state='settlement_unknown' WHERE state='submitted'").run();
    this.db.prepare("UPDATE attempts SET state='failed_confirmed' WHERE state='rejected'").run();
  }
  pending():Attempt[]{return this.db.prepare("SELECT * FROM attempts WHERE state NOT IN ('settled','failed_confirmed') ORDER BY rowid").all().map(r=>this.row(r));}
}
