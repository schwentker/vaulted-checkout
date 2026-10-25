"""Render both viewport states and prepare outlined glyphs for Manim."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'manim'))
from diagrams import Diagram, font


def measure(value, size, kind='regular'):
    f = font(kind)
    return sum(f['hmtx'].metrics[f.getBestCmap().get(ord(c), '.notdef')][0]
               for c in value) * size / f['head'].unitsPerEm


def wrap(n):
    if measure(n['value'], n['size'], n['kind']) <= n['w']:
        return [n]
    words, lines, current = n['value'].split(), [], ''
    for word in words:
        candidate = (current+' '+word).strip()
        if measure(candidate, n['size'], n['kind']) > n['w'] and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return [{**n, 'id': n['id']+f'-line-{i}', 'value': v,
             'y': n['y']+i*n['size']*1.12} for i,v in enumerate(lines)]


def draw(d, n):
    t = n['type']
    if t == 'rect':
        d.rect(n['x'],n['y'],n['w'],n['h'],n['fill'],n['stroke'],n['sw'])
    elif t == 'circle':
        d.circle(n['x'],n['y'],n['r'],n['fill'],n['stroke'],n['sw'])
    elif t == 'poly':
        d.path('M'+' L'.join(f'{x},{y}' for x,y in n['points'])+(' Z' if n['closed'] else ''),n['fill'],n['stroke'],n['sw'])
    elif t == 'text':
        d.text(n['value'],n['x'],n['y'],n['size'],n['color'],n['kind'],n['w'])
        if n.get('opacity',1)!=1:
            d.parts[-1]=d.parts[-1].replace('<g ',f'<g opacity="{n["opacity"]}" ',1)


def text_asset(n):
    cache = ROOT / 'manim' / '.glyphs'
    cache.mkdir(exist_ok=True)
    h=hashlib.sha256(json.dumps(n,sort_keys=True).encode()).hexdigest()[:24]
    out=cache/f'{h}.svg'
    d=Diagram('glyph','glyph')
    d.parts=[]
    draw(d,n)
    f=font(n['kind']); glyphs=f.getGlyphSet(); cmap=f.getBestCmap()
    scale=n['size']/f['head'].unitsPerEm; pen=BoundsPen(glyphs); x=n['x']
    for c in n['value']:
        name=cmap.get(ord(c),'.notdef')
        glyphs[name].draw(TransformPen(pen,(scale,0,0,-scale,x,n['y'])))
        x+=f['hmtx'].metrics[name][0]*scale
    b=pen.bounds or (n['x'],n['y'],n['x']+1,n['y']+1)
    x0,y0,x1,y1=b
    out.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {max(1,x1-x0)} {max(1,y1-y0)}">'+''.join(d.parts)+'</svg>')
    n['inkBounds']=list(b)
    n['glyphAsset']=str(out.relative_to(ROOT))


def render(f, dest):
    d=Diagram('beat',f['cue'])
    w,h=f['width'],f['height']
    d.parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">']
    d.rect(0,0,w,h,'#FFFFFF','#FFFFFF',0)
    expanded=[]
    for n in f['nodes']:
        expanded.extend(wrap(n) if n['type']=='text' else [n])
    f['nodes']=expanded
    for n in expanded:
        draw(d,n)
        if n['type']=='text':
            text_asset(n)
    stem=f"{f['slide']:02d}-{f['scene']}-{f['step']:02d}"
    dest.mkdir(parents=True,exist_ok=True)
    svg=dest/f'{stem}.svg'
    svg.write_text('\n'.join(d.parts)+'\n</svg>\n')
    subprocess.run(['rsvg-convert','-o',str(dest/f'{stem}.png'),str(svg)],check=True)
    return stem,d.labels


def main():
    data=json.loads((HERE/'storyboard.json').read_text())
    for folder in [HERE/'frames',ROOT/'stills'/'beats',ROOT/'stills'/'portrait']:
        folder.mkdir(parents=True,exist_ok=True)
        for p in folder.iterdir():
            if p.suffix in ['.svg','.png','.json']:
                p.unlink()
    for f in data['frames']:
        stem,labels=render(f,ROOT/'stills'/'beats')
        for suffix in ['svg','png']:
            shutil.copyfile(ROOT/'stills'/'beats'/f'{stem}.{suffix}',HERE/'frames'/f'{stem}.{suffix}')
        if f['step']==f['steps']:
            name={'S0':'S0-title','S1':'S1-cast','S8':'S8-ownership','S9':'S9-close'}.get(f['scene'])
            if name:
                for suffix in ['svg','png']:
                    shutil.copyfile(ROOT/'stills'/'beats'/f'{stem}.{suffix}',ROOT/'stills'/f'{name}.{suffix}')
                (ROOT/'stills'/f'{name}.labels.json').write_text(json.dumps(labels,indent=2)+'\n')
    for f in data['portraitFrames']:
        render(f,ROOT/'stills'/'portrait')
    (HERE/'storyboard.json').write_text(json.dumps(data,indent=2)+'\n')
    print('Rendered 49 widescreen and 49 portrait beat pairs, with Manim glyph assets.')


if __name__=='__main__':
    main()
