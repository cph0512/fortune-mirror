# CONTEXT.md — fortune-mirror (命理三鏡)

AI 接續協定: 收到 `resume` → 讀此檔 → 摘要 Current State + Next step → 開工。離開前更新此檔並 commit+push。

---

## 🎯 Current State
- **Status**: in-progress
- **Branch**: `lab` (實驗分支, 穩定後 merge `main`)
- **Working on**: chat isolation, token monitor, heban KB top-k filtering, wizard bug fixes
- **Next step**: 待定 — Fortune Rating 評分系統方案 (A能量指數/B雷達圖/C色溫條/D標記) 需用戶決定; 或繼續 lab 分支 bug 修復; 或 P0 正式站 destinytelling.life 從 CLI 改走 SDK
- **Blockers**: Fortune Rating 方向未定; Email SMTP 未啟用 (見 Pending)

## 🗂 Project Overview
- **Purpose**: B2C 命理 AI 工具, 紫微/八字/占星/財運四系統交叉分析 (destinytelling.life)
- **Stack**: React + Vite (前端), 排盤引擎全前端 JS (iztro/lunar-javascript/circular-natal-horoscope-js), AI 走後端 Claude CLI (scheduler.py /api/fortune)
- **Key paths**:
  - `src/WizardApp.jsx` — B2C wizard 主頁
  - `src/ziwei-calc.js` / `bazi-calc.js` / `astro-calc.js` / `finance-calc.js` — 排盤引擎
  - `src/locales/{zh-TW,en,ja}.json` — 三語 i18n
  - `public/default-kb.json` — 知識庫 106 條
  - `src/FamilyChart.jsx` — 家族命盤
- **Entry points**:
  - Dev: `npm run dev` (port 3081)
  - Build: `npm run build`
  - Auto-deploy: push 進 git → m4pro `~/auto-deploy.sh` 每 2 分鐘拉+build+同步

## 🔑 Key Decisions
- [2026-04-06] **禁止 localStorage 作唯一存儲** — 所有用戶資料 server-first (fortune_saves/), localStorage 只當 cache
- [2026-04-06] **正式站走 Claude CLI** (Max plan 免費), **測試站 test.destinytelling.life 走 SDK** (Anthropic API, Prompt Caching)
- [2026-04-05] **家族命盤** 多人排盤 + 交叉飛化 + 切換主角
- **Claude 4 Opus** 為預設模型 (fortune-sandbox main.py)
- **禁止 emoji + 簡體字** 在分析結果中

## 🚧 Pending / TODO
- [ ] **P0**: 正式站 destinytelling.life 改用 SDK (目前 CLI)
- [ ] **P0**: Fortune Rating 系統 — 四方案討論待決 (見 ~/.claude/projects/-Users-cph/memory/pending_fortune_rating.md)
- [ ] **P0**: 找回密碼改 email reset link (目前是固定密碼)
- [ ] **P1**: 每日運勢 cron 自動生成 (Cloud Run Scheduler 或 LaunchAgent)
- [ ] **P1**: Email SMTP 啟用 (框架已建好, 需設 FORTUNE_SMTP_USER/PASS)
- [ ] **P2**: OEN 正式商戶帳號申請
- [ ] **P2**: Fortune Macro v4 — FDR 校正 / ETF 驗證 / 60年循環檢定
- [ ] **P3**: iOS Wallet Pass / PWA 推播

## 🐛 Known Issues
- **Bug**: 前端模型選單 (Sonnet/Opus/Haiku) 未傳 model 參數到後端
- **Security**: 已修, hardcoded reset password → 隨機生成 (commit 9757145)

## 📎 External Refs
- Prod: https://destinytelling.life (B2C wizard)
- Pro: https://pro.destinytelling.life (B2B 命理師)
- Test: https://test.destinytelling.life (SDK sandbox, Cloud Run)
- API: https://api.destinytelling.life (每日運勢)
- Gateway: fortune-api (Cloud Run)

## 🖥 Environment
- **Dev machine**: m4pro (port 3081 dev / 3082 pro / 3083 horoscope)
- **Backend**: bot.velopulse.io:8787 (scheduler.py in telegram-claude-bot repo)
- **Prod storage**: m4pro fortune_saves/*.json (users, saves 上限 50/人)
- **i18n**: 繁中 / English / 日本語 三語支援

## 📜 Session Log
### 2026-04-19 22:20 (m4pro, claude)
- 建立 CONTEXT.md 納入 Resume Protocol
- 尚未動主程式碼
- 下次從: Fortune Rating 方案決策 或 正式站改 SDK (P0) 二擇一

### (舊的 session 待補)
