"""Verify the complete encoded films and their independent protocol invariants."""
from pathlib import Path
import json,subprocess
import numpy as np
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent
D=json.loads((HERE/'storyboard.json').read_text());S=json.loads((HERE/'schedule.json').read_text());A=json.loads((ROOT/'renders/film104/audio-manifest.json').read_text())
assert D['durationSeconds']==104 and D['fps']==30 and len(D['frames'])==49
assert sum(s['durationFrames']for s in S['scenes'])==3120
assert len(A['turns'])==17 and len({t['voiceId']for t in A['turns']})==4
assert all(t['tempo']==1.0 and t['intactTake']for t in A['turns'])
assert len(A['soundEvents'])==7
lufs=[v['outputLufs']for v in A['roles'].values()];assert max(lufs)-min(lufs)<1
last=0
for t in A['turns']:
 assert t['speechStart']>=last and t['speechEnd']>t['speechStart'];last=t['speechEnd']
assert 104-last>=.9
key_anchors={}
for collection in [D['frames'],D['portraitFrames']]:
 cursor=0
 for f in collection:
  assert f['startFrame']==cursor and f['durationFrames']==f['endFrame']-f['startFrame'];cursor=f['endFrame']
  assert len(set(n['id']for n in f['nodes']))==len(f['nodes'])
  for n in f['nodes']:
   if n['id']in['wallet-key-body','portrait-wallet-key-body']:
    if n['id']not in key_anchors:key_anchors[n['id']]=n['points']
    assert n['points']==key_anchors[n['id']]
   if n['type']=='text':
    x0,y0,x1,y1=n['inkBounds'];assert min(x0,y0)>=0 and x1<=f['width']and y1<=f['height']
  text=[n['value']for n in f['nodes']if n['type']=='text']
  if f['scene']=='S5'and f['viewport']=='landscape':assert('paid'in text)==(f['step']==5)and('settled'in text)==(f['step']==5)
  if f['scene']=='S6':assert not f.get('access')and all(n['group']!='signature'for n in f['nodes'])
 assert cursor==3120
for aspect,size in [('landscape',(1920,1080)),('portrait',(1080,1350))]:
 p=ROOT/'renders'/f'vaulted-checkout-full-{aspect}.mp4'
 info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-show_chapters','-of','json',str(p)]))
 v=next(s for s in info['streams']if s['codec_type']=='video');a=next(s for s in info['streams']if s['codec_type']=='audio')
 assert(v['width'],v['height'])==size and v['r_frame_rate']=='30/1'and int(v['nb_frames'])==3120
 assert float(info['format']['duration'])==104 and a['codec_name']=='aac'and a['channels']==2 and len(info['chapters'])==10
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-vn','-ar','48000','-ac','1','-f','f32le','-'])
 audio=np.frombuffer(raw,np.float32);assert np.isfinite(audio).all()and abs(audio).max()<1
 for t in A['turns']:
  clip=audio[round(t['speechStart']*48000):round(t['speechEnd']*48000)]
  assert np.sqrt(np.mean(clip**2))>.012,t['id']
 # Final QA samples and key/paid ordering checks operate on encoded pixels.
 if aspect=='landscape':
  paid=next(f for f in D['frames']if f['scene']=='S5'and f['step']==5)
  def frame(at):
   buf=subprocess.check_output(['ffmpeg','-v','error','-ss',str(at),'-i',str(p),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
   return np.frombuffer(buf,np.uint8).reshape(1080,1920,3)
  for at,expected in [(paid['startFrame']/30-.15,False),(paid['startFrame']/30+.7,True)]:
   a=frame(at)[380:408,1700:1815];mask=(a[:,:,0]>180)&(a[:,:,1]>90)&(a[:,:,1]<200)&(a[:,:,2]<90)
   assert(mask.sum()>1000)==expected,(at,mask.sum())
  s4=next(s for s in S['scenes']if s['scene']=='S4')
  buf=subprocess.check_output(['ffmpeg','-v','error','-ss',str(s4['startFrame']/30),'-i',str(p),'-t',str(s4['durationFrames']/30),'-vf','crop=56:56:846:698','-pix_fmt','rgb24','-f','rawvideo','-'])
  a=np.frombuffer(buf,np.uint8).reshape(-1,56,56,3);dark=(a.max(3)<75)&(a.max(3).astype(int)-a.min(3)<45)
  assert len(a)==390 and(dark.sum((1,2))>1000).all()
 print('PASS',aspect,': 104 seconds, 3120 frames, audible intact dialogue, no clipping, ten chapters')
print('PASS: four matched actors within',round(max(lufs)-min(lufs),2),'LU, no accelerated speech, seven cues, fixed keys and confirmation ordering')
