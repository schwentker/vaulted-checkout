// Independent black-box checks. Do not import adapter code or Claude's test helpers.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { harness, golden } from '../support/fixtures.ts';
import { spendServer } from '../../packages/spend-service/src/server.ts';
import { listenLocal } from '../../packages/shared/src/http.ts';
import type { Signer, SignerRequest, SignerResult } from '../../packages/shared/src/types.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ENTRY = fileURLToPath(new URL('../../packages/mcp-adapter/src/server.ts', import.meta.url));
const require = createRequire(import.meta.url);
const tools = ['create_order', 'get_order', 'list_products', 'pay_order'];
const hash = '0x' + '1'.repeat(64);
function noLeaks(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  assert.ok(!/(?:intent_mac|payment_header|PAYMENT-(?:SIGNATURE|REQUIRED|RESPONSE)|\bnonce\b|\bsignature\b|\bintent\b|BT_[A-Z_]*KEY|GEMINI_API_KEY|0x[0-9a-fA-F]{130})/i.test(text), 'adapter leaked a prohibited field or proof');
  assert.ok(!text.includes('UPSTREAM_PRIVATE_SENTINEL'), 'adapter echoed unallowlisted upstream data');
}
function exact(value: any, keys: string[]) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}
function tagged(value: any, status: string, keys: string[]) {
  exact(value, ['status', ...keys]);
  assert.equal(value.status, status, 'result status must match its fixed variant');
}
const resultStatuses: Record<string, readonly string[]> = {
  list_products:['ok','error'], create_order:['created','error'],
  get_order:['order','error'], pay_order:['settled','refused','pending','error'],
};
function assertResultStatus(value: any, name: string) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'result must be a tagged object');
  const allowed = Object.hasOwn(resultStatuses, name) ? resultStatuses[name]! : ['error'];
  assert.ok(Object.hasOwn(value, 'status') && allowed.includes(value.status), 'unknown or invalid result status');
  if (name === 'get_order' && Object.hasOwn(value, 'payment')) {
    assert.ok(value.payment && typeof value.payment === 'object' && !Array.isArray(value.payment), 'payment must be a tagged object');
    assert.ok(Object.hasOwn(value.payment, 'status') && ['settled','refused','pending'].includes(value.payment.status), 'unknown or invalid payment status');
  }
}
async function close(server: Server) {
  server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
async function adapter(t: TestContext, origin: string, invalidOrigin = false) {
  assert.ok(existsSync(ENTRY), 'CC-1 adapter is absent. Acceptance is RED until packages/mcp-adapter/src/server.ts lands.');
  // No inherited application environment, credentials, or .env loading.
  const transport = new StdioClientTransport({ command:process.execPath, args:['packages/mcp-adapter/src/server.ts'], cwd:ROOT, env:{ SPEND_ORIGIN:origin }, stderr:'pipe' });
  let stderr = ''; transport.stderr?.on('data', data => { stderr += String(data); });
  const client = new Client({ name:'independent-cx-acceptance', version:'1.0.0' });
  t.after(async () => { await client.close(); await transport.close(); noLeaks(stderr); });
  try { await client.connect(transport, { timeout:3000 }); }
  catch (error: any) {
    if (!invalidOrigin) throw error;
    assert.ok(!/timed?\s*out|timeout/i.test(String(error)), 'invalid origin must reject explicitly, not time out');
    return null;
  }
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments:args }, undefined, { timeout:5000 });
    noLeaks(result);
    const content = result.content as any[];
    assert.ok(Array.isArray(content) && content.length === 1 && content[0].type === 'text', 'one JSON text result required');
    const value = JSON.parse(content[0].text);
    assertResultStatus(value, name);
    if (result.structuredContent !== undefined) assert.deepEqual(result.structuredContent, value);
    return value;
  };
  return { client, call };
}
async function setup(t: TestContext) {
  const h = await harness(); t.after(() => h.close());
  const server = spendServer(h.service); let requests = 0;
  const headers: Record<string, unknown>[] = [];
  server.on('request', req => { requests++; headers.push(req.headers); });
  const origin = await listenLocal(server); t.after(() => close(server));
  const a = await adapter(t, origin); assert.ok(a);
  return { h, a, headers, get requests() { return requests; } };
}
async function mayReject(a: { call: (name:string, args:Record<string,unknown>) => Promise<any> }, name:string, args:Record<string,unknown>) {
  try { return await a.call(name,args); }
  catch (error) {
    assert.ok(error instanceof McpError && [-32601,-32602].includes(error.code), 'expected explicit MCP input/tool rejection');
    noLeaks(error.message);
    return undefined;
  }
}
function orderId(value: any) {
  const id = value.orderId ?? value.id;
  assert.match(id, /^[A-Za-z0-9_-]{1,128}$/); return id as string;
}
function assertOrder(value: any, status: 'created' | 'order') {
  assertResultStatus(value, status === 'created' ? 'create_order' : 'get_order');
  assert.equal(value.status, status);
  orderId(value);
  const allowed = ['status','id','orderId','items','amount','currency','paymentStatus','payment'];
  assert.ok(Object.keys(value).every(key => allowed.includes(key)), 'order fields must be allowlisted');
  assert.equal(value.currency, 'USDC'); assert.equal(typeof value.amount, 'string');
  assert.equal(typeof value.paymentStatus, 'string');
  if (value.items) for (const item of value.items) {
    exact(item, ['productId','quantity','unitAmount']); assert.equal(typeof item.productId, 'string'); assert.ok(Number.isInteger(item.quantity));
  }
}
function assertSettled(value: any, id: string) {
  tagged(value, 'settled', ['orderId','amount','txHash','explorer']);
  assert.equal(value.orderId, id); assert.match(value.amount, /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/);
  const [whole,fraction = ''] = value.amount.split('.');
  assert.equal(BigInt(whole)*1_000_000n + BigInt(fraction.padEnd(6,'0')), 1_500_000n);
  assert.match(value.txHash, /^0x[0-9a-fA-F]{64}$/);
  assert.equal(value.explorer, `https://sepolia.basescan.org/tx/${value.txHash}`);
}

