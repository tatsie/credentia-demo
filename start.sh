#!/usr/bin/env bash
# Starts Credentia in the background on 127.0.0.1:$PORT (default 3100). Idempotent.
# Optional: TUNNEL=1 ./start.sh also starts a Cloudflare quick tunnel (needs outbound port 7844).
cd "$(dirname "$0")"
PORT=${PORT:-3100}
mkdir -p storage
[ -f storage/app.db ] || node src/seed.js
URL=""
if [ "${TUNNEL:-0}" = "1" ]; then
  pgrep -f "cloudflared tunnel .*--url http://127.0.0.1:$PORT" >/dev/null || nohup ~/bin/cloudflared tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:$PORT > storage/tunnel.log 2>&1 &
  sleep 8; URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' storage/tunnel.log | head -1)
fi
pkill -f "node src/index.js"; sleep 0.5
PORT=$PORT PUBLIC_URL="${PUBLIC_URL:-$URL}" nohup node src/index.js >> storage/server.log 2>&1 &
sleep 1.5; echo "Credentia: http://127.0.0.1:$PORT ${URL:+ public: $URL}"
