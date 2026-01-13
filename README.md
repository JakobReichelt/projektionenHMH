# WebSocket Test – Subdomain-based background videos

This server serves the website from `public/` and selects the background videos based on the request **subdomain**.

It can also select the video set via a QR-code friendly query parameter: `?show=...`.

## How it works

- The client requests videos as `/1.mp4` … `/7.mp4`.
- The server looks at the request host (e.g. `leibniz.example.com`).
- If the subdomain matches a folder inside `assets/` (case-insensitive), videos are served from that folder:
   - `leibniz.*` → `assets/LEIBNIZ/1.mp4` … `assets/LEIBNIZ/7.mp4`
  - `niki.*` → `assets/NIKI/...`
  - `pferde.*` → `assets/PFERDE/...`

If the host has no subdomain (or doesn’t match a folder), the server falls back to the normal static file handling.

## QR codes / Railway hosting (recommended): `?show=`

When a user opens a link like:

- `https://<your-app-domain>/?show=niki`
- `https://<your-app-domain>/?show=leibniz`

the server stores that selection in a cookie (`show=<FOLDER>`). That way the page can keep requesting videos as `/1.mp4` … `/7.mp4` and the server still knows which `assets/<FOLDER>/` to use.

Selection priority when serving `/1.mp4`…`/7.mp4`:

1. `?show=<key>` on the video request (if present)
2. Cookie `show=<key>`
3. Subdomain (e.g. `niki.example.com`)
4. Fallback default folder

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
