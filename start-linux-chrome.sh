#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# A clean profile prevents an older service worker from displaying the old
# Worker/WASM recorder instead of the Linux FFmpeg exporter. Normal Chrome
# profiles, tabs, downloads and saved data are left unchanged.
if command -v google-chrome >/dev/null 2>&1; then
  export JIJI_CHROME_BIN=google-chrome
elif command -v google-chrome-stable >/dev/null 2>&1; then
  export JIJI_CHROME_BIN=google-chrome-stable
else
  echo 'Google Chromeが見つかりません。Chromeのインストールを確認してください。'
  exit 3
fi

echo 'JIJI FIGHTER: Linux Chrome専用の録画テスト版を起動します。'
echo 'MP4はLinuxのFFmpegでH.264/AACに変換します。'
export JIJI_CHROME_CLEAN=1
exec bash ./start-linux.sh
