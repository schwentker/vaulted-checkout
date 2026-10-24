// Verifies the smoke Reactor's vault-mode output: recovers the signer of the fixed, expired, zero-value message.
//   node verify-signature.mjs ../evidence/gate-a-vault.json
import { readFileSync } from 'node:fs';
import { recoverTypedDataAddress } from 'viem';

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const body = raw.res ? raw.res.body : raw;
const td = {
  domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
  types: { TransferWithAuthorization: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] },
  primaryType: 'TransferWithAuthorization',
  message: { from: body.address, to: '0x000000000000000000000000000000000000dEaD', value: 0n, validAfter: 0n, validBefore: 1n, nonce: '0x' + '00'.repeat(31) + '01' },
};
const recovered = await recoverTypedDataAddress({ ...td, signature: body.signature });
console.log(JSON.stringify({ reported: body.address, recovered, match: recovered === body.address }));
process.exit(recovered === body.address ? 0 : 1);
