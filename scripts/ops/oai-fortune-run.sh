#!/bin/bash
# run-with-alert.sh — runs codex-fortune-api server.mjs and TG-alerts on
# abnormal exit. launchd will restart us per KeepAlive; this wrapper is
# here solely so operator gets notified when the service dies.
set -u

SERVICE_DIR="/Users/cph/Documents/New project/codex-fortune-api"
SERVER="$SERVICE_DIR/server.mjs"
NODE=/opt/homebrew/bin/node
LOG=/tmp/oai-fortune.log

# Rotate logs if they're huge (> 10MB) — keeps launchctl from filling disk.
for f in /tmp/oai-fortune.log /tmp/oai-fortune-stderr.log; do
  if [ -f "$f" ] && [ $(stat -f%z "$f" 2>/dev/null || echo 0) -gt 10485760 ]; then
    mv "$f" "$f.prev" 2>/dev/null || true
  fi
done

push_tg() {
  local text="$1"
  local env_file="$HOME/telegram-claude-bot/.env"
  [ -f "$env_file" ] || return 1
  local token chat
  token=$(grep '^TELEGRAM_BOT_TOKEN=' "$env_file" | cut -d= -f2)
  chat=$(grep '^TELEGRAM_CHAT_ID=' "$env_file" | cut -d= -f2)
  [ -z "$token" ] || [ -z "$chat" ] && return 1
  /usr/bin/curl -s -o /dev/null -X POST "https://api.telegram.org/bot${token}/sendMessage" \
    -d chat_id="$chat" --data-urlencode "text=$text" --max-time 5
}

echo "[$(date '+%F %T')] run-with-alert starting node $SERVER" >> "$LOG"
"$NODE" "$SERVER"
EXIT=$?

if [ "$EXIT" != "0" ]; then
  TS=$(date '+%F %T')
  push_tg "🚨 oai-fortune crashed at $TS (exit=$EXIT). launchd will restart. Check /tmp/oai-fortune-stderr.log" || true
  echo "[$TS] node exited with $EXIT" >> "$LOG"
fi
exit $EXIT
