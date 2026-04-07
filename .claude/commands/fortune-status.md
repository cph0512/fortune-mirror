# Fortune Status

Quick overview of all fortune-mirror services, recent activity, and deployment state.

## Run these checks

### 1. Service health
```bash
for svc in "localhost:3081|destiny" "localhost:3082|pro" "localhost:3083/api/horoscope/today|horoscope" "localhost:8787/health|bot"; do
  url=$(echo $svc | cut -d'|' -f1); name=$(echo $svc | cut -d'|' -f2)
  code=$(curl -s -o /dev/null -w "%{http_code}" $url)
  echo "$name: $code"
done
```

### 2. Tunnel status
```bash
curl -s -o /dev/null -w "%{http_code}" https://destinytelling.life && echo " tunnel OK" || echo " tunnel DOWN"
```

### 3. Recent git activity
```bash
cd ~/fortune-mirror && git log --oneline -5
cd ~/telegram-claude-bot && git log --oneline -5
```

### 4. User stats
```bash
curl -s https://bot.velopulse.io/api/fortune-users | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d)} registered users')"
```

### 5. Today's horoscope status
```bash
ls ~/telegram-claude-bot/horoscopes/$(date +%Y-%m-%d)/ 2>/dev/null | wc -l | xargs -I{} echo "{} horoscopes generated today"
```

### 6. LaunchAgents status
```bash
for la in cloudflared destiny-serve destiny-pro horoscope-api fortune-autodeploy daily-horoscope claude-sync; do
  pid=$(launchctl list | grep "com.cph.$la" | awk '{print $1}')
  echo "$la: ${pid:--}"
done
```

## Report format
Summarize all results and send via Telegram if any issues found.