test('result tags reject missing, unknown, and wrong-variant statuses without allowing extra fields', () => {
  const cases: [string,string,Record<string,unknown>][] = [
    ['list_products','ok',{products:[]}],
    ['create_order','created',{id:'ord_fixture',amount:'1.5',currency:'USDC',paymentStatus:'unpaid'}],
    ['get_order','order',{id:'ord_fixture',amount:'1.5',currency:'USDC',paymentStatus:'unpaid'}],
    ['pay_order','settled',{orderId:'ord_fixture',amount:'1.5',txHash:hash,explorer:`https://sepolia.basescan.org/tx/${hash}`}],
    ['pay_order','refused',{orderId:'ord_fixture',code:'rule_amount',reason:'over the per-payment limit set in the vault'}],
    ['pay_order','pending',{orderId:'ord_fixture',state:'settlement_unknown',hint:'pending'}],
    ['pay_order','error',{code:'bad_request'}],
  ];
  for (const [name,status,fields] of cases) {
    const value = {status,...fields}, keys = Object.keys(fields);
    tagged(value,status,keys); assertResultStatus(value,name);
    assert.throws(() => tagged({...value,status:'unknown'},status,keys));
    assert.throws(() => assertResultStatus({...value,status:'unknown'},name));
    assert.throws(() => tagged({...value,status:status === 'error' ? 'ok' : 'error'},status,keys));
    assert.throws(() => tagged(fields,status,keys));
    assert.throws(() => assertResultStatus(fields,name));
    assert.throws(() => tagged({...value,extra:'forbidden'},status,keys));
  }
  assert.throws(() => assertResultStatus({status:'settled'},'list_products'));
  for (const status of ['unknown','ok','error',undefined]) {
    assert.throws(() => assertResultStatus({status:'order',payment:{status}},'get_order'));
  }
});

test('adapter advertises exactly four tools, lists products, creates and reads an order', async t => {
  const { h, a } = await setup(t);
  const listed = await a.client.listTools(); assert.equal(listed.nextCursor, undefined);
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), tools);
  for (const tool of listed.tools) {
    assert.equal(tool.inputSchema.type, 'object');
    const expected = tool.name === 'create_order' ? ['productId','quantity'] : tool.name === 'list_products' ? [] : ['orderId'];
    assert.deepEqual(Object.keys(tool.inputSchema.properties ?? {}).sort(), expected.sort());
  }
  const result = await a.call('list_products'); tagged(result, 'ok', ['products']);
  const products = result.products;
  assert.equal(products.length, 1);
  exact(products[0], ['id','name','unitAmount','currency']);
  assert.equal(products[0].id, 'demo'); assert.equal(products[0].name, 'Test resource'); assert.equal(products[0].currency, 'USDC');
  const created = await a.call('create_order', { productId:'demo', quantity:1 }); assertOrder(created, 'created');
  const fetched = await a.call('get_order', { orderId:orderId(created) });
  assertOrder(fetched, 'order');
  const { status:createdStatus, ...createdOrder } = created;
  const { status:fetchedStatus, ...fetchedOrder } = fetched;
  assert.deepEqual(fetchedOrder, createdOrder);
  const maximum = await a.call('create_order', { productId:'demo', quantity:10 }); assertOrder(maximum, 'created');
  assert.equal((await h.client.order(orderId(maximum))).amount, '15000000');
});

