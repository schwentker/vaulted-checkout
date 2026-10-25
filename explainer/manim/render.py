"""Render beat sign-off stills or timed scenes from the shared description."""
from pathlib import Path
import argparse
import json
import os
import shutil
import subprocess
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
p=argparse.ArgumentParser()
p.add_argument('--beats',action='store_true')
p.add_argument('--aspect',choices=['landscape','portrait'],default='landscape')
p.add_argument('--scenes',nargs='+',default=['S1','S2','S3','S4','S5'])
p.add_argument('--quality',choices=['low','full'],default='full')
args=p.parse_args()
data=json.loads((ROOT/'storyboard'/'storyboard.json').read_text())
env=dict(os.environ,VC_EXPLAINER_ASPECT=args.aspect)
media=ROOT/'stills'/'.manim'/args.aspect
resolution='1080,1350' if args.aspect=='portrait' else '1920,1080'
if args.quality=='low':
    resolution='432,540' if args.aspect=='portrait' else '768,432'
selected=[f for f in data['frames'] if f['scene'] in args.scenes]
names=[f"{f['scene']}B{f['step']:02d}" for f in selected] if args.beats else args.scenes
cmd=[sys.executable,'-m','manim','--disable_caching','--resolution',resolution,'--fps','30','--media_dir',str(media)]
if args.beats:cmd.append('-s')
cmd.extend([str(HERE/'scenes.py'),*names])
subprocess.run(cmd,check=True,env=env,cwd=HERE)
if args.beats:
    out=ROOT/'stills'/('portrait' if args.aspect=='portrait' else 'beats')
    for f,name in zip(selected,names):
        matches=list((media/'images').rglob(f'{name}_*.png'))
        if len(matches)!=1:raise RuntimeError((name,matches))
        shutil.copyfile(matches[0],out/f"{f['slide']:02d}-{f['scene']}-{f['step']:02d}.png")
    print(f'Exported {len(selected)} Manim beat stills ({args.aspect}).')
elif args.scenes==[f'S{i}' for i in range(10)]:
    final=ROOT/'renders'
    final.mkdir(exist_ok=True)
    normalized=[]
    for scene in args.scenes:
        clips=[x for x in (media/'videos').rglob(f'{scene}.mp4') if 'partial_movie_files' not in str(x)]
        if len(clips)!=1:raise RuntimeError((scene,clips))
        clip=clips[0]
        probe=subprocess.run(['ffprobe','-v','error','-select_streams','a','-show_entries','stream=index','-of','csv=p=0',str(clip)],capture_output=True,text=True,check=True)
        target=media/f'{scene}-normalized.mp4'
        command=['ffmpeg','-y','-v','error','-i',str(clip)]
        if not probe.stdout.strip():command+=['-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-shortest']
        command+=['-c:v','copy','-c:a','aac','-ac','2','-ar','48000',str(target)]
        subprocess.run(command,check=True)
        normalized.append(target)
    listing=media/'concat.txt'
    listing.write_text(''.join("file '"+str(p).replace("'","'\\''")+"'\n" for p in normalized))
    output=final/f'vaulted-checkout-{args.aspect}.mp4'
    subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(listing),'-c','copy',str(output)],check=True)
    print(f'Joined the 90-second captioned {args.aspect} render: {output}')
