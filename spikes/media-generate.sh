#!/bin/sh
# Disposable spike helper: generates synthetic test media for the R1/R2 spikes.
# Requires ffmpeg on PATH. Safe to delete this whole spikes/ directory later.
set -e
cd "$(dirname "$0")"
FF="ffmpeg -hide_banner -y"

echo "== R2 video fixtures =="

# Full-frame 3 Hz black/white flash, 1080p30, 8s, silent stereo AAC track.
# 30fps, 5 frames per state => 3 complete flash cycles per second.
$FF -f lavfi -i color=black:s=1920x1080:r=30:d=8 \
    -f lavfi -i color=white:s=1920x1080:r=30:d=8 \
    -f lavfi -i anullsrc=r=48000:cl=stereo \
    -filter_complex "[0:v][1:v]blend=all_expr='if(gt(mod(floor(N/5),2),0),A,B)'[v]" \
    -map "[v]" -map 2:a -shortest \
    -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k \
    r2-frame-sampling/flash-3hz-1080p30.mp4

# Continuous synthetic motion, 1080p30, 20s. For frame-drop / sampling-rate tests.
$FF -f lavfi -i testsrc2=s=1920x1080:r=30:d=20 \
    -f lavfi -i anullsrc=r=48000:cl=stereo \
    -shortest -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k \
    r2-frame-sampling/motion-1080p30.mp4

echo "== R1 audio fixtures =="

# MP3, stereo 44.1 kHz, increasing durations (last one is a deliberate stress case).
for d in 30 300 1800 3600; do
  $FF -f lavfi -i "sine=f=220:r=44100:d=$d" -ac 2 -c:a libmp3lame -b:a 128k \
      "r1-audio-memory/audio-${d}s-44100hz-2ch.mp3"
done

# AAC in .m4a, 48 kHz stereo, 5 min: exercises a different decoder path than MP3.
$FF -f lavfi -i "sine=f=220:r=48000:d=300" -ac 2 -c:a aac -b:a 128k \
    r1-audio-memory/audio-300s-48000hz-2ch.m4a

echo
echo "done. generated files:"
find r1-audio-memory r2-frame-sampling -type f \( -name '*.mp4' -o -name '*.mp3' -o -name '*.m4a' \) -exec ls -lh {} \;
