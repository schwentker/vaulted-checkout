"""Small original, deterministic audio cues. No external voice or service."""
from pathlib import Path
import array
import math
import random
import wave

OUT=Path(__file__).resolve().parent/'audio'
OUT.mkdir(exist_ok=True)
SR=48000
PROFILES={'seal':(.13,[540,1130,2210]),'tick':(.07,[1400,2100]),'rules':(.17,[100,300,600]),'signature':(.22,[660,990]),'refusal':(.11,[90,180,360]),'confirmed':(.36,[880,1174,1568]),'ledger':(.12,[220,440])}
for index,(name,(duration,freqs)) in enumerate(PROFILES.items()):
    rng=random.Random(100+index)
    values=array.array('h')
    for j in range(int(duration*SR)):
        t=j/SR
        env=min(1,t/.003)*math.exp(-t/(duration*.22))
        tone=sum(math.sin(2*math.pi*f*t) for f in freqs)/len(freqs)
        noise=rng.uniform(-1,1)*(.35 if name in ['seal','refusal'] else .04)
        values.append(int(max(-1,min(1,(tone+noise)*env*.28))*32767))
    with wave.open(str(OUT/f'{name}.wav'),'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(SR);wav.writeframes(values.tobytes())
print('Created seven original 48 kHz sound cues.')
