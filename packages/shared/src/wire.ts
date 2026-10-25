import { createHash } from 'node:crypto';
import { getAddress, recoverTypedDataAddress } from 'viem';
import { PaymentPayloadSchema, PaymentRequiredSchema } from '@x402/core/schemas';
import { encodePaymentSignatureHeader } from '@x402/core/http';
import { core } from './core.ts';
import type { Intent, Rules, PaymentPayload, PaymentRequired, PaymentRequirements, Receipt, Hex } from './types.ts';

export class CheckoutError extends Error {
  code: string; status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
export const fail = (code: string, status = 400): never => { throw new CheckoutError(code, status); };
export const equalAddress = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
export const uint = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) <= (1n<<256n)-1n;
export const txHash = (v: unknown): v is Hex => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('bad_request');
  return value as Record<string, unknown>;
}
export function fields(value: unknown, names: string[]) {
  const o = object(value);
  if (Object.keys(o).some(k => !names.includes(k))) fail('bad_request');
  return o;
}
export function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) return fail('bad_order_id');
  return value;
}
export function stable(value: unknown): string {
  if (Array.isArray(value)) return '['+value.map(stable).join(',')+']';
  if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable((value as any)[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function digest(value: unknown) { return createHash('sha256').update(stable(value)).digest('hex'); }
export function paymentUrl(origin: string, orderId: string) { return new URL(`/api/orders/${encodeURIComponent(id(orderId))}/pay`, origin).href; }
export function accepted(required: PaymentRequired): PaymentRequirements {
  const result = PaymentRequiredSchema.safeParse(required);
  if (!result.success || required.x402Version !== 2 || required.accepts.length !== 1) return fail('bad_requirements');
  return required.accepts[0]!;
}
export function validateRules(cfg: Rules) {
  if (cfg.CHAIN_ID !== '84532' || !equalAddress(cfg.ASSET,'0x036CbD53842c5426634e7929541eC2318f3dCF7e') || cfg.DOMAIN_NAME !== 'USDC' || cfg.DOMAIN_VERSION !== '2' || cfg.AUDIENCE !== 'vc-signer' || !cfg.POLICY_VERSION || cfg.POLICY_VERSION.length > 32 || !uint(cfg.MAX_AMOUNT) || BigInt(cfg.MAX_AMOUNT) <= 0n || !uint(cfg.MAX_WINDOW_SECONDS) || BigInt(cfg.MAX_WINDOW_SECONDS) < 1n || BigInt(cfg.MAX_WINDOW_SECONDS) > 600n) fail('bad_config');
  getAddress(cfg.WALLET_ADDRESS);
  const payees = cfg.PAYTO_ALLOWLIST.split(',').map(s=>s.trim()).filter(Boolean);
  if (!payees.length) fail('bad_config');
  payees.forEach(a=>getAddress(a));
}
export function validateRequirements(required: PaymentRequired, cfg: Rules, order: { id: string; amount: string }, origin: string) {
  const a = accepted(required);
  if (a.scheme !== 'exact' || a.network !== 'eip155:84532' || !equalAddress(a.asset,cfg.ASSET) || !cfg.PAYTO_ALLOWLIST.split(',').some(p=>equalAddress(p.trim(),a.payTo)) || !uint(a.amount) || a.amount !== order.amount || BigInt(a.amount) <= 0n || BigInt(a.amount) > BigInt(cfg.MAX_AMOUNT) || !Number.isSafeInteger(a.maxTimeoutSeconds) || a.maxTimeoutSeconds < 1 || BigInt(a.maxTimeoutSeconds) > BigInt(cfg.MAX_WINDOW_SECONDS) || a.extra?.name !== cfg.DOMAIN_NAME || a.extra?.version !== cfg.DOMAIN_VERSION || (a.extra?.assetTransferMethod !== undefined && a.extra.assetTransferMethod !== 'eip3009') || required.resource?.url !== paymentUrl(origin,order.id)) fail('requirements_rejected');
  return a;
}
export function buildPayload(required: PaymentRequired, i: Intent, signature: Hex): PaymentPayload {
  return { x402Version: 2, resource: required.resource, accepted: accepted(required), payload: {
    authorization: { from: getAddress(i.from), to: getAddress(i.to), value: i.value, validAfter: i.valid_after, validBefore: i.valid_before, nonce: i.nonce }, signature,
  } };
}
export function buildHeader(required: PaymentRequired, i: Intent, signature: Hex) { return encodePaymentSignatureHeader(buildPayload(required,i,signature)); }
export function authorization(payload: PaymentPayload) {
  if (!PaymentPayloadSchema.safeParse(payload).success || payload.x402Version !== 2) return fail('bad_payment');
  const p = fields(payload.payload,['authorization','signature']);
  const a = fields(p.authorization,['from','to','value','validAfter','validBefore','nonce']);
  if (!equalAddress(a.from,a.from) || !/^0x[0-9a-fA-F]{40}$/.test(a.from as string) || !/^0x[0-9a-fA-F]{40}$/.test(a.to as string) || !uint(a.value) || !uint(a.validAfter) || !uint(a.validBefore) || !/^0x[0-9a-fA-F]{64}$/.test(a.nonce as string) || typeof p.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(p.signature)) return fail('bad_payment');
  return a as { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: Hex };
}
export function authorizationKey(p: PaymentPayload) { const a=authorization(p); return `${p.accepted.network}:${p.accepted.asset.toLowerCase()}:${a.from.toLowerCase()}:${a.nonce.toLowerCase()}`; }
export function authorizationDigest(p: PaymentPayload) { return digest({ network:p.accepted.network, asset:p.accepted.asset.toLowerCase(), ...authorization(p), from:authorization(p).from.toLowerCase(), to:authorization(p).to.toLowerCase() }); }
export async function verifyPayload(p: PaymentPayload, required: PaymentRequired, cfg: Rules, now: number) {
  const a = authorization(p);
  if (digest(p.accepted) !== digest(accepted(required)) || p.resource?.url !== required.resource?.url || !equalAddress(a.to,p.accepted.payTo) || a.value !== p.accepted.amount || BigInt(a.value) <= 0n || BigInt(a.validAfter) >= BigInt(now) || BigInt(a.validBefore) <= BigInt(now) || BigInt(a.validBefore)-BigInt(now)>BigInt(Math.min(Number(cfg.MAX_WINDOW_SECONDS),p.accepted.maxTimeoutSeconds))) fail('payment_mismatch');
  const i = { from:a.from,to:a.to,value:a.value,valid_after:a.validAfter,valid_before:a.validBefore,nonce:a.nonce } as Intent;
  const recovered = await recoverTypedDataAddress({ ...core.typedDataFor(i,cfg,getAddress), signature:p.payload.signature as Hex });
  if (!equalAddress(recovered,a.from)) fail('bad_signature');
}
export function makeReceipt(orderId: string, amount: string, payer: string, transaction: Hex): Receipt { return { orderId, amount, transaction, network:'eip155:84532', payer }; }
export function validReceipt(value: unknown, i: Intent): value is Receipt {
  const r=object(value);
  return r.orderId===i.order_id && r.amount===i.value && r.network==='eip155:84532' && equalAddress(r.payer,i.from) && txHash(r.transaction);
}
