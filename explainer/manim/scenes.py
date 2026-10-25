"""49 timed beats, shared last-frame exports, captions and bounded portrait views."""
from pathlib import Path
import json
import os
import numpy as np
from manim import (MovingCameraScene, Scene, SVGMobject, Rectangle, Circle,
                   VMobject, VGroup, FadeIn, FadeOut, Transform, MoveAlongPath,
                   Indicate, LaggedStart, config, linear, smooth)

ROOT=Path(__file__).resolve().parents[1]
DATA=json.loads(Path(os.environ.get('VC_EXPLAINER_STORYBOARD',str(ROOT/'storyboard'/'storyboard.json'))).read_text())
PORTRAIT=os.environ.get('VC_EXPLAINER_ASPECT','landscape')=='portrait'
FRAMES=DATA['portraitFrames'] if PORTRAIT else DATA['frames']
W,H=(1080,1350) if PORTRAIT else (1920,1080)
FW,FH=(8,10) if PORTRAIT else (16,9)
config.frame_width,config.frame_height=FW,FH
config.background_color='#FFFFFF'


def point(x,y):
    return np.array([(x-W/2)/(W/FW),(H/2-y)/(H/FH),0.])


def layer(n,index):
    if n['id'] in ['wallet-key-body','portrait-wallet-key-body']:
        return 500
    if n['id'] in ['wallet-key-hole','portrait-wallet-key-hole']:
        return 501
    return index


def make(n):
    scale=W/FW
    line=n.get('stroke','#111827')
    fill=n.get('fill','none')
    if n['type']=='text':
        x0,y0,x1,y1=n['inkBounds']
        m=SVGMobject(str(ROOT/n['glyphAsset']),width=(x1-x0)/scale,height=None)
        m.move_to(point((x0+x1)/2,(y0+y1)/2))
        m.set_opacity(n.get('opacity',1))
        return m
    if n['type']=='rect':
        m=Rectangle(width=n['w']/scale,height=n['h']/scale)
        m.move_to(point(n['x']+n['w']/2,n['y']+n['h']/2))
    elif n['type']=='circle':
        m=Circle(radius=n['r']/scale).move_to(point(n['x'],n['y']))
    else:
        pts=[point(x,y) for x,y in n['points']]
        if n['closed']:
            pts.append(pts[0])
        m=VMobject().set_points_as_corners(pts)
    m.set_fill(fill if fill!='none' else '#FFFFFF',opacity=0 if fill=='none' else 1)
    m.set_stroke(line if line!='none' else '#111827',width=n.get('sw',0),opacity=0 if line=='none' else 1)
    return m


def key_guard(frame):
    """The key's source geometry never translates toward the signer."""
    name='portrait-wallet-key-body' if PORTRAIT else 'wallet-key-body'
    found=[n for n in frame['nodes'] if n['id']==name]
    if not found:
        return
    assert len(found)==1,'Duplicate wallet glyph'
    x,y,s=(155,820,96) if PORTRAIT else (850,703,49)
    expected=[[x,y],[x+s,y],[x+s,y+s*.55],[x+s*.72,y+s*.55],[x+s*.72,y+s],[x,y+s]]
    assert np.allclose(found[0]['points'],expected),'Wallet key moved inside its containment view'


