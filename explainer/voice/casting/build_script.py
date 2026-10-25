"""Create the ensemble edition from the approved semantic scene geometry."""
from pathlib import Path
import json,sys,copy
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'storyboard'))
from render_vectors import text_asset,wrap
HERE=Path(__file__).resolve().parent
cast={
 'narrator':{'name':'Bella','voiceId':'hpp4J3VqNfWAUOO0d1Us','presentation':'female, clear mid-high register','direction':'Warm curiosity, precise consonants. Connect causes to consequences. No announcer voice.','speed':1.13,'stability':.58,'style':.08},
 'buyer':{'name':'QStar · AgentTab','voiceId':'bGaO5vdJcnB4WojYqfuK','presentation':'androgynous, centered register','direction':'Practical, concise and thoughtful. Same buyer-side voice for human buyer and trusted spend service, with explicit speaker labels.','speed':1.2,'stability':.62,'style':.05},
 'basis_theory':{'name':'Brian','voiceId':'nPczCjzI2devNBz1zQrb','presentation':'male, resonant lower register','direction':'Calm technical authority. Short clean statements, no growl, whisper or reverb. The signer speaks for execution.','speed':1.15,'stability':.72,'style':.03},
 'merchant':{'name':'Matilda','voiceId':'XrExE9yKIg1WjnnlVkGX','presentation':'female, conversational alto','direction':'Direct and welcoming. State terms cleanly. Warmth follows confirmed settlement, with no sales pitch.','speed':1.13,'stability':.63,'style':.06}}
# One sentence per existing beat. Timings and protocol states stay unchanged.
lines={
 'S0':[('narrator','narrator','A buyer.'),('buyer','buyer','My agent buys.'),('narrator','narrator','In testnet USDC.'),('basis_theory','basis theory','I hold the wallet key.')],
 'S1':[('narrator','narrator','The buyer.'),('buyer','buyer','My agent shops.'),('narrator','narrator',"Their spend service."),('narrator','narrator','Through fixed tools.'),('buyer',"buyer’s spend service",'I check policy.'),('buyer',"buyer’s spend service",'I keep a ledger.'),('buyer',"buyer’s spend service",'I seal approved intents.'),('narrator','narrator','Basis Theory checks five fixed rules.'),('basis_theory','basis theory signer','I access the key.'),('merchant','merchant','I request payment.'),('narrator','narrator','A facilitator submits it.'),('narrator','narrator','The chain settles.')],
 'S2':[('buyer','buyer','My agent orders.'),('merchant','merchant','I set the price.'),('buyer',"buyer’s spend service",'I get the request.'),('merchant','merchant','I require payment.')],
 'S3':[('buyer',"buyer’s spend service",'I check the terms.'),('buyer',"buyer’s spend service",'I save one nonce and expiry.'),('buyer',"buyer’s spend service",'Then I seal the intent.')],
 'S4':[('narrator','narrator','The intent reaches Basis Theory.'),('basis_theory','basis theory signer','I check the seal.'),('basis_theory','basis theory signer','Then my five fixed rules.'),('basis_theory','basis theory signer','I sign.'),('basis_theory','basis theory signer','The key stays with me.')],
 'S5':[('buyer',"buyer’s spend service",'I check the signature.'),('merchant','merchant','I record the claim.'),('narrator','narrator','Verified. Submitting.'),('narrator','narrator','USDC moves on chain.'),('merchant','merchant','Confirmed. Here’s your receipt.')],
 'S6':[('narrator','narrator','A separate request names an unlisted payee.'),('basis_theory','basis theory signer','The seal passes. The payee fails.'),('basis_theory','basis theory signer','I refuse. No signature.')],
 'S7':[('narrator','narrator','Same order. Pay again?'),('buyer',"buyer’s spend service",'I return the same receipt.'),('narrator','narrator','One order. One transfer.')],
 'S8':[('basis_theory','basis theory','I hold it.'),('buyer',"buyer’s spend service",'Our seal key.'),('buyer',"buyer’s spend service",'I invoke only.'),('narrator','narrator','Management: operator only.'),('narrator','narrator','Provisioner: one-time use.'),('narrator','narrator','Agent: no buyer keys.'),('merchant','merchant','I hold no buyer keys.')],
 'S9':[('buyer',"buyer’s spend service",'I decide.'),('basis_theory','basis theory signer','I sign.'),('narrator','narrator','The chain settles.')]
}
data=json.loads((ROOT/'storyboard/storyboard.json').read_text());script=[]
for f in data['frames']:
 role,speaker,text=lines[f['scene']][f['step']-1]
 script.append({'id':f"{f['scene']}-{f['step']:02d}",'scene':f['scene'],'step':f['step'],'start':f['startFrame']/30,'end':f['endFrame']/30,'role':role,'speaker':speaker,'text':text})
