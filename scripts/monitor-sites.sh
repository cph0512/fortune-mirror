#!/bin/bash
# monitor-sites.sh — quick health probe for all three fortune sites.
#
# Modes:
#   ./monitor-sites.sh             # silent unless anomaly (for cron)
#   ./monitor-sites.sh --verbose   # always print full status (for post-deploy)
#   ./monitor-sites.sh --force-tg  # always push TG (for post-deploy)
#
# Probes per site (test / lab / oai):
#   1. Homepage (/) returns 200 + serves a bundle
#   2. /api/fortune POST reachable (expects 200 or 400/401 — not 5xx)
#   3. /api/fortune-logout returns 200
#   4. Bundle hash matches across all three sites
#
# Alerts via Telegram when any probe fails. Bot token lives in
# ~/telegram-claude-bot/.env (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).
set -u
VERBOSE=0
FORCE_TG=0
for arg in "$@"; do
  case "$arg" in
    --verbose) VERBOSE=1 ;;
    --force-tg) FORCE_TG=1 ;;
  esac
done

push_tg() {
  local text="$1"
  local env_file="$HOME/telegram-claude-bot/.env"
  [ -f "$env_file" ] || return 1
  local token chat
  token=$(grep '^TELEGRAM_BOT_TOKEN=' "$env_file" | cut -d= -f2)
  chat=$(grep '^TELEGRAM_CHAT_ID=' "$env_file" | cut -d= -f2)
  [ -z "$token" ] || [ -z "$chat" ] && return 1
  curl -s -o /dev/null -X POST "https://api.telegram.org/bot${token}/sendMessage" \
    -d chat_id="$chat" --data-urlencode "text=$text"
}

# Avoid `declare -A` (associative arrays require bash 4+, macOS ships 3.2).
# Store anomalies in a newline-separated string; bundles in parallel arrays.
SITES=(test lab oai)
ANOMALIES=""
BUNDLE_test=""
BUNDLE_lab=""
BUNDLE_oai=""

add_anomaly() {
  if [ -z "$ANOMALIES" ]; then ANOMALIES="$1"; else ANOMALIES="$ANOMALIES
$1"; fi
}

check() {
  local label=$1 expect=$2 got=$3
  if [[ "$got" =~ ^($expect)$ ]]; then
    [ "$VERBOSE" = 1 ] && echo "  ✓ $label: $got"
    return 0
  fi
  add_anomaly "$label: expected $expect, got $got"
  [ "$VERBOSE" = 1 ] && echo "  ✗ $label: expected $expect, got $got"
  return 1
}

for site in "${SITES[@]}"; do
  [ "$VERBOSE" = 1 ] && echo "=== $site ==="
  base="https://${site}.destinytelling.life"

  home_code=$(curl -s -o /dev/null -w "%{http_code}" "$base/" --max-time 10)
  check "$site home" "200" "$home_code"

  hash=$(curl -sL "$base/" --max-time 10 | grep -oE 'main-[a-zA-Z0-9_-]+\.js' | head -1)
  eval "BUNDLE_${site}=\"\$hash\""
  if [ -z "$hash" ]; then
    add_anomaly "$site: no bundle hash in HTML"
    [ "$VERBOSE" = 1 ] && echo "  ✗ $site bundle: missing"
  else
    [ "$VERBOSE" = 1 ] && echo "  ✓ $site bundle: $hash"
  fi

  api_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$base/api/fortune" \
    -H "Content-Type: application/json" -d '{}' --max-time 10)
  check "$site /api/fortune" "200|400|401" "$api_code"

  logout_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$base/api/fortune-logout" \
    -H "Content-Type: application/json" -d '{}' --max-time 10)
  check "$site /api/fortune-logout" "200" "$logout_code"
done

# Bundle parity
uniq_bundles=$(printf '%s\n%s\n%s\n' "$BUNDLE_test" "$BUNDLE_lab" "$BUNDLE_oai" | sort -u | wc -l | tr -d ' ')
if [ "$uniq_bundles" != "1" ]; then
  add_anomaly "bundle mismatch: test=$BUNDLE_test lab=$BUNDLE_lab oai=$BUNDLE_oai"
fi

# Report
TS=$(date +%Y-%m-%d\ %H:%M:%S)
if [ -z "$ANOMALIES" ]; then
  if [ "$VERBOSE" = 1 ] || [ "$FORCE_TG" = 1 ]; then
    msg="✅ monitor-sites $TS: all 12 probes OK (bundle $BUNDLE_test)"
    echo "$msg"
    [ "$FORCE_TG" = 1 ] && push_tg "$msg"
  fi
  exit 0
fi

# Anomaly path — always alert via TG
count=$(printf '%s\n' "$ANOMALIES" | wc -l | tr -d ' ')
body="🚨 monitor-sites anomaly $TS ($count issues)
$(printf '%s' "$ANOMALIES" | sed 's/^/• /')"
echo "$body"
push_tg "$body"
exit 1
