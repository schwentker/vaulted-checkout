"""Mix intact natural voice turns with quiet cues, then join the complete film."""
from pathlib import Path
import argparse,json,subprocess,wave,re
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
WORK=ROOT/'renders/film104'
S=json.loads((HERE/'schedule.json').read_text());D=json.loads((HERE/'storyboard.json').read_text())
RATE=48000;SECONDS=104
p=argparse.ArgumentParser();p.add_argument('--aspect',choices=['landscape','portrait'],default='landscape');p.add_argument('--audio-only',action='store_true');args=p.parse_args()

def decode(path):
 return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ar',str(RATE),'-ac','1','-f','f32le','-']),np.float32).copy()

def save(path,audio):
 assert np.isfinite(audio).all()and abs(audio).max()<1
 with wave.open(str(path),'wb')as w:
  w.setparams((1,2,RATE,0,'NONE','not compressed'));w.writeframes((audio*32767).astype('<i2').tobytes())

mixfile=WORK/'final-mix.wav'
if not mixfile.is_file():
 raw={t['id']:decode(WORK/'voice'/f"{t['id']}.mp3")for t in S['turns']}
 roles={};normalized={}
 for role in S['cast']:
  pieces=[];spans=[];cursor=0
  for t in [t for t in S['turns']if t['role']==role]:
   clip=raw[t['id']][round(t['sourceStart']*RATE):round(t['sourceEnd']*RATE)]
   pieces.extend([clip,np.zeros(round(.2*RATE),np.float32)]);spans.append((t['id'],cursor,len(clip)));cursor+=len(clip)+round(.2*RATE)
  reel=np.concatenate(pieces)
  # Process each actor as one reel, preserving breaths and relative inflection.
  stat=subprocess.run(['ffmpeg','-v','info','-f','f32le','-ar',str(RATE),'-ac','1','-i','-','-af','highpass=f=65,loudnorm=I=-18:TP=-2:LRA=9:print_format=json','-ar',str(RATE),'-f','f32le','-'],input=reel.astype('<f4').tobytes(),capture_output=True,check=True)
  report=json.loads(re.search(r'\{\s*"input_i".*?\}',stat.stderr.decode(),re.S)[0])
  processed=np.frombuffer(stat.stdout,np.float32)
  assert abs(len(processed)-len(reel))<RATE*.05
  for ident,start,count in spans:normalized[ident]=processed[start:start+count].copy()
  roles[role]={'inputLufs':float(report['input_i']),'outputLufs':float(report['output_i']),'outputPeakDb':float(report['output_tp']),'processing':'one continuous actor reel, no tempo change'}
 voice=np.zeros(SECONDS*RATE,np.float32);sync=[]
 for t in S['turns']:
  clip=normalized[t['id']]
  n=min(round(.006*RATE),len(clip));clip[:n]*=np.linspace(0,1,n);clip[-n:]*=np.linspace(1,0,n)
  at=round(t['speechStart']*RATE);assert at+len(clip)<=round(t['endFrame']/30*RATE)
  voice[at:at+len(clip)]+=clip
  sync.append({'id':t['id'],'role':t['role'],'voiceId':S['cast'][t['role']]['voiceId'],'speechStart':at/RATE,'speechEnd':(at+len(clip))/RATE,'tempo':1.0,'intactTake':True})
 effects=np.zeros_like(voice);events=[]
 words={'seal':'seal','tick':'seal','rules':'rules','signature':'sign','confirmed':'Confirmed','refusal':'won’t','ledger':'settled'}
 for f in D['frames']:
  if not f.get('sound'):continue
  t=next(t for t in S['turns']if t['id']==f['turn']);align=json.loads((WORK/'voice'/f"{t['id']}-alignment.json").read_text())['alignment']
  phrase_index=f['step']-t['firstStep'];offset=sum(len(x)+1 for x in t['phrases'][:phrase_index]);index=t['text'].lower().find(words[f['sound']].lower(),offset)
  event=t['speechStart']+align['character_start_times_seconds'][index]-t['sourceStart']+.04 if index>=0 else f['startFrame']/30+.3
  event=max(event,f['startFrame']/30+.22)
  clip=decode(ROOT/'manim/audio'/f"{f['sound']}.wav")*.19
  at=round(event*RATE);effects[at:at+len(clip)]+=clip
  events.append({'sound':f['sound'],'time':event,'scene':f['scene'],'step':f['step']})
 save(WORK/'voice-only.wav',voice)
 save(WORK/'premix.wav',voice+effects)
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(WORK/'premix.wav'),'-af','highpass=f=50,alimiter=limit=0.84:level=false:latency=true','-ar','48000','-c:a','pcm_s16le',str(mixfile)],check=True)
 (WORK/'audio-manifest.json').write_text(json.dumps({'durationSeconds':104,'roles':roles,'turns':sync,'soundEvents':events,'music':'none','dialogueTempo':1.0},indent=2,ensure_ascii=False)+'\n')

if args.audio_only:
 print('Natural dialogue mixed and actor loudness matched.');raise SystemExit(0)

media=WORK/('.manim-'+args.aspect)/'videos'
clips=[]
for i,scene in enumerate(S['scenes']):
 sid=scene['scene'];matches=[p for p in media.rglob(sid+'.mp4')if'partial_movie_files'not in str(p)];assert len(matches)==1,(sid,matches)
 info=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v','-show_entries','stream=nb_frames,r_frame_rate','-of','json',str(matches[0])]))['streams'][0]
 assert int(info['nb_frames'])==scene['durationFrames']and info['r_frame_rate']=='30/1',(sid,info)
 out=WORK/f'{args.aspect}-{sid}-video.mp4'
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(matches[0]),'-map','0:v:0','-c:v','copy','-an',str(out)],check=True);clips.append(out)
listing=WORK/f'{args.aspect}-concat.txt';listing.write_text(''.join("file '"+str(p)+"'\n"for p in clips))
joined=WORK/f'{args.aspect}-picture.mp4'
subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(listing),'-c','copy',str(joined)],check=True)
meta=WORK/'chapters.txt';parts=[';FFMETADATA1']
for s in S['scenes']:
 parts+=['[CHAPTER]','TIMEBASE=1/30',f"START={s['startFrame']}",f"END={s['endFrame']}",f"title={s['scene']} {next(f['heading']for f in D['frames']if f['scene']==s['scene'])}"]
meta.write_text('\n'.join(parts)+'\n')
output=ROOT/'renders'/f'vaulted-checkout-full-{args.aspect}.mp4'
subprocess.run(['ffmpeg','-y','-v','error','-i',str(joined),'-i',str(mixfile),'-i',str(meta),'-map','0:v:0','-map','1:a:0','-map_metadata','2','-map_chapters','2','-t','104','-c:v','copy','-c:a','aac','-b:a','192k','-ac','2','-ar','48000','-movflags','+faststart',str(output)],check=True)

def stamp(frame):
 ms=round(frame/30*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
subs=[]
for f in D['frames']:
 label=' '.join(n['value']for n in f['nodes']if n['group']=='caption'and n['type']=='text');value=f['speaker']+': '+label
 if subs and subs[-1]['value']==value:subs[-1]['end']=f['endFrame']
 else:subs.append({'start':f['startFrame'],'end':f['endFrame'],'value':value})
(ROOT/'renders/vaulted-checkout-full.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(s['start'])} --> {stamp(s['end'])}\n{s['value']}"for i,s in enumerate(subs))+'\n')
print('Created',output)
