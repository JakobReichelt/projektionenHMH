# WebSocket Test – Subdomain-based background videos

This server serves the website from `public/` and selects the background videos based on the request **subdomain**.

## How it works

- The client requests videos as `/1.mp4` … `/7.mp4`.
- The server looks at the request host (e.g. `leibniz.example.com`).
- If the subdomain matches a folder inside `assets/` (case-insensitive), videos are served from that folder:
   - `leibniz.*` → `assets/LEIBNIZ/1.mp4` … `assets/LEIBNIZ/7.mp4`
  - `niki.*` → `assets/NIKI/...`
  - `pferde.*` → `assets/PFERDE/...`

If the host has no subdomain (or doesn’t match a folder), the server falls back to the normal static file handling.

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