for collection in [data['frames'],data['portraitFrames']]:
 for f in collection:
  b=next(b for b in script if b['scene']==f['scene']and b['step']==f['step']);f['cue']=b['text'];f['speaker']=b['speaker'];f['voiceRole']=b['role']
  ns=[]
  for n in f['nodes']:
   if n['group']=='caption'and n['type']=='text':
    n=copy.deepcopy(n);n['value']=b['text']
    for q in wrap(n):text_asset(q);ns.append(q)
   else:ns.append(n)
  phone=f['viewport']=='portrait'
  label={'type':'text','value':b['speaker'],'x':94 if phone else 93,'y':1081 if phone else 848,'size':26,'color':'#6B7280','w':890 if phone else 1700,'kind':'regular','opacity':1,'group':'speaker','id':'ensemble-speaker'}
  text_asset(label);ns.append(label);f['nodes']=ns
for s in data['scenes']:s['narration']=' '.join(b['text']for b in script if b['scene']==s['scene'])
auditions=[
 {'role':'narrator','text':'An agent can buy. Authority stays with the buyer.'},
 {'role':'buyer','text':'I check policy. I keep a ledger. I seal the intent.'},
 {'role':'basis_theory','text':'I check the seal and my fixed rules. I sign. The key stays with me.'},
 {'role':'merchant','text':'I set the price. Once settlement is confirmed, I return your receipt.'}]
(HERE/'cast.json').write_text(json.dumps(cast,indent=2,ensure_ascii=False)+'\n')
(HERE/'ensemble-script.json').write_text(json.dumps({'durationSeconds':90,'fps':30,'beats':script,'auditions':auditions},indent=2,ensure_ascii=False)+'\n')
(HERE/'ensemble-storyboard.json').write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
md=['# Vaulted Checkout: ensemble dialogue','', 'Four voices, 49 beats, 90 seconds. The narrator introduces roles and connects the handoffs. Each component speaks only for its own authority.','', '| Role | Voice | Direction |','|---|---|---|']
for role,c in cast.items():md.append(f"| {role.replace('_',' ')} | {c['name']} ({c['presentation']}) | {c['direction']} |")
md+=['','The buyer and their spend service share an ownership voice. On-screen speaker labels identify the component; the agent never claims to check policy. Basis Theory’s signer speaks the signing lines. “The key stays with me” means inside Basis Theory, including its runtime.','', '| Time | Scene | Speaker | Line |','|---|---|---|---|']
for b in script:md.append(f"| {b['start']:.1f} to {b['end']:.1f} s | {b['id']} | {b['speaker']} | {b['text']} |")
md+=['','Delivery: keep dialogue dry and centered. Use 100 to 160 ms of space at speaker changes where beat timing allows. Loudness-match the actors. No simultaneous dialogue or stereo ownership mapping.','', 'Opening-preview boundary: the next line starts at 14.4 seconds and ends at 15.8 seconds. Omit that voice line from the 15-second preview so no spoken word is cut. The four-role cast reel includes the merchant and signer lines heard later in the film.','']
(HERE/'ensemble-script.md').write_text('\n'.join(md))
print('Created four-role cast, 49-beat dialogue and separate ensemble storyboard.')
