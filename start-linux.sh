#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22以上が必要です。node --version で確認できます。"
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  echo "Node.js 22以上が必要です。"
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo 'PC動画をH.264/AAC形式のMP4として保存するにはFFmpegが必要です。'
  echo '次のコマンドで入れてください: sudo apt install ffmpeg'
  exit 2
fi
node build.mjs
exec node linux-server.mjs
