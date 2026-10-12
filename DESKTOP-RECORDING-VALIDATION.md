# PC録画修正候補 — v0.11.16ベース

対象ブランチ: `fix/desktop-recording-01116`。main・Cloudflare Pagesは変更しない。
本書のテストはLinux Mintのユーザー実機確認の代わりにはならない。

## 原因と確認できた事実

- 調査時のmain (`c58d986a018ea4792e9cfe070441df6a635a0dae`) には
  「Worker・WASMを初期化中」と表示する旧CDN版が残っている。作業ブランチ
  (`ff51360761fa948a87dbf4b2ea8feba061d93c5d`) のローカルFFmpeg版とは別物。
  公開版がmain由来なら、作業ブランチを取得しても公開版の処理は変わらない。
- 旧コードは `@ffmpeg/ffmpeg@0.12.6` に `classWorkerURL` を渡していた。
  npmの同バージョンのclasses.js/UMDを確認すると、このオプションはWorker生成に
  使われず、内部の相対パスからWorkerを生成する。Blob URL化した本体に別の
  Worker Blob URLを渡しても、そのWorkerを起動する構成にはなっていなかった。
- SWはHTMLをnetwork-first、固定名 `mp4-share.js` をcache-firstで取得するため、
  新HTMLと旧JSが混在できた。SW更新も既存タブが閉じるまで待機する。
  新HTMLの参照先を内容ハッシュ付きファイル名に変更し、旧SWが制御中でも
  新ファイルを取得できることを再現テストで確認した。
- `build.mjs` は `src="mp4-share.js"` をチェックしながら
  `src="./mp4-share.js"` を挿入していた。照合を修正し、1回だけ読み込む。
- ソースのindex.htmlとdist/index.htmlは同じではない。起動スクリプトがbuildを実行し、
  ローカルサーバーはdistのみを配信する。ソースHTMLの直開きは確認対象外。
- 旧保存ブリッジはMediaRecorder、URL.createObjectURL、アンカーclickを横取りしていた。
  変換中の次の録画はactiveフラグで捨てられる経路があった。明示的な
  `JIJI_EXPORT.saveRecording(blob)` と順次処理に置き換えた。
- 既存録画テストにはローカル変換APIがあり、公開Web版の成立を証明していなかった。
  また、mobile指定だけでUAはdesktopのままだったため、デスクトップ処理を除外できて
  いなかった。UAを指定し、公開Web版テストでは変換APIを使わせない。

ユーザーPCの当時のキャッシュ・開いていたURL・MediaErrorの詳細は未取得。
そのため実機で旧処理が動いた原因をキャッシュだけと断定しない。

## 実装

| ファイル | 変更理由 |
|---|---|
| `mp4-share.js` | API横取りを廃止、録画ごとのキュー、元動画保持、コーデック検査、保存経路の分離 |
| `encoder/worker.js`・core・分割WASM・manifest | 同梱single-thread FFmpegを直接起動。CDN、ラッパーWorker、SharedArrayBuffer不要。WASMのサイズとSHA-256を検証 |
| `build.mjs` | JS重複読込防止、内容ハッシュ付き配信、明示的な保存呼出し、録画終了処理中の上書き防止、音声トラック確認、AudioContext再開、偶数の録画高 |
| `sw.js` | ビルド単位のキャッシュ名、他バージョンのキャッシュ横断検索を廃止 |
| `linux-server.mjs` | ビルド済みJSの配信、ローカル変換能力API、JS/HTMLのno-store |
| `linux-recording-export.mjs` | 接続切断時と時間超過時のFFmpegプロセス終了 |
| `linux-music-recovery.js` | 公開Webでも同じMP3から復旧、完全なHTTP 200・MIME検証、早期エラー捕捉、停止後の勝手な再生防止 |
| `scripts/test-*.mjs`・録画検証workflow・`.gitignore` | 実サーバー/静的Web/旧SW/複数録画/失敗/Google Chromeの検証と生成動画の保存 |

ゲーム本体・敵・ステージ・演出・LIVE API・元音源は変更していない。
BGMとビルド後MP3のSHA-256はともに
`0863fc072f4cd0891a0cb1857cbc48782a10fb573511b79e884ce7697baa377e`。
BGM音量0.28、SFX倍率0.32を維持する。

### 保存経路

- ブラウザがH.264/AACのMP4を生成した場合は、実ファイルのsample descriptionを確認して保存。
- Linuxローカル版: 同じ127.0.0.1サーバーの能力確認後にOS FFmpegを使用。
- 公開Web版: 同一オリジンに同梱したsingle-thread FFmpegを専用Workerで実行。
  ユーザーPCのFFmpegや外部変換サービスは呼ばない。
