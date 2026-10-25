"""Retiming from natural performances, with no chopped or accelerated dialogue."""
from pathlib import Path
import json,copy,sys
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'storyboard'))
from render_vectors import wrap,text_asset,render
S=json.loads((HERE/'script.json').read_text())
BASE=json.loads((ROOT/'storyboard/storyboard.json').read_text())
WORK=ROOT/'renders/film104'
VOICE=WORK/'voice'
# Redistribution stays within the user's additional 10-15 second allowance.
budgets=[252,636,270,240,390,360,240,222,360,150]
assert sum(budgets)==3120
scheduled=[];beats=[];scene_meta=[];cursor=0
for scene,budget in zip(S['scenes'],budgets):
 sid=scene['scene'];turns=[copy.deepcopy(t)for t in S['turns']if t['scene']==sid]
 for t in turns:
  a=json.loads((VOICE/(t['id']+'-alignment.json')).read_text())['alignment']
  assert ''.join(a['characters'])==t['text'],t['id']
  t['sourceStart']=max(0,a['character_start_times_seconds'][0]-.02)
  t['sourceEnd']=a['character_end_times_seconds'][-1]+.07
  t['speechDuration']=t['sourceEnd']-t['sourceStart']
  t['neededFrames']=int(np.ceil((t['speechDuration']+.45)*30))
  t['alignment']=a
 slack=budget-sum(t['neededFrames']for t in turns)
 assert slack>=0,(sid,'Natural takes exceed scene budget',slack)
 # More air around the long cast introduction; dense decisions get a short hold.
 weights=[t['speechDuration']for t in turns];extra=[int(slack*w/sum(weights))for w in weights];extra[-1]+=slack-sum(extra)
 local=cursor
 for t,plus in zip(turns,extra):
  t['startFrame']=local;t['endFrame']=local+t['neededFrames']+plus
  t['speechStart']=local/30+.22
  t['speechEnd']=t['speechStart']+t['speechDuration']
  assert t['speechEnd']<=t['endFrame']/30-.15
  a=t.pop('alignment');offset=0;phrase_starts=[]
  for phrase in t['phrases']:
   phrase_starts.append(t['speechStart']+a['character_start_times_seconds'][offset]-t['sourceStart'])
   offset+=len(phrase)+1
  original=[f for f in BASE['frames']if f['scene']==sid and t['firstStep']<=f['step']<=t['lastStep']]
  minimum=[39 if f.get('motion')else 30 for f in original]
  # A reveal leads its phrase slightly, with at least one second to read a node.
  starts=[t['startFrame']]
  for i,onset in enumerate(phrase_starts[1:],1):
   desired=round((onset-.16)*30)
   starts.append(max(starts[-1]+minimum[i-1],desired))
  assert starts[-1]+minimum[-1]<=t['endFrame'],(t['id'],'Last reveal too short',starts,t['endFrame'])
  for i,(f,phrase)in enumerate(zip(original,t['phrases'])):
   end=starts[i+1]if i+1<len(starts)else t['endFrame']
   beats.append({'scene':sid,'step':f['step'],'startFrame':starts[i],'endFrame':end,'durationFrames':end-starts[i],
    'cue':phrase,'speaker':t['speaker'],'voiceRole':t['role'],'turn':t['id']})
  scheduled.append(t);local=t['endFrame']
 assert local==cursor+budget
 scene_meta.append({'scene':sid,'heading':scene.get('heading',''),'startFrame':cursor,'endFrame':cursor+budget,'durationFrames':budget,
  'beats':sum(f['scene']==sid for f in beats),'narration':' '.join(t['text']for t in turns)})
 cursor+=budget
