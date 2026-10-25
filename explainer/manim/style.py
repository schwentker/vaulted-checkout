"""Shared visual constants for vector keyframes and Manim scenes."""
from pathlib import Path

WIDTH, HEIGHT = 1920, 1080
BLACK = '#111827'
WHITE = '#FFFFFF'
BLUE = '#1A56DB'
RED = '#DC2626'
YELLOW = '#F59E0B'
GRAY = '#6B7280'
MUTED = '#666660'
PALE = '#F5F5F2'
ROOT = Path(__file__).resolve().parents[1]
STILLS = ROOT / 'stills'
FUTURA = '/System/Library/Fonts/Supplemental/Futura.ttc'
MONO = '/System/Library/Fonts/Menlo.ttc'

# Coordinates stay constant across all four keyframes.
BOXES = {
    'buyer': (64, 270, 704, 550),
    'agent': (88, 334, 208, 146),
    'mcp': (88, 554, 208, 148),
    'spend': (344, 334, 400, 430),
    'bt': (800, 270, 464, 550),
    'signer': (824, 334, 416, 242),
    'vault': (824, 616, 416, 180),
    'merchant': (1320, 270, 536, 164),
    'facilitator': (1320, 482, 536, 128),
    'chain': (1320, 658, 536, 162),
}