- WASMはCloudflare Pagesの単一ファイル制限を避けるため8MiB以下に分割。
  起動時に結合して直接wasmBinaryとして渡す。タイムアウトを延ばしただけの修正ではない。
- 変換失敗時は元動画のダウンロードを試み、各録画の「元動画を保存」も残す。
  元動画はページを閉じるまでメモリに保持する。大量・長時間録画のメモリ上限は未検証。

## 検証と限界

Linux上のPlaywright Chromium 141で、autoplay許可の特別フラグなしで検証。

- 実linux-server: MP3 HTTP 206/Content-Range、BGM再生、実404後の同一MP3復旧。
- 実linux-server: 連続2回の録画と死亡後自動保存。ffprobeでH.264/AAC。
- 静的Web相当: ローカル変換APIなしで同じ3本をブラウザ内変換。H.264/AAC。
- 最初の2録画はSFXをOFFにして元BGMの非無音を検査。
- 別テストでBGM OFFのレーザー音とBGM+レーザー音を保存・デコード。
  SFXのみの平均音量は約-48dB、BGM込みは約-36dB。
- 旧SW制御中の新JS読み込み、サブディレクトリ配信、2件の変換失敗、
  元動画のSHA-256完全一致、失敗後の次のMP4変換を確認。
- デスクトップ/モバイル相当の敵弾・接触・爆発・GAME OVER・フェードの既存テスト成功。
- モバイルはUAと画面サイズを変えたChromiumによる回帰確認のみ。
  実機Safariの正常性を証明したものではない。
- この作業環境ではGoogle Chrome本体を取得したが、OSのsocket制限で起動不可。
  workflowには実Google Chromeを別途インストールして録画を検証する工程を追加した。
- Linux Mint実機、スマートフォン実機、Xへの実投稿、長時間録画、LIVE APIの実サービス応答は未確認。
  LIVE処理は無変更で、実サーバーテストでは外部通信による取得失敗も見られた。
- H.264/AAC・yuv420p・30fps・AAC LC・44.1kHzを保存ファイルで確認する。
  Xへの投稿成否は長さ・サイズなどにも依存するので、実投稿成功とは表現しない。

## Linux Mintでの起動

現在の公開用フォルダーとは別に、デスクトップに確認専用フォルダーを作る。
Node.js 22以上が必要。通常のChromeデータは消さない。

```bash
sudo apt update && sudo apt install -y ffmpeg
(
  set -e
  cd "$(xdg-user-dir DESKTOP)"
  if [ -d JIJI-FIGHTER-recording-test/.git ]; then
    cd JIJI-FIGHTER-recording-test
    git fetch origin
    git switch fix/desktop-recording-01116
    git pull --ff-only origin fix/desktop-recording-01116
  else
    git clone --branch fix/desktop-recording-01116 --single-branch \
      https://github.com/Masato-Nasu/JIJI-FIGHTER.git JIJI-FIGHTER-recording-test
    cd JIJI-FIGHTER-recording-test
  fi
  git log -1 --oneline
  bash start-linux-chrome.sh
)
```

起動した新しいChromeの `http://127.0.0.1:番号/` を使用する。
既存の公開サイト/PWAタブは今回の修正版ではない。ターミナルは開いたままにする。

1. 最初はCLASSICで音と録画だけを確認。BGM ON、SFX ONを確認する。
2. 開始画面で録画を選び開始。レーザーを撃ち、録画のSTOPでMP4保存を確認する。
3. 再びRECで録画し、もう一度保存する。
4. 録画を選んでゲーム開始し、死亡→爆発→GAME OVER後の自動MP4保存を確認する。
5. ファイルを再生して映像、BGM、レーザー音、爆発音を確認する。
6. その後LIVEを選んで日本語話題語を確認する。

ファイル名を手入力せずコーデックを確認するコマンド:

```bash
python3 - <<'PY'
import pathlib, subprocess
folder=pathlib.Path(subprocess.check_output(['xdg-user-dir','DOWNLOAD'],text=True).strip())
files=sorted(folder.glob('JIJI-FIGHTER-*.mp4'),key=lambda p:p.stat().st_mtime,reverse=True)
if not files:
    raise SystemExit('ダウンロードフォルダーにJIJI-FIGHTERのMP4がありません')
print(files[0])
subprocess.run(['ffprobe','-v','error','-show_entries',
 'stream=codec_type,codec_name,profile,pix_fmt,sample_rate,channels','-of','json',str(files[0])],check=True)
PY
```

期待値: video=h264、pix_fmt=yuv420p、audio=aac。
失敗時は表示された全文と `window.JIJI_EXPORT.state`、
`window.JIJI_MUSIC_DIAGNOSTIC` を記録する。

実機確認前にmainへマージ/Cloudflareへデプロイしない。
