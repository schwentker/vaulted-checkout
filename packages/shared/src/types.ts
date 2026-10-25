import type { PaymentRequired, PaymentRequirements, PaymentPayload } from '@x402/core/types';
export type { PaymentRequired, PaymentRequirements, PaymentPayload };
export type Hex = `0x${string}`;
export type Intent = Record<'v'|'audience'|'order_id'|'attempt_id'|'chain_id'|'asset'|'from'|'to'|'value'|'valid_after'|'valid_before'|'nonce'|'policy_version'|'issued_at', string>;
export type Rules = Record<'AUDIENCE'|'CHAIN_ID'|'ASSET'|'DOMAIN_NAME'|'DOMAIN_VERSION'|'WALLET_ADDRESS'|'PAYTO_ALLOWLIST'|'POLICY_VERSION'|'MAX_AMOUNT'|'MAX_WINDOW_SECONDS', string>;
export type State = 'authorized'|'signing'|'sign_unknown'|'rejected'|'signed'|'submitted'|'settlement_unknown'|'settled'|'failed_confirmed';
export type Receipt = { orderId: string; amount: string; transaction: Hex; network: 'eip155:84532'; payer: string };
export type Product = { id: string; name: string; unitAmount: string; currency: 'USDC' };
export type Order = { id: string; items: { productId: string; quantity: number; unitAmount: string }[]; amount: string; currency: 'USDC'; paymentStatus: 'unpaid'|'pending'|'paid'; receipt?: Receipt };
export type SignerRequest = { intent: Intent; intent_mac: string };
export type SignerResult = { statusCode: number; body: { ok: true; from: string; signature: Hex; attempt_id: string } | { ok: false; code: string } };
export interface Signer { sign(request: SignerRequest): Promise<SignerResult> }
export type Observation = { kind: 'settled'; transaction: Hex } | { kind: 'expired_unused' } | { kind: 'unknown'; code: string };
export interface Chain { startBlock(): Promise<bigint>; observe(intent: Intent, startBlock: bigint): Promise<Observation> }
export interface MerchantClient {
  products(): Promise<Product[]>;
  createOrder(items: { productId: string; quantity: number }[]): Promise<Order>;
  order(id: string): Promise<Order>;
  challenge(id: string): Promise<PaymentRequired>;
  submit(id: string, header: string): Promise<MerchantResult>;
}
export type MerchantResult = { status: number; body: { status: string; receipt?: Receipt; code?: string }; paymentResponse?: string };
export type Attempt = { attempt_id: string; order_id: string; state: State; intent: Intent; intent_mac: string; required: PaymentRequired; chain_start_block: string; sign_calls: number; uncertain_sign: number; signature: Hex|null; payment_header: string|null; tx_hash: Hex|null; reject_code: string|null; receipt: Receipt|null; created_at: string; updated_at: string };
export type PublicAttempt = { orderId: string; attemptId: string; state: State; amount: string; receipt?: Receipt; code?: string };
