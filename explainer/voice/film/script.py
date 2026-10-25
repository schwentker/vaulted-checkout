"""104-second conversational ensemble edition, with 49 progressive reveals."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
cast=json.loads((ROOT/'voice/casting/cast.json').read_text())
for c in cast.values():c['speed']=1.;c['style']=.12;c['stability']=.55
cast['basis_theory'].update(stability=.65,style=.06)
# Each tuple is one continuous performance. Phrase boundaries drive the reveals.
scenes=[
 ('S0',8,[(1,4,'narrator','narrator',[
  'A buyer needs something.','Their agent can buy it,','paying in testnet USDC.','The wallet key stays inside Basis Theory.'])]),
 ('S1',22,[
  (1,4,'narrator','narrator',["The buyer’s",'agent shops.','A separate spend service decides,','reached through fixed tools.']),
  (5,7,'buyer','buyer’s spend service',['I check policy,','record each attempt,','and seal only what I approve.']),
  (8,12,'narrator','narrator',['Basis Theory has its own signer','and a vault for the key.','Across the line: a merchant,','a facilitator,','and the chain.'])]),
 ('S2',9,[
  (1,1,'narrator','narrator',['The agent places an order.']),
  (2,4,'merchant','merchant',['I set the price and payee.','When the buyer asks to pay,','I return the payment requirements.'])]),
 ('S3',10,[(1,3,'buyer','buyer’s spend service',[
  'I check the terms against policy,','save one nonce and expiry with the attempt,','then seal that intent.'])]),
 ('S4',13,[
  (1,1,'narrator','narrator',['That sealed intent goes to Basis Theory.']),
  (2,5,'basis_theory','basis theory signer',['I check the seal','and my five fixed rules.','Then I sign.','The signature leaves. The key stays with me.'])]),
 ('S5',10,[
  (1,4,'narrator','narrator',['With the signature checked,','the merchant records the claim.','The facilitator verifies, then submits.','USDC moves on chain.']),
  (5,5,'merchant','merchant',['Confirmed. Here’s your receipt.'])]),
 ('S6',9,[
  (1,1,'narrator','narrator',['Now change the payee.']),
  (2,3,'basis_theory','basis theory signer',['The seal is valid, but that payee isn’t allowed.','I won’t sign.'])]),
 ('S7',7,[
  (1,1,'narrator','narrator',['And a retry?']),
  (2,3,'buyer','buyer’s spend service',['That attempt is already settled.','I return its receipt. Still one transfer.'])]),
 ('S8',12,[(1,7,'narrator','narrator',[
  'The wallet key stays with Basis Theory.','Other keys have','narrower jobs.','Management','and one-time provisioning stay separate.','Neither the agent','nor the merchant holds buyer keys.'])]),
 ('S9',4,[(1,3,'narrator','narrator',['Policy decides.','The signer signs.','The chain settles.'])])]
base=json.loads((ROOT/'storyboard/storyboard.json').read_text())
old={s['scene']:s['durationFrames']/30 for s in base['scenes']}
turns=[];cursor=0
for scene,seconds,blocks in scenes:
 for first,last,role,speaker,phrases in blocks:
  assert len(phrases)==last-first+1
  turns.append({'id':f'{scene}-{first:02d}-{last:02d}','scene':scene,'firstStep':first,'lastStep':last,'role':role,'speaker':speaker,'phrases':phrases,'text':' '.join(phrases),'sceneStart':cursor,'sceneEnd':cursor+seconds})
 cursor+=seconds
assert cursor==104 and sum(len(t['phrases'])for t in turns)==49
story={'durationSeconds':104,'fps':30,'totalBeats':49,'cast':cast,'scenes':[{'scene':s,'durationSeconds':d}for s,d,_ in scenes],'turns':turns}
(HERE/'script.json').write_text(json.dumps(story,indent=2,ensure_ascii=False)+'\n')
md=['# Vaulted Checkout: full ensemble film','','104 seconds, 49 progressive reveals. Same four voices, with longer continuous performances.','', 'Dialogue remains intact across the visual beats. The narrator carries transitions. The buyer’s spend service, signer and merchant speak only for their own authority.','', '| Scene | Seconds | Speaker | Continuous dialogue |','|---|---|---|---|']
for t in turns:md.append(f"| {t['scene']} | {t['sceneStart']:.0f} to {t['sceneEnd']:.0f} | {t['speaker']} | {t['text']} |")
md+=['','Performance direction: conversational and unhurried. Keep breaths and sentence pauses. No voice change just to read a label. Leave a short quiet interval between actors and hold meaningful final states.','', 'The signer speaks from inside Basis Theory. “The key stays with me” refers to that boundary, including runtime retrieval. The merchant’s confirmation follows chain confirmation. The original recorded transaction is retained as public evidence; this film does not claim a new payment run.','']
(HERE/'script.md').write_text('\n'.join(md))
print(len(turns),'continuous turns,',sum(len(t['text'].split())for t in turns),'words, 104 seconds')
