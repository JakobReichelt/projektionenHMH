# WebSocket Test – Subdomain-based background videos

This server serves the website from `public/` and selects the background videos based on the request **subdomain**.

It can also select the video set via a QR-code friendly query parameter: `?show=...`.

## How it works

- Non-iOS browsers request videos as `/1.mp4` … `/6.mp4`.
- iOS/Safari requests HLS playlists as `/1.m3u8` … `/6.m3u8` (which reference `.ts` segments like `/1_000.ts`).
- The server looks at the request host (e.g. `leibniz.example.com`).
- If the subdomain matches a folder inside `assets/` (case-insensitive), videos are served from that folder:
   - `leibniz.*` → `assets/LEIBNIZ/1.mp4` … `assets/LEIBNIZ/6.mp4`
  - `niki.*` → `assets/NIKI/...`
  - `pferde.*` → `assets/PFERDE/...`

If the host has no subdomain (or doesn’t match a folder), the server falls back to the normal static file handling.

## QR codes / Railway hosting (recommended): `?show=`

When a user opens a link like:

- `https://<your-app-domain>/?show=niki`
- `https://<your-app-domain>/?show=leibniz`

the server stores that selection in a cookie (`show=<FOLDER>`). That way the page can keep requesting videos as `/1.mp4` … `/6.mp4` and the server still knows which `assets/<FOLDER>/` to use.

Selection priority when serving `/1.mp4`…`/6.mp4`:

1. `?show=<key>` on the video request (if present)
2. Cookie `show=<key>`
3. Subdomain (e.g. `niki.example.com`)
4. Fallback default folder

Selection priority also applies for HLS requests (`/1.m3u8`, `/1_000.ts`, etc.).

## Converting all MP4s to HLS

Install FFmpeg and ensure `ffmpeg` is in your PATH, then run:

- Convert all `assets/**.mp4` to `assets/**.m3u8` + `assets/**_000.ts`… (fast, no re-encode):
   - `python tools/mp4_inspect.py --assets assets --to-hls`

Optional flags:

- Overwrite existing outputs:
   - `python tools/mp4_inspect.py --assets assets --to-hls --force`
- Transcode to H.264/AAC for max iOS compatibility (slower):
   - `python tools/mp4_inspect.py --assets assets --to-hls --transcode`

## Fix slow MP4 startup on iOS (fast start)

If iOS Safari loads MP4s very slowly, a common cause is that the MP4 metadata (`moov` atom) is at the end of the file.

This tool can rewrite MP4s in-place so playback can start immediately (no re-encode; requires FFmpeg):

- `python tools/mp4_inspect.py --assets assets --faststart`

Or via npm:

- `npm run mp4:faststart`

## Local testing (Windows)

1. Ensure Node.js is installed (so `node` works in PowerShell).
2. Start the server:
   - `node server.js`
3. Add hosts entries (run Notepad as Administrator):
   - Open `C:\Windows\System32\drivers\etc\hosts`
   - Add:
     - `127.0.0.1 leibniz.localhost`
     - `127.0.0.1 niki.localhost`
     - `127.0.0.1 pferde.localhost`
4. Visit:
   - `http://leibniz.localhost:8080/`
   - `http://niki.localhost:8080/`
   - `http://pferde.localhost:8080/`

Each should load `/1.mp4`… from its matching `assets/<FOLDER>/`.

### Local testing with `?show=`

- `http://localhost:8080/?show=niki`
- `http://localhost:8080/?show=leibniz`

Tip: `?show=` (empty) clears the cookie.

