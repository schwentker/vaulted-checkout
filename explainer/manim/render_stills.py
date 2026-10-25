"""Compatibility entry point for the current beat sign-off pipeline."""
from pathlib import Path
import subprocess
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
subprocess.run(['node',str(ROOT/'storyboard'/'build.mjs')],check=True)
subprocess.run([sys.executable,str(ROOT/'storyboard'/'render_vectors.py')],check=True)
subprocess.run([sys.executable,str(ROOT/'storyboard'/'write_docs.py')],check=True)
subprocess.run([sys.executable,str(HERE/'render.py'),'--beats','--scenes','S1','S2','S3','S4','S5'],check=True)
