# Fortune Mirror Deploy

Deploy fortune-mirror to production and test environments.

## Steps

1. **Build**: Run `npm run build` in ~/fortune-mirror
2. **Verify**: Check build output has no errors
3. **Push**: `git add -A && git commit && git push origin main`
4. **Auto-deploy**: m4pro auto-deploy.sh will pick up changes within 2 minutes:
   - fortune-mirror → npm build + sync → destinytelling.life live
   - telegram-claude-bot → restart scheduler.py (8787)
5. **Test site** (Cloud Run): If fortune-sandbox changes needed, run:
   ```
   cd ~/fortune-sandbox && gcloud run deploy fortune-sandbox --source . --region asia-east1
   ```
6. **Notify**: Send Telegram notification with changes summary

## Architecture
- destinytelling.life → m4pro:3081 (npx serve dist, B2C WizardApp)
- pro.destinytelling.life → m4pro:3082 (node pro-server.cjs, B2B App)
- test.destinytelling.life → Cloud Run fortune-sandbox (SDK direct)
- api.destinytelling.life → m4pro:3083 (horoscope_server.py)
- bot.velopulse.io → m4pro:8787 (scheduler.py, all API endpoints)

## Key Files
- ~/fortune-mirror/src/WizardApp.jsx — B2C main component
- ~/fortune-mirror/src/App.jsx — B2B Pro component
- ~/telegram-claude-bot/scheduler.py — Backend API (fortune, session, save, login)
- ~/fortune-mirror/public/default-kb.json — Knowledge base (101 entries)
