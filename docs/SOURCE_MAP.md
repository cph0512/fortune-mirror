# Fortune Source Map — 收費前審計 + 目標態規格

> **目的**: B2C 開始收費前, 明確盤點每個算命功能的 prompt / KB / 疊宮邏輯, 並鎖定必改項目。
> **建立日期**: 2026-04-21
> **現況 branch**: lab
> **範圍**: test (Claude SDK) / lab (Gemini 3.1) / oai (GPT-5) / prod (Claude CLI)

---

## 0. 站點拓撲

| 站 | 網域 | 後端 | 模型 | Repo |
|---|---|---|---|---|
| prod | destinytelling.life | m4pro:8787 scheduler.py | Claude CLI | telegram-claude-bot |
| test | test.destinytelling.life | Cloud Run | Claude Opus 4 SDK | fortune-sandbox |
| lab | lab.destinytelling.life | Cloud Run | Gemini 3.1 Pro / Flash-Lite | fortune-lab |
| oai | oai.destinytelling.life | m4pro:8788 | GPT-5 / GPT-5-mini | fortune-oai |

**前端共用**: fortune-mirror (React+Vite), KB 同源 `public/default-kb.json` (~130 條)

---

## 1. 算命功能清單 (6 個)

| # | 功能 | 前端入口 | 後端 job_type | 三站都有? |
|---|---|---|---|---|
| 1 | 本命分析 (三系統+財運) | `WizardApp.jsx:2043` | `analysis` | ✅ |
| 2 | 合盤 Heban | `WizardApp.jsx:2228` | `heban` | ✅ |
| 3 | Family Chart | `FamilyChart.jsx:137` | `family` | ✅ |
| 4 | Decision Advisor | `WizardApp.jsx:1104` | `decision` | ✅ |
| 5 | Follow-up Chat (追問) | `WizardApp.jsx:2180` | `chat` | ✅ |
| 6 | 每日運勢 | — | `api.destinytelling.life/api/horoscope` | ❌ 只 prod |

---

## 2. System Prompt 三種樣板

| Prompt | 函式 | 位置 | Goal-aware? | 語言切換? |
|---|---|---|---|---|
| 主分析 | `getWizardSystemPromptZh(goal)` | `WizardApp.jsx:641-706` | ✅ 五目標各有 Section 4+5 | ⚠️ system 永遠中文, user 指示語言 |
| 合盤 | `HEBAN_SYSTEM_PROMPT_ZH` | `WizardApp.jsx:456-493` | ❌ 固定 | ❌ 中文 hardcode |
| 決策 | `decisionSystemPrompt(langLabel)` | `WizardApp.jsx:517-575` | ⚠️ 只切語言 | ✅ |

決策回傳 JSON schema (強制): `type / question_summary / time_anchor / options[{label, score 0-100, keyPoints[3], analysis}] / recommendation / gap / notes`

評分權重 (決策): 本命 30% + 流年 30% + 流月 25% + 流日時 15%

---

## 3. 疊宮 Coverage — Current vs Target

### 3.1 Current (審計結果)

| 功能 | 本命 | 大限 | 流年 | 流月 | 流日 | 流時 | 交叉飛化 | KB 過濾 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 主分析 | ✅ | ✅ | ✅ | ✅(12) | ❌ | ❌ | — | goal |
| 合盤 | ✅ 單方 | ⚠️ 單方 | ⚠️ 單方 | ❌ | ❌ | ❌ | ❌ | relation (前端過濾, 後端忽略) |
| Family | ✅ 主角 | ✅ 主角 | ✅ 主角 | ⚠️ 主角 | ❌ | ❌ | ❌ | family |
| 決策 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | decision |
| 追問 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | — | 跟隨 |

### 3.2 Target (**收費前必達**)

| 功能 | 本命 | 大限 | 流年 | 流月 | 流日 | 流時 | 交叉飛化 | 備註 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| 主分析 | ✅ | ✅ | ✅ | ✅(12) | — | — | — | 現狀 OK |
| **合盤** | ✅ **雙方** | ✅ **雙方** | ✅ **雙方** | ✅ **雙方** | ✅ (可選) | — | ✅ **A↔B 雙向** | 飛化結論由前端算, AI 做推論 |
| **Family** | ✅ 全員 | ✅ **近 20 年 / 上一大限 + 現大限** | ✅ 全員 | ✅ 全員 | — | — | ✅ **all members 兩兩交叉** | 每 10 年大限飛化全跑 |
| 決策 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | 現狀 OK |
| **追問** | ✅ | ✅ | ✅ | ✅ | ✅ **(問題含日期時)** | ⚠️ 可選 | — | parseQuestionDateTime 擴充已有, 追問要用到 |

