#!/usr/bin/env bash
set -euo pipefail
# H.264 video and AAC audio for desktop JIJI FIGHTER recordings.
# Usage: bash scripts/convert-recording-linux.sh [recording.webm|recording.mp4]
if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  echo 'ffmpeg が見つかりません。sudo apt install ffmpeg を実行してください。' >&2
  exit 2
fi
if (( $# > 0 )); then
  src="$1"
else
  dir="$(xdg-user-dir DOWNLOAD 2>/dev/null || printf '%s' "$HOME/Downloads")"
  src="$(find "$dir" -maxdepth 1 -type f \( -name 'JIJI-FIGHTER*.webm' -o -name 'JIJI-FIGHTER*.mp4' \) -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
  if [[ -z "$src" ]]; then
    echo "録画が見つかりません: $dir" >&2
    exit 3
  fi
fi
if [[ ! -f "$src" ]]; then echo "ファイルがありません: $src" >&2; exit 4; fi
src="$(realpath "$src")"
base="$(printf '%s' "$src" | sed -E 's/\.(webm|mp4)$//')"
out="$base-X-COMPATIBLE.mp4"
if [[ "$src" == "$out" || -e "$out" ]]; then
  echo "変換済みのファイルまたは同名ファイルが存在します: $out" >&2
  exit 5
fi
trap 'rm -f -- "$out"' ERR
ffmpeg -hide_banner -nostdin -loglevel error -stats -i "$src" \
  -map 0:v:0 -map 0:a:0 \
  -c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p -r 30 \
  -c:a aac -profile:a aac_low -b:a 128k -ar 44100 -ac 2 \
  -movflags +faststart "$out"
video="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$out")"
audio="$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$out")"
if [[ "$video" != h264 || "$audio" != aac ]]; then
  rm -f -- "$out"
  echo "コーデックの検証に失敗: video=$video / audio=$audio" >&2
  exit 7
fi
trap - ERR
printf '変換成功（H.264 + AAC）:\n%s\n' "$out"