D=copy.deepcopy(BASE)
for collection in [D['frames'],D['portraitFrames']]:
 for f in collection:
  b=next(b for b in beats if b['scene']==f['scene']and b['step']==f['step'])
  f.update(b);f['localStartFrame']=f['startFrame']-next(s['startFrame']for s in scene_meta if s['scene']==f['scene'])
  cohesive={('S1',1):'The buyer’s agent shops.',('S1',2):'The buyer’s agent shops.',
            ('S8',2):'Other keys have narrower jobs.',('S8',3):'Other keys have narrower jobs.',
            ('S8',4):'Management and one-time provisioning stay separate.',('S8',5):'Management and one-time provisioning stay separate.',
            ('S8',6):'Neither the agent nor the merchant holds buyer keys.',('S8',7):'Neither the agent nor the merchant holds buyer keys.'}
  caption=cohesive.get((f['scene'],f['step']),b['cue'])
  ns=[];caption_done=False
  for n in f['nodes']:
   if n['group']=='caption'and n['type']=='text':
    if caption_done:continue
    caption_done=True
    n=copy.deepcopy(n);n['value']=caption;n['id']='film-caption'
    if f['viewport']=='portrait':n['y']=1142
    for q in wrap(n):text_asset(q);ns.append(q)
   else:
    if f['viewport']=='portrait'and n['group']=='portrait-owner'and n['type']=='rect':
     n=copy.deepcopy(n);n['h']=780
    if f['viewport']=='portrait'and n['group']=='caption'and n['type']=='rect':
     n=copy.deepcopy(n);n['y']=1090;n['h']=210
    ns.append(n)
  phone=f['viewport']=='portrait'
  label={'type':'text','value':b['speaker'],'x':94 if phone else 93,'y':1069 if phone else 848,'size':38 if phone else 26,'color':'#6B7280','w':890 if phone else 1700,'kind':'regular','opacity':1,'group':'speaker','id':'ensemble-speaker'}
  text_asset(label);ns.append(label)
  if phone and f['scene']=='S6':
   for n in ns:
    if n['type']=='text'and n['group']=='portrait-content'and n['value']=='no signature':
     n['y']=752;text_asset(n)
  if phone and f['scene']=='S7':
   ns=[n for n in ns if n['group']!='portrait-content']
   labels={1:['settled attempt','same nonce + expiry'],2:['existing receipt','idempotency lock'],3:['same receipt','0xd026…fb5a','chain transfers: 1']}[f['step']]
   for i,value in enumerate(labels):
    n={'type':'text','value':value,'x':128,'y':470+i*111,'size':64,'color':'#111827','w':824,'kind':'regular','opacity':1,'group':'portrait-content','id':f'film-phone-content-{i}'}
    text_asset(n);ns.append(n)
   for n in ns:
    if n['type']=='text'and n['group']=='portrait-owner':
     n['value']='spend service';text_asset(n)
   f['cameraPlan'].update(owner='spend',center=[544,549],windowWidth=520)
  # Focus marks never change a role label's identity or turn a panel into text.
  role_names={'buyer','agent','mcp','spend','bt','signer','vault','merchant','facilitator','chain'}
  counters={}
  for n in ns:
   role=n['group']
   if role not in role_names or n['id']in['buyer-shell','buyer-name']:continue
   if n['type']=='rect':
    if n['h']==8:n['id']=role+'-focus'
    elif role=='vault'and n['w']==35:n['id']='vault-lock-body'
    elif role=='chain'and n['fill']=='#DC2626':n['id']='chain-color-band'
    else:n['id']=role+'-shell'
   else:
    token=(role,n['type']);index=counters.get(token,0);counters[token]=index+1
    n['id']=f'{role}-{n["type"]}-{index}'
  f['nodes']=ns
  aliases={'buyer-shell':'matrix-agent-0','buyer-name':'matrix-agent-1',
           'spend-shell':'matrix-spend-0','spend-text-0':'matrix-spend-1',
           'merchant-shell':'matrix-merchant-0','merchant-text-0':'matrix-merchant-1',
           'bt-shell':'matrix-bt-0','bt-text-0':'matrix-bt-1',
           'vault-shell':'matrix-bt-2','vault-text-0':'matrix-bt-3'}
  if f['scene']=='S8'and f['step']==1:f['morphAliases']=aliases
  if f['scene']=='S9'and f['step']==1:f['morphAliases']={v:k for k,v in aliases.items()}
  f['notes']=f"{f['scene']} beat {f['step']}. {f['startFrame']/30:.3f} to {f['endFrame']/30:.3f}s. {b['speaker']}: {b['cue']}\n"+f['notes']
D.update(durationSeconds=104,totalBeats=49,scenes=scene_meta,title='Vaulted Checkout: complete conversational film')
(HERE/'storyboard.json').write_text(json.dumps(D,indent=2,ensure_ascii=False)+'\n')
(HERE/'schedule.json').write_text(json.dumps({'fps':30,'durationSeconds':104,'cast':S['cast'],'turns':scheduled,'beats':beats,'scenes':scene_meta},indent=2,ensure_ascii=False)+'\n')
md=['# Vaulted Checkout: final dialogue and timings','','104 seconds, 49 beats, four voices. Continuous takes retain their natural pace and internal pauses.','', '| Start | End | Speaker | Line |','|---|---|---|---|']
for t in scheduled:md.append(f"| {t['speechStart']:.2f} | {t['speechEnd']:.2f} | {t['speaker']} | {t['text']} |")
(HERE/'script.md').write_text('\n'.join(md)+'\n')
print('104 seconds, 3120 frames, 49 reveals, 17 intact performances. No speech acceleration.')
for t in scheduled:print(t['id'],round(t['speechStart'],2),round(t['speechEnd'],2),'hold',round(t['endFrame']/30-t['speechEnd'],2))
