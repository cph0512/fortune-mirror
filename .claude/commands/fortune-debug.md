# Fortune Debug

Debug fortune-mirror issues across production and test environments.

## Quick Health Check
```bash
# All services status
curl -s localhost:3081 -o /dev/null -w "destiny: %{http_code}\n"
curl -s localhost:3082 -o /dev/null -w "pro: %{http_code}\n"
curl -s localhost:3083/api/horoscope/today -o /dev/null -w "horoscope: %{http_code}\n"
curl -s localhost:8787/health -o /dev/null -w "bot: %{http_code}\n"
curl -s https://destinytelling.life -o /dev/null -w "tunnel-destiny: %{http_code}\n"
curl -s https://bot.velopulse.io/health -o /dev/null -w "tunnel-bot: %{http_code}\n"
```

## Common Issues

### HTTP 530 — Cloudflare Tunnel down
```bash
launchctl stop com.cph.cloudflared && sleep 2 && launchctl start com.cph.cloudflared
```

### scheduler.py not responding (port 8787)
```bash
# Check if running
ps aux | grep scheduler | grep -v grep
# Check logs
tail -50 /tmp/scheduler.log
# Restart
launchctl stop com.cph.fortune-autodeploy  # auto-deploy will restart it
```

### fortune-serve not responding (port 3081)
```bash
launchctl stop com.cph.destiny-serve && sleep 1 && launchctl start com.cph.destiny-serve
```

## Architecture
```
Browser → Cloudflare Tunnel → m4pro localhost
                              ├── :3081 destinytelling.life (npx serve dist)
                              ├── :3082 pro.destinytelling.life (node pro-server.cjs)
                              ├── :3083 api.destinytelling.life (horoscope_server.py)
                              └── :8787 bot.velopulse.io (scheduler.py)
                                        ├── /api/fortune (analysis)
                                        ├── /api/fortune-save (readings)
                                        ├── /api/fortune-session (wizard state)
                                        ├── /api/fortune-login (auth)
                                        └── /api/fortune-track (analytics)
```

## Key Log Files
- `/tmp/scheduler.log` — scheduler.py
- `/tmp/horoscope-api.log` — horoscope server
- `/tmp/daily-horoscope.log` — daily cron
- `/tmp/cloudflared.log` — tunnel

## Test Site (Cloud Run)
```bash
# Check
curl -s https://fortune-sandbox-352618635098.asia-east1.run.app/api/fortune-login -X OPTIONS -w "%{http_code}\n"
# Deploy
cd ~/fortune-sandbox && gcloud run deploy fortune-sandbox --source . --region asia-east1
```
