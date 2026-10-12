# Browser MP4 encoder

Vendored unmodified `@ffmpeg/core` 0.12.10 UMD JavaScript and WASM from
https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz .
Single-thread build. GPL-2.0-or-later (see COPYING); upstream source/build
instructions: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10
and https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/build .

The WASM is split into binary parts below 25 MiB for Cloudflare Pages.
Concatenate part0 + part1 + part2 + part3 to recover the exact upstream ffmpeg-core.wasm.
manifest.json records lengths and SHA-256 hashes, checked before instantiation.
worker.js is the game's own classic worker adapter; no wrapper/worker version
mismatch, remote CDN, shared memory, or cross-origin isolation is involved.
