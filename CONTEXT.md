# CONTEXT.md — fortune-mirror (命理三鏡)

AI 接續協定: 收到 `resume` → 讀此檔 → 摘要 Current State + Next step → 開工。離開前更新此檔並 commit+push。

---

## 🎯 Current State
- **Status**: in-progress — **資安修復剛 deploy, 待驗證**
- **Branch**: `lab` 和 `main` 已 merged 同步
- **Lab provider**: Gemini 3.1 (Flash-Lite / Pro-Preview)
- **Test provider**: Claude 4 (Opus)
- **OAI provider**: OpenAI GPT-5
- **Working on**: 等 sandbox deploy 完成後驗證資安修復 6 項測試 (見 Session Log)
- **Next step**: 使用者 rotate keys + 跑測試清單 + 看是否要把 goal-aware prompt/疊宮強制推上 prod (main)
- **Blockers**: 使用者需手動 rotate 5 把 API key / admin pw (外洩風險)

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
### 2026-04-21 06:15 (m4pro, claude) — 重大 session, 做了很多事

**三站架構確認**
- test.destinytelling.life = Claude (fortune-sandbox Cloud Run)
- lab.destinytelling.life = **Gemini 3.1** (fortune-lab Cloud Run, 新切換)
- oai.destinytelling.life = OpenAI gpt-5 (codex-fortune-api m4pro:8788)

**Gemini 3.1 上線 lab** (從 Claude 切換, commit efef231..63e1f0f)
- `gemini-3.1-flash-lite-preview` (default) / `gemini-3.1-pro-preview` (deep)
- Pricing table 修正 (原本 log 用 Sonnet 費率算 Gemini, 顯示 30x 超貴)
- Thinking tokens 計算 + 成本: 實際 Pro ~$0.05-0.10/次, Flash-Lite ~$0.005

**UI/UX 改善**
- Goal-aware 主動展開新分析 section (reset on re-analysis)
- i18n bug 修: `{{count}}` 顯示問題 (charts.analyses/family.members/family.analyses)
- 月份排序 bug 修 (12 月逐月 + 強制 1→12 順序)
- Dashboard 月曆解鎖 regex 修 (parseMonthHighlights 加 '個月'/'月走勢')

**決策 Advisor 強制疊宮 (寫死)**
- parseQuestionDateTime 擴充: 明天/後天/今天/下週X/下個月X號 (中英日)
- runDecision 三階段強制檢查: 日期 + 命盤 + 疊宮 全部必須
- 本命 + 大限 + 流年 + 流月 + 流日 (+流時 if given) 全跑成功才送 AI
- AI prompt 加「以流日為主判據」強制規則

**KB 同步 (三站 137 條 union)**
- merge lab 114 + sandbox 106 + public 101 → 137 unique entries
- 全部寫入 6 個位置 (3 backend + 3 frontend)
- Backup: ~/kb-backup-20260420-2306

**資安修復 (稽核 5 條全修)**
- sandbox: bcrypt 密碼 (lazy upgrade) + session token + owner/admin check
- sandbox: admin `?pw=` → 只接 Bearer header (+ 前端 admin panel 全改)
- sandbox: 新增本地 `/api/fortune-session` 實作 (file-backed)
- lab: handle_proxy 改 session.request (保留 DELETE) + 轉 Authorization header
- lab: 補 fortune-charts / fortune-save/delete / fortune-session / fortune-logout 路由
- oai: path traversal 修 (path.resolve + inside-dir check), "change-me" 移除
- scheduler.py: CORS 加 DELETE (刪命盤 bug 修)

**⏳ 進行中 (restart 後要驗證)**
- fortune-sandbox Cloud Run deploy: 背景跑中 (lab 已完成)
- 使用者需要自己 rotate 以下 key (外洩風險):
  - ANTHROPIC_API_KEY (硬編碼在 deploy.sh + git history)
  - OPENAI_API_KEY (.env tracked in git)
  - GEMINI_API_KEY (對話出現過)
  - ADMIN_PASSWORD (admin2026/cph2026)
  - AUDIT_WRITE_TOKEN

**測試清單 (restart 後)**
1. 舊帳號登入 → 看 log 有 `[SECURITY] upgraded legacy plaintext → bcrypt`
2. 無痕訪問 test.destinytelling.life/api/fortune-users → 應 401
3. A 用戶查 B 用戶 saves → 應 403
4. 登入後重整頁面 → session restore 應 work (前: 404 silent)
5. Lab 刪除命盤 → 應成功 (前: DELETE 被改 POST, drop auth)

**Commit 歷史 (lab 分支, 最近 session)**
- `efef231` Gemini pricing fix
- merged lab→main (fc06b87) 含 goal-aware + 監月份 + i18n count fix
- `7d7d7e4` decision 疊宮強制規則
- `0f9a50f` lab proxy 資安修 (轉 Authorization + 保留 method)

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