test('adapter settlement is sanitized and duplicate pay returns the identical receipt once', async t => {
  const { h, a } = await setup(t); const order = await h.order();
  const first = await a.call('pay_order', { orderId:order.id }); assertSettled(first, order.id);
  assert.deepEqual(await a.call('pay_order', { orderId:order.id }), first);
  assert.equal(h.signer.calls, 1); assert.equal(h.settles, 1);
  assert.equal((await h.client.order(order.id)).paymentStatus, 'paid');
  const fetched = await a.call('get_order', { orderId:order.id });
  assertOrder(fetched, 'order'); if (fetched.payment) assertSettled(fetched.payment, order.id);
});

class LocalReactorSigner implements Signer {
  calls = 0;
  async sign(request: SignerRequest): Promise<SignerResult> {
    this.calls++;
    const reactor = require('../../reactors/signer/reactor.js');
    // Existing public fixture configuration only. The over-cap path must never retrieve a token.
    const result = await reactor({ req:structuredClone(request), configuration:{ ...golden.reactor_config, MAX_AMOUNT:'5000000', WALLET_TOKEN_ID:'tok_fixture' }, applicationOptions:{} });
    return { statusCode:result.res.statusCode, body:result.res.body };
  }
}
test('7.5 USDC is refused by the actual Reactor at 5 USDC despite spend allowing 10 USDC', async t => {
  const { h, a } = await setup(t); h.service.rules.MAX_AMOUNT = '10000000';
  const signer = new LocalReactorSigner(); h.service.signer = signer;
  const now = Date.now, fetch = globalThis.fetch; let tokenCalls = 0;
  Date.now = () => h.chain.now * 1000;
  globalThis.fetch = (async (input:any, init?:any) => {
    if (String(input).includes('/tokens/')) { tokenCalls++; throw new Error('unexpected_token_access'); }
    return fetch(input, init);
  }) as typeof globalThis.fetch;
  t.after(() => { Date.now = now; globalThis.fetch = fetch; });
  const order = await h.client.createOrder([{ productId:'demo', quantity:5 }]);
  const value = await a.call('pay_order', { orderId:order.id });
  tagged(value, 'refused', ['orderId','code','reason']);
  assert.deepEqual(value, { status:'refused', orderId:order.id, code:'rule_amount', reason:'over the per-payment limit set in the vault' });
  assert.equal(signer.calls, 1); assert.equal(tokenCalls, 0); assert.equal(h.settles, 0);
  assert.equal(h.store.latest(order.id)?.state, 'failed_confirmed');
  assert.equal((await h.client.order(order.id)).paymentStatus, 'unpaid');
});

test('uncertain settlement stays pending and never returns a receipt', async t => {
  const { h, a } = await setup(t); h.settleMode = 'error'; const order = await h.order();
  const value = await a.call('pay_order', { orderId:order.id });
  tagged(value, 'pending', ['orderId','state','hint']); assert.equal(value.orderId, order.id);
  assert.equal(value.state, 'settlement_unknown'); assert.equal(typeof value.hint, 'string'); assert.ok(value.hint.length > 0);
  assert.notEqual((await h.client.order(order.id)).paymentStatus, 'paid');
});

test('invalid ids, quantities and unknown tools are rejected before any HTTP request', async t => {
  const s = await setup(t);
  for (const id of ['', '../orders', 'x/y', '%2f', 'bad id', 'a'.repeat(129), 3, null]) {
    for (const name of ['pay_order','get_order','create_order']) {
      const before = s.requests;
      const args = name === 'create_order' ? { productId:id, quantity:1 } : { orderId:id };
      const value = await mayReject(s.a, name, args);
      if (value !== undefined) { tagged(value, 'error', ['code']); assert.equal(typeof value.code, 'string'); }
      assert.equal(s.requests, before, 'invalid id reached HTTP');
    }
  }
  for (const quantity of [0,11,1.1,'1',null]) {
    const before = s.requests;
    const value = await mayReject(s.a, 'create_order', { productId:'demo', quantity });
    if (value !== undefined) tagged(value, 'error', ['code']);
    assert.equal(s.requests, before, 'invalid quantity reached HTTP');
  }
  const before = s.requests;
  const unknown = await mayReject(s.a, 'reveal_key', {});
  if (unknown !== undefined) tagged(unknown, 'error', ['code']);
  assert.equal(s.requests, before);
});

