# CONTEXT.md — fortune-mirror (命理三鏡)

AI 接續協定: 收到 `resume` → 讀此檔 → 摘要 Current State + Next step → 開工。離開前更新此檔並 commit+push。

---

## 🎯 Current State
- **Status**: Phase 1 + Phase 2 (a-f) 全部 landed + 三站部署一致。收費前主要 infrastructure 到位。
- **Branch**: `lab` (和 `main` 皆同步)
- **Family 分析模型對齊**: test=Claude Opus 4 / lab=Gemini 3.1 Pro / oai=GPT-5 full (都升級自 default 了, family 穩定引用飛化)
- **Working on**: 煙測 + 收費前 checklist (可選) / Phase 2d.2 深層大限 / 追問流日 (2c) 剛 ship 待驗
- **Next step**: 使用者跑 smoke 測 3 個功能 (合盤月度/擇吉 × 站 / Family 切主角 + 深層大限 / 追問帶日期觸發流日)
- **Blockers**: 舊 session 遺留 — 需手動 rotate 5 把 key + admin pw (外洩風險)
- **Rollback tag**: `pre-source-map-fix-20260421` (四個 repo 都有)

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
### 2026-04-22 23:30 (m4pro, claude) — smoke audit round 2 + 3 fixes

**Smoke 2026-04-22 報告 4 件全修 (bundle main-BHWTpGrJ.js)**:

1. **oai proxy 斷 auth + 少路由** (High). 先前 auditor 寫成 lab, 實測是 oai:
   `fortune-oai/main.py:520` 的 `handle_proxy` 只支援 GET/POST + 完全沒轉 Authorization header, 且缺 `fortune-charts / fortune-save/delete / fortune-session / fortune-logout` 4 條路由. Copy lab 的 handle_proxy (保留 method + 轉 auth) + 補路由. 登入儲存 / 刪除 / lang 同步 等原本在 oai 靜默 401 的功能現在會走到 scheduler backend.

2. **parseQuestionDateTime 月份 → 流日** (High). 月份 only 問題 (「今年 5 月」) 返回 `day=1`, sendChat 以為是具體日期 → 觸發 L6 流日 overlay 分析 5/1; 過去的 bare 日期 (5 月問「4/6」) 自動跳 +1 年. 加 `bumpPastToFuture` (default true for 決策相容, chat 傳 false) 和 `dayExplicit` 兩個 opts. sendChat 只在 dayExplicit 時才注入 L6.

3. **_lang 同步沒帶 Bearer** (Med). `changeLang` 的 fetch 寫死 Content-Type, server 端 /api/fortune-session 要 owner-bearer, 所以 lang 偏好從不曾 persist. 改用 `authHeaders()`.

4. **isDeep 太窄** (Med). 原本只 `大運|流年|逐月|十年`, 錯過「今年 5 月 / 4-6 月 / 下週三」這些典型時間問. 擴成「有解析到日期 OR 含時間關鍵字」, 這類問題會路由到 DEEP_MODEL.

