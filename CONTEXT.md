# CONTEXT.md — fortune-mirror (命理三鏡)

AI 接續協定: 收到 `resume` → 讀此檔 → 摘要 Current State + Next step → 開工。離開前更新此檔並 commit+push。

---

## 🎯 Current State
- **Status**: in-progress — **待 lab 驗證**
- **Branch**: `lab` (commit 63e1f0f: goal-aware prompt + oai 路由)
- **Working on**: 驗證 goal-aware deep analysis prompt (健康/財富/感情/事業/綜合 各自 5-6 段 + 12 個月逐月走勢) 在 lab.destinytelling.life 的效果
- **Next step**:
  1. 等 auto-deploy (每 2 分鐘) 推上 lab 站
  2. 走一次完整健康/財運分析, 驗證: 5+ 段飽滿 / 12 個月全寫 / 回應時間 ≤ 原 2x / token ≤ +50%
  3. 通過 → `git checkout main && git merge lab --ff-only && git push` 上 destinytelling.life
  4. 失敗 → 調整 prompt, 重新迭代
- **Blockers**: 無 (等 lab 結果)

## 🔥 Recent Change (2026-04-19)
- `src/WizardApp.jsx`: `getWizardSystemPromptZh(goalKey)` 改 goal-aware
  - `GOAL_FRAMEWORK` 常量: 每個 goal 都有 Section 4 (現況與趨勢, 5-6 段) + Section 5 (12 個月逐月)
  - 健康: 體質基底 / 近期身心 / 慢性趨勢 / 壓力源 / 長期課題 / 跨系統共鳴
  - 財富/感情/事業/綜合: 對應多面向框架
  - 篇幅警語: 專項主題禁止 3 段帶過
- OAI 站整合 (App.jsx, WizardApp.jsx): `oai.destinytelling.life` → `/api/fortune` 相對路徑
- Locales: OAI 站模型名改 GPT-5 mini/GPT-5/GPT-5 nano

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
- Prod: https://destinytelling.life (B2C wizard, `main` 分支)
- Lab: https://lab.destinytelling.life (實驗站, `lab` 分支, auto-deploy 每 2 分鐘)
- Pro: https://pro.destinytelling.life (B2B 命理師)
- Test: https://test.destinytelling.life (SDK sandbox, Cloud Run)
- OAI: https://oai.destinytelling.life (OpenAI 測試站, m4pro:8788)
- API: https://api.destinytelling.life (每日運勢)
- Gateway: fortune-api (Cloud Run)

## 🖥 Environment
- **Dev machine**: m4pro (port 3081 dev / 3082 pro / 3083 horoscope)
- **Backend**: bot.velopulse.io:8787 (scheduler.py in telegram-claude-bot repo)
- **Prod storage**: m4pro fortune_saves/*.json (users, saves 上限 50/人)
- **i18n**: 繁中 / English / 日本語 三語支援

## 📜 Session Log
### 2026-04-19 23:55 (m4pro, claude)
- 修復用戶回報「健康分析太短」問題
- 改: `src/WizardApp.jsx` — `getWizardSystemPromptZh` 改 goal-aware, 加 GOAL_FRAMEWORK
- 五個 goal (health/wealth/love/career/general) 各自 5-6 段 Section 4 + 12 個月逐月 Section 5
- 順手 commit 了之前未 commit 的 OAI 站整合 (App.jsx + WizardApp.jsx + locales)
- commit 63e1f0f 先推 lab 分支驗證, main 暫不動 (避免直接影響 prod)
- 下次從: 驗證 lab 效果 (篇幅/月份完整度/成本), 通過後 merge 回 main

### 2026-04-19 22:20 (m4pro, claude)
- 建立 CONTEXT.md 納入 Resume Protocol

### (舊的 session 待補)
