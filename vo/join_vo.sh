#!/usr/bin/env bash
# Joins the per-beat clips into one track, each starting at its beat time.
# Run from /Users/andres/dev/vaulted-checkout (the folder that contains vo/). Needs ffmpeg: brew install ffmpeg
set -euo pipefail
ffmpeg -y -i vo/s0title_01.mp3 -i vo/s0title_02.mp3 -i vo/s0title_03.mp3 -i vo/s0title_04.mp3 -i vo/s1cast_01.mp3 -i vo/s1cast_02.mp3 -i vo/s1cast_03.mp3 -i vo/s1cast_04.mp3 -i vo/s1cast_05.mp3 -i vo/s1cast_06.mp3 \
  -filter_complex "[0:a]adelay=0|0[a0];[1:a]adelay=1440|1440[a1];[2:a]adelay=2880|2880[a2];[3:a]adelay=4080|4080[a3];[4:a]adelay=6000|6000[a4];[5:a]adelay=6987|6987[a5];[6:a]adelay=8961|8961[a6];[7:a]adelay=10442|10442[a7];[8:a]adelay=12662|12662[a8];[9:a]adelay=13896|13896[a9];[a0][a1][a2][a3][a4][a5][a6][a7][a8][a9]amix=inputs=10:normalize=0:dropout_transition=0,apad,atrim=0:15[out]" \
  -map "[out]" -c:a libmp3lame -q:a 2 vo15.mp3
echo "wrote vo15.mp3"