### 3.3 Gap 清單

1. **合盤**: `calculateTransitOverlay()` 客端沒跑 → 要為兩人各跑 + 交叉飛化計算 (新函式)
2. **Family 次要成員**: 只送本命, 沒流年脈絡 → 所有成員都要跑 overlay
3. **Family 大限飛化**: 沒呈現近 20 年大限 → 新增 `calculateDecadalOverlay(chart, range=20)` 回傳過去大限 + 當前大限飛化
4. **交叉飛化** (A→B / B→A): 前端完全沒算, 要新函式 `calculateCrossSihua(chartA, chartB)` 輸出飛化結論字串餵 AI
5. **切換主角**: UI 有, 但飛化沒重算 → 切主角時觸發整套 re-compute
6. **追問流日**: `parseQuestionDateTime` 已存在 (決策用), 追問入口要呼叫

---

## 4. KB 注入路徑 — Current vs Target

### 4.1 Current

| 站 | KB 來源 | 過濾時機 | Goal 過濾 | Fallback 行為 |
|---|---|---|---|---|
| test | 啟動時全量灌入 system prompt | 一次性 | ❌ 無 | — (永遠全量) |
| lab | 每次請求 `_build_system_prompt_with_kb` | 每次 | ✅ 有 | **< 15 條偷偷退回全量 (無 log)** |
| oai | 每次請求同上 | 每次 | ✅ 有 | **< 15 條偷偷退回全量 (無 log)** |
| 前端 | `filterKBByGoal` | 送出前 | ✅ 有 | **< 20 條退回全量 (無 log)** |

### 4.2 Target

1. **test 站** 改為 per-request 過濾 (對齊 lab/oai), **但先備份現行 unified KB 版本**, 建 feature flag 可一鍵回推
2. **Fallback 要 log**: 寫入 audit.db, 包含 `{goal, filtered_count, fallback: true, timestamp}`
3. **goal.general**: 依回應深度動態調整 — 快速問答用 core 標籤 subset, 深度分析才全量
4. **Heban relation-specific KB**: 前端 `HEBAN_DEFAULT_TOPICS` 要帶到後端 (現在只傳 `goal=love` 一概全部)
5. **KB 版本**: `KB_VERSION` 改為從 KB 檔 hash 生成, 不再 hardcode

---

## 5. 收費前必改 — 優先級

### 🔴 P0 (Blocker)

| # | 項目 | 檔案 | 備註 |
|---|---|---|---|
| P0-1 | test 站 KB 開始過濾 + 保留 unified 版備份 + feature flag | `fortune-sandbox/main.py:73-122` | 備份成 `_build_unified_system_prompt_legacy`, 用 env var `KB_MODE=unified|filtered` 切換 |
| P0-2 | 合盤 client-side overlay (雙方大限/流年/流月) + 交叉飛化 | `WizardApp.jsx:2228-2353` + 新增 `src/crosssihua.js` | 新函式 `calculateCrossSihua(chartA, chartB)` |
| P0-3 | Family 所有成員 overlay + 近 20 年大限飛化 + 兩兩交叉 | `FamilyChart.jsx:116-135` | 新增 `calculateDecadalOverlay` |
| P0-4 | KB fallback logging (三站 + 前端) | sandbox/lab/oai main.py + WizardApp.jsx:729 | 寫入 audit |
| P0-5 | 決策 JSON schema validator | `WizardApp.jsx:1104-1297` | AI 回 malformed 時 graceful fallback 不 crash |

### 🟠 P1 (Ship-blocker)

| # | 項目 | 備註 |
|---|---|---|
| P1-1 | 切換主角重算飛化 | FamilyChart 現在只改 UI 焦點 |
| P1-2 | 追問支援流日 (問題含日期時) | 複用 decision 的 `parseQuestionDateTime` |
| P1-3 | goal.general 動態 KB 深淺 | 降 token |
| P1-4 | Heban relation-specific topics 傳到後端 | 修 filter 斷鏈 |

### 🟡 P2 (Launch 可後補)

| # | 項目 |
|---|---|
| P2-1 | 三站 audit 合併到同一 DB |
| P2-2 | 三語 system prompt 實作 (現只 user prompt 指示) |
| P2-3 | KB 版本改 hash-based |
| P2-4 | parseMonthHighlights regex 加強 |

---

## 6. 新增程式碼規劃

### 6.1 `src/crosssihua.js` (新檔)

