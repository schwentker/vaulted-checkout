import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

const schema = JSON.parse(readFileSync(new URL('../../contracts/events.schema.json', import.meta.url), 'utf8'));
const validate = new AjvJsonSchemaValidator().getValidator(schema);
const fixture = readFileSync(new URL('../../fixtures/events-gate-b.jsonl', import.meta.url), 'utf8').trimEnd().split('\n').map(line => JSON.parse(line));
test('Gate B fixture validates and exactly preserves both documented outcomes', () => {
  for (const event of fixture) assert.equal(validate(event).valid, true);
  assert.equal(fixture.length, 2);
  assert.equal(fixture[0].code, 'rule_payto');
  assert.equal(fixture[0].orderId, 'ord_429bfdbc-7c9c-4fbe-90be-9323b2b587fa');
  assert.equal(fixture[0].amount, undefined, 'refusal amount is not in Gate B evidence');
  assert.equal(fixture[1].amount, '1.5');
  assert.equal(fixture[1].orderId, 'ord_99b70e93-7b65-4edd-a97f-8464c86f2b0d');
  assert.equal(fixture[1].txHash, '0xd026fed37c35078edc3254ef5aa7b7c52af4492b77ae777ccdfb7a226e07fb5a');
});
test('events schema rejects extra fields, malformed amounts, unbound outcomes and invented receipts', () => {
  for (const extra of ['intent','intent_mac','nonce','signature','payment_header','headers','key']) assert.equal(validate({ ...fixture[1], [extra]:'forbidden' }).valid, false);
  for (const amount of [1.5,'1e6','01.5','-1','1.0000001','NaN']) assert.equal(validate({ ...fixture[1], amount }).valid, false);
  for (const field of ['orderId','amount','txHash']) { const event = { ...fixture[1] }; delete event[field]; assert.equal(validate(event).valid, false); }
  assert.equal(validate({ ...fixture[0], txHash:fixture[1].txHash }).valid, false);
  assert.equal(validate({ ...fixture[0], t:-1 }).valid, false);
  assert.equal(validate({ ...fixture[0], orderId:'../x' }).valid, false);
});
