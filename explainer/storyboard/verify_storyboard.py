"""Independent timing, trust-boundary, key-anchor and settlement checks."""
from pathlib import Path
import json
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
d=json.loads((ROOT/'storyboard'/'storyboard.json').read_text())
expected_seconds=[6,20,8,8,11,9,8,6,10,4]
expected_beats=[4,12,4,3,5,5,3,3,7,3]
assert len(d['frames'])==len(d['portraitFrames'])==49
assert d['durationSeconds']==90 and d['fps']==30
assert sum(x['durationFrames'] for x in d['scenes'])==2700
for i,s in enumerate(d['scenes']):
    assert s['durationFrames']==expected_seconds[i]*30
    assert s['beats']==expected_beats[i]
    assert len(s['narration'].split())/expected_seconds[i]<=2.5


def enters(a,b,rect):
    x0,y0,x1,y1=rect
    dx,dy=b[0]-a[0],b[1]-a[1]
    low,high=0.,1.
    for p,q in [(-dx,a[0]-x0),(dx,x1-a[0]),(-dy,a[1]-y0),(dy,y1-a[1])]:
        if abs(p)<1e-12:
            if q<0:return False
        elif p<0:low=max(low,q/p)
        else:high=min(high,q/p)
    return low<=high


anchor=None
phone_anchor=None
for collection,size in [(d['frames'],(1920,1080)),(d['portraitFrames'],(1080,1350))]:
    cursor=0
    for f in collection:
        assert f['startFrame']==cursor
        cursor=f['endFrame']
        assert f['endFrame']-f['startFrame']==f['durationFrames']
        assert len({n['id'] for n in f['nodes']})==len(f['nodes']),(f['scene'],f['step'],'duplicate id')
        texts=[n['value'] for n in f['nodes'] if n['type']=='text']
        for packet in [n for n in f['nodes'] if n['id']=='packet']:
            a,b=packet['x'],packet['y']
            c,e=a+packet['w'],b+packet['h']
            for label in [n for n in f['nodes'] if n['type']=='text']:
                x0,y0,x1,y1=label['inkBounds']
                assert min(c,x1)<=max(a,x0) or min(e,y1)<=max(b,y0),(f['scene'],f['step'],'packet obscures',label['value'])
        if f['scene']=='S5':
            assert ('paid' in texts)==(f['step']==5)
            assert ('settled' in texts)==(f['step']==5) if collection is d['frames'] else True
        if f['scene']=='S6':assert not f.get('access',False)
        if f.get('access'):assert f['scene']=='S4' and f['step']==4
        for n in f['nodes']:
            if n['id']=='wallet-key-body':
                if anchor is None:anchor=n['points']
                assert n['points']==anchor,'Master wallet anchor changed'
                assert all(824<=x<=1240 and 616<=y<=796 for x,y in n['points'])
            if n['id']=='portrait-wallet-key-body':
                if phone_anchor is None:phone_anchor=n['points']
                assert n['points']==phone_anchor,'Portrait wallet anchor changed'
            if n['type']=='text':
                a,b,c,e=n['inkBounds']
                assert a>=-1 and b>=-1 and c<=size[0]+1 and e<=size[1]+1,(f['scene'],f['step'],n['value'])
                if f['viewport']=='portrait' and n['group'] not in ['header','footer']:
                    assert n['size']>=64,n['value']
        if f['viewport']=='landscape' and f.get('motion',{}).get('kind') in ['order','requirements','proof','receipt']:
            p=f['motion']['path']
            for a,b in zip(p,p[1:]):assert not enters(a,b,(786,259,1278,831)),(f['scene'],f['step'],'commercial route crosses Basis Theory')
        folder=ROOT/'stills'/('portrait' if f['viewport']=='portrait' else 'beats')
        stem=f"{f['slide']:02d}-{f['scene']}-{f['step']:02d}"
        assert Image.open(folder/f'{stem}.png').size==size
        assert (folder/f'{stem}.svg').is_file()
    assert cursor==2700
retired=''.join(map(chr,[112,108,97,110,110,101,100]))
for p in list(ROOT.rglob('*'))+[ROOT.parent/'docs'/'handoff'/f'phase-{i}-explainer.md' for i in [1,2,3]]:
    if p.is_file() and p.suffix in ['.py','.mjs','.md','.json','.svg','.txt','.gitignore']:
        content=p.read_text()
        assert retired not in content.lower(),p
        assert '\u2014' not in content,p
print('PASS: 90 seconds, 49 beats, 2,700 frames, narration cadence, fixed key anchors, safe commercial routes, settlement ordering, both viewport assets and vocabulary')