class TimedScene(MovingCameraScene):
    scene_id='S0'

    def play(self,*animations,**kwargs):
        # Quantize every transition before Manim samples it at 30 fps.
        if 'run_time' in kwargs:
            frames=max(1,round(kwargs['run_time']*30))
            kwargs['run_time']=np.nextafter(frames/30,0.)
        return super().play(*animations,**kwargs)

    def guard_key_geometry(self,m,n):
        """Assert exact screen-relative key geometry on every rendered frame."""
        if n['id'] not in ['wallet-key-body','portrait-wallet-key-body']:
            return m
        anchor=m.get_center().copy()
        width,height=m.width,m.height
        def check(dt):
            key=m
            if key not in self.get_mobject_family_members():
                return
            assert np.allclose(key.get_center()-self.camera.frame.get_center(),anchor,atol=1e-8),'Wallet key shifted on screen'
            assert abs(key.width-width)<1e-8 and abs(key.height-height)<1e-8,'Wallet key scaled during a transition'
            assert key.z_index==500,'Wallet key lost its visibility layer'
            self.key_geometry_samples+=1
        # Scene checks run after both composition and camera interpolation.
        # Mobject updaters also run on animation copies before interpolation.
        self.add_updater(check)
        return m

    def construct(self):
        beats=[f for f in FRAMES if f['scene']==self.scene_id]
        self.items={}
        self.spec={}
        self.view_offset=np.zeros(3)
        self.key_geometry_samples=0
        previous=[f for f in FRAMES if f['slide']<beats[0]['slide']]
        if previous:
            for i,n in enumerate(previous[-1]['nodes']):
                m=self.guard_key_geometry(make(n).set_z_index(layer(n,i)),n)
                self.items[n['id']]=m
                self.spec[n['id']]=n
                self.add(m)
        for beat in beats:
            self.play_beat(beat)
        expected=sum(f['durationFrames'] for f in beats)/30
        assert abs(self.time-expected)<1/30+1e-6,(self.scene_id,self.time,expected)
        if self.key_geometry_samples:
            print(f'{self.scene_id}: {self.key_geometry_samples} exact key-geometry frame checks passed.')

    def play_beat(self,f):
        key_guard(f)
        start=self.time
        duration=f['durationFrames']/30
        target={n['id']:n for n in f['nodes']}
        # The view offset moves the complete composition with its camera.
        # Individual wallet glyphs never receive an independent translation.
        if PORTRAIT:
            cx,cy=f['cameraPlan']['center']
            off=np.array([np.clip((cx-960)/1920,-.25,.25),np.clip((540-cy)/1080,-.15,.15),0.])
            delta=off-self.view_offset
            if np.linalg.norm(delta)>1e-8 and self.items:
                group=VGroup(*self.items.values())
                self.play(group.animate.shift(delta),self.camera.frame.animate.move_to(off),run_time=min(.2,duration*.15),rate_func=smooth)
            else:
                self.camera.frame.move_to(off)
            self.view_offset=off
        changes=[]
        removed=[]
        morph=(f['scene']=='S8' and f['step']==1) or (f['scene']=='S9' and f['step']==1)
        if morph:
            aliases={'buyer-shell':'matrix-agent-0','buyer-name':'matrix-agent-1',
                     'spend-0':'matrix-spend-0','spend-1':'matrix-spend-1',
                     'merchant-0':'matrix-merchant-0','merchant-1':'matrix-merchant-1',
                     'bt-0':'matrix-bt-0','bt-1':'matrix-bt-1',
                     'vault-0':'matrix-bt-2','vault-1':'matrix-bt-3'}
            if f['scene']=='S9':
                aliases={v:k for k,v in aliases.items()}
                for source,label in [('matrix-spend-1','spend service'),('matrix-merchant-1','merchant'),('matrix-bt-1','basis theory'),('matrix-bt-3','vault')]:
                    match=next((n['id'] for n in f['nodes'] if n['type']=='text' and n['value']==label),None)
                    if match:
                        aliases[source]=match
            aliases=f.get('morphAliases',aliases)
            for old,new in aliases.items():
                if old in self.items and new in target:
                    self.items[new]=self.items.pop(old)
                    self.spec[new]=self.spec.pop(old)
        for name,m in self.items.items():
            if name not in target:
                changes.append(FadeOut(m));removed.append(name)
        new_items={}
        for i,n in enumerate(f['nodes']):
            name=n['id']
            if name=='packet' and f.get('motion') and not PORTRAIT:
                continue
            if name in self.items and self.spec.get(name)==n:
                self.items[name].set_z_index(layer(n,i))
                continue
            m=self.guard_key_geometry(make(n).set_z_index(layer(n,i)),n).shift(self.view_offset)
            if f.get('effect')=='transfer' and not PORTRAIT and n['group']=='chain-transfer' and n['type']=='circle':
                m.shift(np.array([-.6,0,0]))
            if name in self.items:
                self.items[name].set_z_index(layer(n,i))
                changes.append(Transform(self.items[name],m))
            else:
                new_items[name]=m;changes.append(FadeIn(m))
        if changes:
            self.play(*changes,run_time=min(.85 if morph else .3,duration*.48 if morph else duration*.2))
        for name in removed:
            self.items.pop(name,None)
        self.items.update(new_items)
        self.spec=target
        if f.get('sound') and f.get('effect')=='confirmed':
            self.add_sound(str(ROOT/'manim'/'audio'/f"{f['sound']}.wav"),gain=-13)
        if f.get('motion') and not PORTRAIT:
            # An explicit packet has an origin and follows the correct lane.
            n=target['packet'];p=f['motion']['path']
            token=make(n).move_to(point(*p[0])).set_z_index(1000)
            if 'packet' in self.items:
                self.remove(self.items.pop('packet'))
            self.add(token)
            route=VMobject().set_points_as_corners([point(x,y) for x,y in p])
            self.play(MoveAlongPath(token,route),run_time=min(.75,duration*.44),rate_func=linear)
            self.items['packet']=token
        if f.get('sound') and f.get('effect')!='confirmed':
            sound=ROOT/'manim'/'audio'/f"{f['sound']}.wav"
            if not sound.is_file():
                raise FileNotFoundError(sound)
            self.add_sound(str(sound),gain=-13)
        if f.get('effect')=='rule-ticks':
            ticks=[self.items[n['id']] for n in f['nodes'] if n['group'] in ['rules','portrait-rules'] and n['type']=='poly']
            if ticks:
                self.play(LaggedStart(*[Indicate(m,scale_factor=1.06) for m in ticks],lag_ratio=.15),run_time=.35)
        if f.get('effect') in ['ledger','confirmed','refusal']:
            candidates=[m for name,m in self.items.items() if f['effect'].split('-')[0] in name]
            if candidates:
                self.play(Indicate(VGroup(*candidates),scale_factor=1.015),run_time=min(.2,duration*.12))
        if f.get('effect')=='transfer' and not PORTRAIT:
            coins=[m for name,m in self.items.items() if name.startswith('chain-transfer') and isinstance(m,Circle)]
            if coins:
                # Three illustrative discs together represent 1.5 USDC total.
                self.play(VGroup(*coins).animate.shift(np.array([.6,0,0])),run_time=.45)
        remaining_frames=f['durationFrames']-round((self.time-start)*30)
        if remaining_frames<0:
            raise RuntimeError(f"Beat overrun: {f['scene']}/{f['step']}")
        if remaining_frames:
            self.wait(np.nextafter(remaining_frames/30,0.),frozen_frame=False)


class BeatStill(Scene):
    beat_id=1

    def construct(self):
        f=FRAMES[self.beat_id-1]
        key_guard(f)
        for i,n in enumerate(f['nodes']):
            self.add(make(n).set_z_index(layer(n,i)))
        self.wait(1/30)


for _i in range(10):
    globals()[f'S{_i}']=type(f'S{_i}',(TimedScene,),{'scene_id':f'S{_i}','__module__':__name__})
for _f in FRAMES:
    _name=f"{_f['scene']}B{_f['step']:02d}"
    globals()[_name]=type(_name,(BeatStill,),{'beat_id':_f['slide'],'__module__':__name__})

# Friendly aliases retained for existing render commands.
S0Title=S0
S1Cast=S1
S8Ownership=S8
S9Close=S9
