import { harness } from '../tests/support/fixtures.ts';
const local=await harness();
try {
  const order=await local.order();
  const purchase=await local.service.pay(order.id);
  const duplicate=await local.service.pay(order.id);
  console.log(JSON.stringify({mode:'LOCAL MOCK ONLY, no Basis Theory or blockchain calls',purchase,duplicate,signerCalls:local.signer.calls,settlementCalls:local.settles},null,2));
} finally {await local.close();}