**Smoke 2026-04-22 pre-round2 修的 2 件**:
- chat 時間基準: sendChat prompt 開頭注入 `今天是 YYYY/M/D` + 「bare month 一律解讀為本年」(job#43 曾飄到 2027)
- dashboard 月份格 lock: 有 deterministic tone 的月份點擊展開 tone 摘要, 不再跳解鎖 modal; 解鎖只在**完全無資料**月份觸發
- chart/reading/family 刪除改用自訂 `askConfirm` modal, 不再 native confirm() (mobile WebView 不穩)
- `scripts/check-kb-fallback.sh` 支援 Cloud Run + 本地 oai log 查 24/72h window

### 2026-04-22 00:30 (m4pro, claude) — Phase 2 sweep + family polish

**crosssihua.js 擴完整**:
- L1-L4 主骨 + L3b (上一大限) + L3c (再上一大限, 20-30 年回看) + L5 流月 + L6 流日
- buildSummary 輸出 structured + narrative, 溫度標籤自動顯示 (e.g. 「當前大限甲子」「流年丙午」「上一大限(回看 10-20 年)」)
- `getMonthlySihuaStars` / `getDailySihuaStars` / `getDecadalSihuaStarsAtOffset` 三個 helper 從 ziwei-calc 匯出

**合盤 (Heban) 三模式上線 (Phase 2e)**:
- `hebanMode`: basic / monthly / timed 三顆按鈕
- monthly: 加 L5, 鎖定今年某月
- timed: 加 L6, 鎖定某日 (擇吉用)
- `hebanQuestion` 使用者問題欄位, 驅動 AI 聚焦 (Phase 2f)
- 新增 `relations.boss` (上下屬), 拆出 career+wealth+timing+core KB topics
- i18n 補完 zh-TW / en / ja 全部新 key

**Family (Phase 2d) 徹底重構**:
- `generateCharts` 同時 return rawZiwei chart object (不只 text), 供 cross-sihua 讀 siHua/feiHua/horoscope
- `ensureRawZiwei` 在分析前為所有成員 (含主角) 補 rawZiwei, fix 了 localStorage legacy 成員缺 chart obj 的 silent bug
- 全成員兩兩交叉 (C(N,2)), 非只主角-vs-each. 5 人家族: 4 對 → 10 對
- 每對自動加 L3b (上一大限) + L3c (再上一大限) 當成員有足夠歷史
- 結果頁新增「一鍵切主角」chip bar, 點任何成員自動重跑 (Phase 2d.4)
- Family prompt 新增兩段強制 section:
  1. **家庭成員之間的獨立動態** (非主角配對, 至少 2 組)
  2. **過去 10-30 年 vs 現在的家庭能量變化** (L3/L3b/L3c 對比)
- System prompt 從「禁止術語」反轉為「必須引用星名+四化 tag」(背後精算是靈魂, 不是要 AI 翻成抽象語言)

**追問流日 (Phase 2c) 剛 ship**:
- `sendChat` 偵測問題裡的具體日期 (parseQuestionDateTime, 複用 decision advisor 的), 有日期就即時算 L6 流日/流時 overlay 附到 prompt
- AI 被強制以流日飛入宮位為主判據回答

**決策 validator** (Phase 1):
- `validateDecisionResponse` schema 守門 JSON 解析失敗或欄位不齊時 graceful fallback, 不再 blank screen

**模型對齊** (穩定性, 收費前必做):
- fortune-oai: job_type=="family" → DEEP_MODEL (GPT-5 full 而非 GPT-5-mini)
- fortune-lab: job_type=="family" → DEEP_MODEL (Gemini 3.1 Pro 而非 flash-lite)
- fortune-sandbox: default=deep 都是 Opus 本來就穩
- KB_FALLBACK logger.warning 三後端 + 前端

**Tag**: `pre-source-map-fix-20260421` (四 repo 回推點)

**⚠️ 三站部署流程** (auto-deploy 會同步 fortune-lab/test-frontend 但 Cloud Run 仍要手動 deploy.sh):
```
# 每次 lab branch push 後:
cd ~/fortune-sandbox && ./deploy.sh   # test.destinytelling.life
cd ~/fortune-lab && ./deploy.sh       # lab.destinytelling.life
launchctl kickstart -k gui/501/com.cph.oai-fortune  # oai (m4pro:8788)
```

### 2026-04-21 21:50 (m4pro, claude) — Phase 1 of pre-revenue audit

**收費前審計 → 產出 `docs/SOURCE_MAP.md`** (target state + gap + 4-phase 修正計畫)
- 三站 6 個算命功能 + 疊宮 coverage matrix (current vs target)
- target 加上用戶指定: 合盤雙方大限/流年/流月 + 交叉飛化 / Family 近 20 年大限 + all members 兩兩交叉 / 追問流日 / 切主角重算

**Phase 1 landed (4 repos):**
- `fortune-mirror`: `validateDecisionResponse` (決策 JSON schema 守門, 不再 blank screen); `filterKBByGoal` 退回全量時打 `[KB_FALLBACK]` warning + trackEvent
- `fortune-sandbox`: 新增 `KB_MODE` env (default `filtered`, rollback `unified`), 對齊 lab/oai 的 per-request KB 過濾; 舊 `_UNIFIED_SP` 保留可一鍵回推; `_fortune_run` / `handle_fortune` 吃進 goal
- `fortune-lab` / `fortune-oai`: `[KB_FALLBACK]` logger.warning (可在 Cloud Run log 審計)
- fortune-oai 另一個 commit (`0f9192e`) 是舊 session 未提交的 OpenAI provider + Token monitoring work (author 保留 cph)

**部署狀態:**
- fortune-mirror `lab` 已 push → m4pro auto-deploy 2 分內生效 (lab.destinytelling.life)
- fortune-sandbox / fortune-lab / fortune-oai 只 commit 沒 push (無 remote) **需要手動 deploy**
  - sandbox & lab: `./deploy.sh` → Cloud Run
  - oai: 重啟 m4pro:8788 python service

**⚠️ KB_MODE=filtered 副作用**: test 站每個 goal 的 system prompt 不同 → Anthropic prompt cache hit rate 會掉。若成本跳升, `KB_MODE=unified` 一鍵回推。

**Tag**: `pre-source-map-fix-20260421` (四個 repo, 全 reset 回推點)

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
