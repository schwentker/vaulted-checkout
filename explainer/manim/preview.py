"""Assemble the 15-second master from rendered scenes and timestamped speech.

No credentials or network access are needed by this assembler. Generate the
authorized ElevenLabs take separately, then provide its alignment and request
metadata in renders/preview-15/.
"""
from pathlib import Path
import json
import subprocess
import wave
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'renders'/'preview-15'
request=json.loads((WORK/'request.json').read_text())
alignment=json.loads((WORK/'alignment.json').read_text())['alignment']
assert ''.join(alignment['characters'])==request['text'],'Speech alignment mismatch'
samples=48000
duration=15
track=np.zeros(samples*duration,dtype=np.float32)
segments=[]
offset=0
for beat in request['beats']:
    length=len(beat['cue'])
    start=max(0,alignment['character_start_times_seconds'][offset]-.015)
    end=alignment['character_end_times_seconds'][offset+length-1]+.025
    slot=beat['end']-beat['start']-.055
    tempo=max(1.,(end-start)/slot)
    assert tempo<=1.65,('Narration needs a new take',beat['cue'],tempo)
    audio=subprocess.check_output([
        'ffmpeg','-v','error','-i',str(WORK/'narration-original.mp3'),
        '-af',f'atrim=start={start}:end={end},asetpts=PTS-STARTPTS,atempo={tempo:.9f},afade=t=in:d=0.004',
        '-ar',str(samples),'-ac','1','-f','f32le','-'])
    clip=np.frombuffer(audio,dtype='<f4').copy()
    # Tiny tail fade avoids a splice click while preserving the complete phrase.
    fade=min(round(.005*samples),len(clip))
    clip[-fade:]*=np.linspace(1,0,fade,dtype=np.float32)
    at=round((beat['start']+.025)*samples)
    assert at+len(clip)<=round(beat['end']*samples),('Phrase overruns beat',beat['cue'])
    track[at:at+len(clip)]+=clip
    segments.append({**beat,'sourceStart':start,'sourceEnd':end,'tempo':tempo,
                     'speechStart':at/samples,'speechEnd':(at+len(clip))/samples})
    offset+=length+1
raw=WORK/'narration-synced-raw.wav'
with wave.open(str(raw),'wb') as wav:
    wav.setparams((1,2,samples,0,'NONE','not compressed'))
    wav.writeframes((np.clip(track,-1,1)*32767).astype('<i2').tobytes())
voice=WORK/'narration-synced.wav'
subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw),'-af',
                'highpass=f=65,loudnorm=I=-17:TP=-2:LRA=7','-ar','48000','-c:a','pcm_s16le',str(voice)],check=True)
clips=ROOT/'stills'/'.manim'/'landscape'/'videos'/'scenes'/'1080p30'
output=ROOT/'renders'/'vaulted-checkout-first-15s.mp4'
subprocess.run(['ffmpeg','-y','-v','error','-i',str(clips/'S0.mp4'),'-i',str(clips/'S1.mp4'),'-i',str(voice),
    '-filter_complex','[0:v:0][1:v:0]concat=n=2:v=1:a=0,trim=duration=15,setpts=PTS-STARTPTS[v]',
    '-map','[v]','-map','2:a:0','-t','15','-frames:v','450','-c:v','libx264','-preset','medium',
    '-crf','18','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','192k','-ac','2',
    '-movflags','+faststart',str(output)],check=True)
manifest={'output':output.name,'durationSeconds':15,'frames':450,'fps':30,'width':1920,'height':1080,
          'voiceId':request['voiceId'],'model':request['model_id'],'voiceSettings':request['voice_settings'],
          'segments':segments,'ending':'Next visual beat begins at 14.4 seconds. Its narration continues beyond this preview and is omitted here.'}
(WORK/'sync-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Created {output}')
print(f'{len(segments)} complete phrases, maximum tempo adjustment {max(x["tempo"] for x in segments):.3f}.')
