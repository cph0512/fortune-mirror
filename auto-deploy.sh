#!/bin/bash
# auto-deploy.sh — 偵測 git 新 commit，自動 build + deploy
# 只在 m4pro 上跑，其他機器只 push code

cd /Users/cph/fortune-mirror || exit 1

LOG="/tmp/fortune-autodeploy.log"
LOCK="/tmp/fortune-autodeploy.lock"

# Prevent concurrent runs
if [ -f "$LOCK" ]; then
  pid=$(cat "$LOCK")
  if kill -0 "$pid" 2>/dev/null; then
    exit 0
  fi
fi
echo $$ > "$LOCK"
trap "rm -f $LOCK" EXIT

# Fetch remote
git fetch origin main --quiet 2>/dev/null

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') New commits detected: $LOCAL -> $REMOTE" >> "$LOG"

# Pull
git pull origin main --quiet 2>>"$LOG"
if [ $? -ne 0 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: git pull failed" >> "$LOG"
  exit 1
fi

# Build
npm run build >> "$LOG" 2>&1
if [ $? -ne 0 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: npm build failed" >> "$LOG"
  exit 1
fi

# destinytelling.life (3081) — dist/ 直接 serve，自動生效
echo "$(date '+%Y-%m-%d %H:%M:%S') destinytelling.life updated (dist/)" >> "$LOG"

# Sync to fortune-sandbox static (for Cloud Run deploy)
rsync -a --delete /Users/cph/fortune-mirror/dist/ /Users/cph/fortune-sandbox/static/ \
  --exclude='default-kb.json' --exclude='default-kb.backup.json' --exclude='CNAME' 2>>"$LOG"
echo "$(date '+%Y-%m-%d %H:%M:%S') fortune-sandbox/static/ synced" >> "$LOG"

# Send Telegram notification
NEW_LOG=$(git log "$LOCAL".."$REMOTE" --oneline)
MSG="🔄 Fortune Mirror auto-deploy
${NEW_LOG}
✅ destinytelling.life updated
📦 sandbox static synced (run 'gcloud run deploy' to update test site)"

curl -s -X POST "https://api.telegram.org/bot8518579274:AAE1cpJRMKO6aMSgsHgYMej3VPyREVjoVrU/sendMessage" \
  -d chat_id=7147237450 \
  -d text="$MSG" \
  -d parse_mode="" > /dev/null 2>&1

echo "$(date '+%Y-%m-%d %H:%M:%S') Deploy complete, TG notified" >> "$LOG"