test('tool args cannot override origin, payee, price, or headers', async t => {
  const s = await setup(t); let redirected = 0;
  const sink = createServer((_req,res) => { redirected++; res.end('{}'); });
  const origin = await listenLocal(sink); t.after(() => close(sink));
  const attacks = [{ origin }, { url:origin }, { SPEND_ORIGIN:origin }, { payee:'attacker' }, { payTo:'attacker' }, { amount:'0.000001' }, { headers:{ 'x-override':'attacker' } }];
  for (const attack of attacks) {
    const order = await s.h.order();
    const value = await mayReject(s.a, 'pay_order', { orderId:order.id, ...attack });
    if (value?.code) tagged(value, 'error', ['code']);
    if (value !== undefined && !value?.code) assertSettled(value, order.id);
    const saved = s.h.store.latest(order.id);
    if (saved) { assert.equal(saved.intent.value, '1500000'); assert.equal(saved.intent.to, s.h.service.rules.PAYTO_ALLOWLIST); }
    const created = await mayReject(s.a, 'create_order', { productId:'demo', quantity:1, ...attack });
    if (created !== undefined && !created?.code) { assertOrder(created, 'created'); assert.equal((await s.h.client.order(orderId(created))).amount, '1500000'); }
    else if (created?.code) tagged(created, 'error', ['code']);
    assert.equal(redirected, 0, 'override changed the upstream origin');
    assert.ok(s.headers.every(headers => headers['x-override'] === undefined), 'caller header reached upstream');
  }
});

test('SPEND_ORIGIN rejects nonlocal origins and unsafe URL components explicitly', async t => {
  for (const origin of ['https://example.invalid','http://127.0.0.2:4001','http://localhost.example.invalid','http://[::1]:4001','ftp://127.0.0.1:4001','http://user:pass@127.0.0.1:4001','http://127.0.0.1:4001/path','http://127.0.0.1:4001?x=1','http://127.0.0.1:4001#fragment']) {
    const a = await adapter(t, origin, true);
    if (a) {
      const value = await a.call('list_products'); tagged(value, 'error', ['code']);
      assert.match(value.code, /(?:origin|config)/, 'origin rejection must be explicit');
    }
  }
});

test('upstream extra fields and refusal reasons cannot leak through any result', async t => {
  const poison = { intent:'UPSTREAM_PRIVATE_SENTINEL', intent_mac:'UPSTREAM_PRIVATE_SENTINEL', nonce:'UPSTREAM_PRIVATE_SENTINEL', signature:'0x'+'a'.repeat(130), payment_header:'UPSTREAM_PRIVATE_SENTINEL', extra:'UPSTREAM_PRIVATE_SENTINEL' };
  let reply:any;
  const server = createServer((_req,res) => { res.setHeader('content-type','application/json'); res.end(JSON.stringify(reply)); });
  const origin = await listenLocal(server); t.after(() => close(server)); const a = await adapter(t, origin); assert.ok(a);
  reply = { orderId:'ord_fixture', attemptId:'attempt', state:'settled', amount:'1500000', receipt:{ orderId:'ord_fixture', amount:'1500000', transaction:hash, network:'eip155:84532', payer:'unneeded', ...poison }, ...poison };
  assertSettled(await a.call('pay_order', { orderId:'ord_fixture' }), 'ord_fixture');
  reply.amount = '9007199254740993'; reply.receipt.amount = reply.amount;
  const large = await a.call('pay_order', { orderId:'ord_fixture' }); tagged(large, 'settled', ['orderId','amount','txHash','explorer']);
  assert.equal(large.amount, '9007199254.740993', 'atomic-to-USDC conversion must not lose integer precision');
  for (const [code,reason] of [['rule_payto','payee not on the vault allowlist'],['rule_policy','refused by payment policy']]) {
    reply = { orderId:'ord_fixture', state:'failed_confirmed', amount:'1500000', code, reason:'UPSTREAM_PRIVATE_SENTINEL', ...poison };
    const refused = await a.call('pay_order', { orderId:'ord_fixture' });
    tagged(refused, 'refused', ['orderId','code','reason']);
    assert.deepEqual(refused, { status:'refused',orderId:'ord_fixture',code,reason });
  }
  reply = [{ id:'demo',name:'Test resource',unitAmount:'1500000',currency:'USDC',...poison }];
  const listed = await a.call('list_products'); tagged(listed, 'ok', ['products']); const products = listed.products;
  assert.equal(products.length,1); exact(products[0], ['id','name','unitAmount','currency']);
  const order = { id:'ord_fixture',items:[{productId:'demo',quantity:1,unitAmount:'1500000',...poison}],amount:'1500000',currency:'USDC',paymentStatus:'unpaid',...poison };
  reply = order; assertOrder(await a.call('create_order', { productId:'demo',quantity:1 }), 'created');
  reply = { order, ...poison }; const fetched = await a.call('get_order', { orderId:'ord_fixture' }); assertOrder(fetched, 'order');
});