```js
// 交叉飛化: A 的某宮干起四化飛入 B 的某宮
// 回傳結論 (給 AI 讀, 不是給程式判斷)
export function calculateCrossSihua(chartA, chartB, {
  includeNatal = true,
  includeDecadal = true,
  includeYearly = true,
  includeMonthly = false,
  targetYear = null,
} = {}) {
  // 對每個 palace 取干 → 四化 (祿權科忌) → 找 B 盤對應宮位
  // 雙向: A→B 和 B→A
  // 返回結構:
  // {
  //   aToB: [{ fromPalace, tianGan, sihua, targetPalace, targetStar, meaning }],
  //   bToA: [...],
  //   summary: "A 的命宮化祿飛入 B 的夫妻宮..." (narrative for AI)
  // }
}
```

### 6.2 `ziwei-calc.js` 擴充

```js
export function calculateDecadalOverlay(chart, {
  pastDecades = 2,      // 上一大限 + 當前大限
  includeYearlyWithin = true,  // 大限內含流年飛化
} = {}) {
  // 回傳過去 N 個大限 + 當前大限的四化 + 宮位落點
  // summary 字串餵 AI
}
```

### 6.3 KB Fallback Logging (三站統一格式)

```python
# audit.db schema:
# kb_fallback(ts, site, goal, filtered_count, total_count, request_id)
def log_kb_fallback(goal, filtered, total, req_id):
    ...
```

### 6.4 Decision JSON Schema (前端)

```js
const DECISION_SCHEMA = {
  type: ["yesno", "multi", "timed", "open", "blocked"],
  required: ["type", "question_summary"],
  conditional: {
    timed: ["time_anchor", "options"],
    yesno: ["options", "recommendation"],
    multi: ["options", "recommendation"],
  }
};
function validateDecisionResponse(raw) { ... }
```

---

## 7. 執行順序 (對應 P0 → P1 → P2)

**Phase 1 — Backup & Infra (1 天)**
1. git tag `pre-source-map-fix-20260421` (回推點)
2. P0-1 test 站 KB feature flag + 備份
3. P0-4 KB fallback logging (三站)
4. P0-5 決策 schema validator

**Phase 2 — Overlay 補齊 (2-3 天)**
5. `calculateDecadalOverlay` + `calculateCrossSihua` 兩個新函式 (含單元測試)
6. P0-2 合盤接上雙方 overlay + 交叉飛化
7. P0-3 Family 所有成員 overlay + 兩兩交叉 + 大限飛化

**Phase 3 — UX & 細節 (1-2 天)**
8. P1-1 切換主角重算
9. P1-2 追問流日
10. P1-3 goal.general 動態 KB
11. P1-4 Heban relation topics 傳後端

**Phase 4 — 上線前煙測**
- 每個功能跑一輪 test/lab/oai 三站, 比對輸出一致性
- 確認 audit log 有記 fallback
- rotate keys (session 記憶未解)
- merge lab → main

---

## 8. 附錄 — 關鍵函式引用

| 類別 | 函式 | 位置 |
|---|---|---|
| 本命盤 | `calculateChart` / `formatChart` | `ziwei-calc.js:1-200` |
| 八字 | `calculateBazi` / `formatBazi` | `bazi-calc.js:1-180` |
| 占星 | `calculateAstro` / `formatAstro` | `astro-calc.js:1-160` |
| 疊宮 | `calculateTransitOverlay` | `ziwei-calc.js:499-780` |
| 流日/流時 | `calculateDayHourOverlay` | `ziwei-calc.js:849-1020` |
| Wizard Prompt | `getWizardSystemPromptZh` | `WizardApp.jsx:641-706` |
| Goal Framework | `getGoalFramework` | `WizardApp.jsx:587-638` |
| KB 過濾 (主) | `filterKBByGoal` | `WizardApp.jsx:717-731` |
| KB 過濾 (Heban) | `filterKBForHeban` | `WizardApp.jsx:439-453` |
| Heban Prompt | `HEBAN_SYSTEM_PROMPT_ZH` | `WizardApp.jsx:456-493` |
| Decision Prompt | `decisionSystemPrompt` | `WizardApp.jsx:517-575` |
| KB Server Build (lab) | `_build_system_prompt_with_kb` | `fortune-lab/main.py:427-428` |
| KB Server Build (oai) | `_build_system_prompt_with_kb` | `fortune-oai/main.py:344-345` |
| KB Server Build (test) | `_build_unified_system_prompt` | `fortune-sandbox/main.py:73-122` |

---

**最後更新**: 2026-04-21 (lab branch)
**下一步**: 進 Phase 1 (tag + P0-1/4/5)
