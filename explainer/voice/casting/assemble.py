"""Mix the ensemble preview and a four-role audition reel, without network access."""
from pathlib import Path
import json,subprocess,wave
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
WORK=ROOT/'renders/ensemble'
cast=json.loads((HERE/'cast.json').read_text())
script=json.loads((HERE/'ensemble-script.json').read_text())
RATE=48000
lookup={};takes={}
for role,c in cast.items():
 req=json.loads((WORK/f'{role}-request.json').read_text())
 align=json.loads((WORK/f'{role}-alignment.json').read_text())['alignment']
 assert req['voiceId']==c['voiceId']and ''.join(align['characters'])==req['text']
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(WORK/f'{role}.mp3'),'-af','highpass=f=65,loudnorm=I=-17:TP=-2:LRA=7','-ar',str(RATE),'-ac','1','-f','f32le','-'])
 takes[role]=np.frombuffer(raw,dtype='<f4');offset=0
 for segment in req['segments']:
  n=len(segment['text'])
  start=max(0,align['character_start_times_seconds'][offset]-.02)
  end=align['character_end_times_seconds'][offset+n-1]+.035
  lookup[segment['id']]={**segment,'role':role,'sourceStart':start,'sourceEnd':end}
  offset+=n+1

def extract(entry,tempo=1):
 clip=takes[entry['role']][round(entry['sourceStart']*RATE):round(entry['sourceEnd']*RATE)].copy()
 if tempo>1.000001:
  raw=subprocess.check_output(['ffmpeg','-v','error','-f','f32le','-ar',str(RATE),'-ac','1','-i','-','-af',f'atempo={tempo:.10f}','-f','f32le','-'],input=clip.astype('<f4').tobytes())
  clip=np.frombuffer(raw,dtype='<f4').copy()
 fade=min(round(.005*RATE),len(clip));clip[:fade]*=np.linspace(0,1,fade);clip[-fade:]*=np.linspace(1,0,fade)
 return clip

def save(path,audio):
 assert np.isfinite(audio).all()and abs(audio).max()<1
 with wave.open(str(path),'wb')as wav:
  wav.setparams((1,2,RATE,0,'NONE','not compressed'))
  wav.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())

track=np.zeros(15*RATE,np.float32);sync=[]
for b in script['beats']:
 if b['end']>15:continue
 entry=lookup[b['id']];slot=b['end']-b['start']-.12
 tempo=max(1,(entry['sourceEnd']-entry['sourceStart'])/slot)
 assert tempo<=1.5,('New take required',b['id'],tempo)
 clip=extract(entry,tempo);at=round((b['start']+.06)*RATE)
 assert at+len(clip)<=round((b['end']-.02)*RATE),('Overrun',b['id'],len(clip)/RATE)
 track[at:at+len(clip)]+=clip
 sync.append({**b,'voiceId':cast[b['role']]['voiceId'],'speechStart':at/RATE,'speechEnd':(at+len(clip))/RATE,'tempo':tempo})
save(WORK/'preview-voice.wav',track)
chapters=[];pieces=[np.zeros(round(.25*RATE),np.float32)];cursor=.25
for role,c in cast.items():
 entry=lookup['audition-'+role];clip=extract(entry)
 chapters.append({'role':role,'voice':c['name'],'voiceId':c['voiceId'],'text':entry['text'],'start':cursor,'end':cursor+len(clip)/RATE})
 pieces.extend([clip,np.zeros(round(.65*RATE),np.float32)]);cursor+=len(clip)/RATE+.65
save(WORK/'cast-reel.wav',np.concatenate(pieces))
subprocess.run(['ffmpeg','-y','-v','error','-i',str(WORK/'cast-reel.wav'),'-c:a','libmp3lame','-b:a','192k',str(ROOT/'renders/vaulted-checkout-cast-reel.mp3')],check=True)
clips=WORK/'.manim/videos/scenes/1080p30'
output=ROOT/'renders/vaulted-checkout-first-15s-ensemble.mp4'
subprocess.run(['ffmpeg','-y','-v','error','-i',str(clips/'S0.mp4'),'-i',str(clips/'S1.mp4'),'-i',str(WORK/'preview-voice.wav'),'-filter_complex','[0:v:0][1:v:0]concat=n=2:v=1:a=0,trim=duration=15,setpts=PTS-STARTPTS[v]','-map','[v]','-map','2:a:0','-t','15','-frames:v','450','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','192k','-ac','2','-movflags','+faststart',str(output)],check=True)
manifest={'video':output.name,'durationSeconds':15,'fps':30,'frames':450,'cast':cast,'previewSegments':sync,'reelChapters':chapters}
(WORK/'mix-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
# Sidecar captions identify exactly who speaks. The final partial visual beat is silent.
def stamp(t):
 ms=round(t*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
subs=[]
for i,b in enumerate([b for b in script['beats']if b['start']<15]):
 subs.append(f"{i+1}\n{stamp(b['start'])} --> {stamp(min(15,b['end']))}\n{b['speaker']}: {b['text']}\n")
(ROOT/'renders/vaulted-checkout-first-15s-ensemble.srt').write_text('\n'.join(subs))
print('Created ensemble opening and four-role cast reel.')
print('Maximum phrase tempo adjustment:',round(max(s['tempo']for s in sync),3))
print('Cast reel duration:',round(cursor,3),'seconds')
