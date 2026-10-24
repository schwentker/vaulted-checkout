import { HTTPFacilitatorClient } from '@x402/core/http';
// Constructed only by an operator's runtime. Local tests inject a fake facilitator.
export function publicFacilitator() {return new HTTPFacilitatorClient({url:'https://x402.org/facilitator',timeoutMs:15000});}
