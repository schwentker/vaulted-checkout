"""Create outlined SVG scene assets, used unchanged by the Manim still renderer.

Text becomes vector paths so SVG and Manim retain identical typography.
No secret or environment file is read. Key icons are abstract role symbols.
"""
from html import escape
import json
from functools import lru_cache
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from style import *


@lru_cache
def font(kind):
    return TTFont(MONO if kind == 'mono' else FUTURA,
                  fontNumber=0 if kind != 'bold' else 2)


class Diagram:
    def __init__(self, scene, title):
        self.scene = scene
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><title>{escape(title)}</title>']
        self.labels = []
        self.rect(0, 0, 1920, 1080, WHITE, stroke=WHITE, sw=0)

    def rect(self, x, y, w, h, fill=WHITE, stroke=BLACK, sw=5):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def box(self, name, fill=WHITE, stroke=BLACK, sw=5):
        self.rect(*BOXES[name], fill, stroke, sw)

    def path(self, data, fill='none', stroke=BLACK, sw=4):
        self.parts.append(f'<path d="{data}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def line(self, x1, y1, x2, y2, color=BLACK, sw=4):
        self.path(f'M{x1},{y1} L{x2},{y2}', stroke=color, sw=sw)

    def circle(self, x, y, r, fill, stroke=BLACK, sw=4):
        self.parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def text(self, value, x, y, size=38, color=BLACK, kind='regular', max_width=None):
        f = font(kind)
        glyphs, cmap, metrics = f.getGlyphSet(), f.getBestCmap(), f['hmtx'].metrics
        scale = size / f['head'].unitsPerEm
        names = [cmap.get(ord(c), '.notdef') for c in value]
        width = sum(metrics[g][0] for g in names) * scale
        if max_width is not None:
            assert width <= max_width, (self.scene, value, width, max_width)
        pen = SVGPathPen(glyphs)
        cursor = x
        for name in names:
            glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, y)))
            cursor += metrics[name][0] * scale
        self.parts.append(f'<g aria-label="{escape(value)}"><path d="{pen.getCommands()}" fill="{color}" stroke="none"/></g>')
        self.labels.append({'text': value, 'x': x, 'baseline': y, 'size': size, 'width': round(width, 2)})

    def key(self, x, y, size=34, color=BLACK):
        # Small notched square, not a literal key or credential value.
        self.path(f'M{x},{y} h{size} v{size*.55} h{-size*.28} v{size*.45} h{-size*.72} Z', color, color, 0)
        self.rect(x+size*.22, y+size*.22, size*.2, size*.2, WHITE, WHITE, 0)

    def arrow(self, points, color=BLACK, sw=4):
        self.path('M'+' L'.join(f'{x},{y}' for x,y in points), stroke=color, sw=sw)
        x,y=points[-1]
        px,py=points[-2]
        if x > px:
            self.path(f'M{x-12},{y-7} L{x},{y} L{x-12},{y+7}', stroke=color, sw=sw)
        elif x < px:
            self.path(f'M{x+12},{y-7} L{x},{y} L{x+12},{y+7}', stroke=color, sw=sw)
        else:
            sign = 1 if y > py else -1
            self.path(f'M{x-7},{y-sign*12} L{x},{y} L{x+7},{y-sign*12}', stroke=color, sw=sw)

    def save(self):
        STILLS.mkdir(parents=True, exist_ok=True)
        (STILLS / f'{self.scene}.svg').write_text('\n'.join(self.parts) + '\n</svg>\n')
        (STILLS / f'{self.scene}.labels.json').write_text(json.dumps(self.labels, indent=2)+'\n')


