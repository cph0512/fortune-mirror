import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import './i18n.js';
import './WizardApp.css';
import { calculateChart, formatChart, formatChartCompact, formatChartByTianGan, calculateTransitOverlay, calculateDayHourOverlay, getMonthlySihuaStars, getDailySihuaStars } from "./ziwei-calc.js";
import { calculateCrossSihua } from "./crosssihua.js";
import { calculateBazi, formatBazi, formatBaziCompact } from "./bazi-calc.js";
import { calculateAstro, formatAstro, formatAstroCompact } from "./astro-calc.js";
import CITY_COORDS, { findCity, getCityGroups } from "./city-coords.js";
import { calculateTrueSolarTime, formatCorrectionDetails } from "./true-solar-time.js";
import { searchCities } from "./city-search.js";
import FamilyChart from "./FamilyChart.jsx";

const LANG_NAMES = { 'zh-TW': '繁中', en: 'EN', ja: '日本語' };
const LANG_AI = { 'zh-TW': '繁體中文', en: 'English', ja: '日本語' };

// ============================================================
// CONSTANTS
// ============================================================

const HOSTNAME = typeof window !== 'undefined' ? window.location.hostname : '';
const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const IS_TEST = HOSTNAME === 'test.destinytelling.life';
const IS_LAB = HOSTNAME === 'lab.destinytelling.life';
const IS_OAI = HOSTNAME === 'oai.destinytelling.life';
const API_BACKEND = IS_OAI
  ? `${ORIGIN}/api/fortune`
  : IS_LAB
  ? "https://fortune-lab-352618635098.asia-east1.run.app/api/fortune"
  : IS_TEST
  ? "https://fortune-sandbox-352618635098.asia-east1.run.app/api/fortune"
  : "https://fortune-api-64kdjyxhpq-de.a.run.app/api/fortune";
const API_SANDBOX = IS_LAB
  ? "https://fortune-lab-352618635098.asia-east1.run.app/api"
  : "https://fortune-sandbox-352618635098.asia-east1.run.app/api";
const API_TRACK = IS_OAI
  ? `${ORIGIN}/api/fortune-track`
  : IS_LAB
  ? "https://fortune-lab-352618635098.asia-east1.run.app/api/fortune-track"
  : IS_TEST
  ? "https://fortune-sandbox-352618635098.asia-east1.run.app/api/fortune-track"
  : "https://fortune-api-64kdjyxhpq-de.a.run.app/api/fortune-track";
const API_BASE = IS_OAI
  ? ORIGIN
  : IS_LAB
  ? "https://fortune-lab-352618635098.asia-east1.run.app"
  : IS_TEST
  ? "https://fortune-sandbox-352618635098.asia-east1.run.app"
  : "https://fortune-api-64kdjyxhpq-de.a.run.app";
// Horoscope always on m4pro (api.destinytelling.life → port 3083)
const API_HOROSCOPE = "https://api.destinytelling.life/api/horoscope";
const ZODIAC_KEYS = ["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"];
const ZODIAC_ZH = ["牡羊座","金牛座","雙子座","巨蟹座","獅子座","處女座","天秤座","天蠍座","射手座","摩羯座","水瓶座","雙魚座"];
const STORAGE_KEY_KB = "fortune-app-kb";
const KB_VERSION = "20260402d";
const SESSION_KEY_PREFIX = "wizard-session-";
const SESSION_KEY_GUEST = "wizard-session-guest";
const AUTH_KEY = "wizard-auth";
const AUTH_TOKEN_KEY = "wizard-auth-token";
const VISITOR_ID_KEY = "fortune-visitor-id";

function getVisitorId() {
  let vid = localStorage.getItem(VISITOR_ID_KEY);
  if (!vid) {
    vid = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(VISITOR_ID_KEY, vid);
  }
  return vid;
}

function trackEvent(action, detail = {}) {
  try {
    const auth = loadAuth();
    fetch(API_TRACK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitor_id: getVisitorId(),
        user: auth?.email || null,
        user_name: auth?.name || null,
        action,
        detail,
        ts: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch {}
}

function sessionKey(user) {
  return user?.email ? `${SESSION_KEY_PREFIX}${user.email}` : SESSION_KEY_GUEST;
}
function saveSessionLocal(data, user) {
  try { localStorage.setItem(sessionKey(user), JSON.stringify({ ...data, _ts: new Date().toISOString() })); } catch {}
}
function loadSessionLocal(user) {
  try { const d = localStorage.getItem(sessionKey(user)); return d ? JSON.parse(d) : null; } catch { return null; }
}

// Debounced server sync for session
let _sessionSyncTimer = null;
function saveSession(data, user) {
  saveSessionLocal(data, user);
  if (!user?.email) return;
  clearTimeout(_sessionSyncTimer);
  _sessionSyncTimer = setTimeout(() => {
    fetch(`${API_BASE}/api/fortune-session`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ user: user.email, session: data }),
    }).catch(() => {});
  }, 5000);
}

async function loadSessionFromServer(user) {
  if (!user?.email) return null;
  try {
    const res = await fetch(`${API_BASE}/api/fortune-session?user=${encodeURIComponent(user.email)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && Object.keys(data).length > 1 ? data : null;
  } catch { return null; }
}

function loadSession(user) {
  return loadSessionLocal(user);
}

// Save chat history to server — update existing reading by readingId
async function saveChatToServer(user, chatHistory, readingId) {
  if (chatHistory.length === 0 || !readingId) return;
  const userId = user?.email || getVisitorId();
  try {
    const res = await fetch(API_SAVE, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        user: userId,
        readingId: readingId,
        chat: chatHistory,
      }),
    });
    if (!res.ok) console.error("[saveChatToServer] failed:", res.status);
  } catch (e) { console.error("[saveChatToServer] error:", e); }
}

// ============================================================
// READING HISTORY (server-first, localStorage fallback)
// ============================================================
// Saves & Charts always go to m4pro scheduler (persistent storage, not Cloud Run stateless)
const API_SAVE = "https://bot.velopulse.io/api/fortune-save";
const API_CHARTS = "https://bot.velopulse.io/api/fortune-charts";
const READINGS_KEY_PREFIX = "wizard-readings-";
function readingsKey(user) {
  return user?.email ? `${READINGS_KEY_PREFIX}${user.email}` : `${READINGS_KEY_PREFIX}guest`;
}
function loadReadingsLocal(user) {
  try { const d = localStorage.getItem(readingsKey(user)); return d ? JSON.parse(d) : []; } catch { return []; }
}
async function loadReadings(user) {
  // Server-first for logged-in users
  if (user?.email) {
    try {
      const res = await fetch(`${API_SAVE}?user=${encodeURIComponent(user.email)}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const saves = await res.json();
        if (Array.isArray(saves) && saves.length > 0) {
          // Cache to localStorage
          try { localStorage.setItem(readingsKey(user), JSON.stringify(saves)); } catch {}
          return saves;
        }
      }
    } catch {}
  }
  // Fallback to localStorage
  return loadReadingsLocal(user);
}
async function saveReading(user, reading) {
  // Always save to localStorage first (immediate)
  try {
    const readings = loadReadingsLocal(user);
    readings.unshift(reading);
    if (readings.length > 50) readings.length = 50;
    localStorage.setItem(readingsKey(user), JSON.stringify(readings));
  } catch {}
  // ALWAYS save to server — use email if logged in, visitor_id if not
  const userId = user?.email || getVisitorId();
  try {
    const res = await fetch(API_SAVE, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        user: userId,
        id: reading.id || `save_${Date.now()}`,
        time: reading.date || new Date().toISOString(),
        finalResult: reading.result || "",
        // Decision advisor records piggy-back on the reading schema by
        // stringifying the structured JSON into finalResult so the existing
        // /api/fortune-save endpoint doesn't need a migration. The frontend
        // detects goal==='decision' and JSON.parses this field back.
        ...(reading.decisionResult ? { finalResult: JSON.stringify(reading.decisionResult) } : {}),
        gender: reading.gender || "",
        goal: reading.goal || "",
        goalPrompt: reading.goalPrompt || "",
        birth: reading.birth || "",
        birthData: reading.birthData || {},
        rawResults: reading.rawResults || [],
        chat: [],
        monthHighlights: reading.monthHighlights || [],
        source: "b2c",
      }),
    });
    if (!res.ok) console.error("[saveReading] failed:", res.status, await res.text().catch(() => ""));
  } catch (e) { console.error("[saveReading] error:", e); }
}

// ============================================================
// CHARTS (命盤庫)
// ============================================================
async function loadCharts(user) {
  if (!user?.email) return [];
  try {
    const res = await fetch(`${API_CHARTS}?user=${encodeURIComponent(user.email)}`, {
      headers: authHeaders(),
    });
    if (res.ok) return await res.json();
  } catch {}
  return [];
}
async function saveChart(user, chart) {
  if (!user?.email) return null;
  try {
    const res = await fetch(API_CHARTS, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ user: user.email, chart }),
    });
    if (res.ok) { const d = await res.json(); return d.chart; }
  } catch {}
  return null;
}
async function deleteChart(user, chartId) {
  if (!user?.email) return false;
  try {
    const res = await fetch(API_CHARTS, {
      method: "DELETE", headers: authHeaders(),
      body: JSON.stringify({ user: user.email, id: chartId }),
    });
    return res.ok;
  } catch { return false; }
}
async function deleteReading(user, readingTime) {
  if (!user?.email) return false;
  try {
    const res = await fetch(`${API_SAVE}/delete`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ user: user.email, time: readingTime }),
    });
    return res.ok;
  } catch { return false; }
}

// Parse month highlights from analysis result text
function parseMonthHighlights(resultText) {
  if (!resultText) return [];
  const months = [];
  // Find the section about key months
  const monthSectionMatch = resultText.match(/\[SECTION\]\s*.*(?:重點月份|Key Months|月份|Month|月別運勢|月別)[\s\S]*?(?=\[SECTION\]|$)/i);
  if (!monthSectionMatch) return months;
  const section = monthSectionMatch[0];

  // Extract month mentions with context
  const monthPatterns = [
    /(\d{1,2})\s*[~\-～至到]\s*(\d{1,2})\s*月[：:]*\s*([^\n]+)/g,
    /(\d{1,2})\s*月[：:]*\s*([^\n]+)/g,
    /(January|February|March|April|May|June|July|August|September|October|November|December)[：:]*\s*([^\n]+)/gi,
  ];

  const monthNames = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };
  const seen = new Set();

  // Range pattern first (e.g. "3-5月")
  let m;
  const rangeRx = /(\d{1,2})\s*[~\-～至到]\s*(\d{1,2})\s*月[：:]*\s*([^\n]+)/g;
  while ((m = rangeRx.exec(section)) !== null) {
    const start = parseInt(m[1]), end = parseInt(m[2]);
    const desc = m[3].trim();
    const tone = detectTone(desc);
    for (let i = start; i <= end; i++) {
      if (i >= 1 && i <= 12 && !seen.has(i)) {
        months.push({ month: i, description: desc, tone });
        seen.add(i);
      }
    }
  }

  // Single month pattern
  const singleRx = /(?<!\d[~\-～至到])(\d{1,2})\s*月[：:]*\s*([^\n]+)/g;
  while ((m = singleRx.exec(section)) !== null) {
    const mon = parseInt(m[1]);
    if (mon >= 1 && mon <= 12 && !seen.has(mon)) {
      const desc = m[2].trim();
      months.push({ month: mon, description: desc, tone: detectTone(desc) });
      seen.add(mon);
    }
  }

  // English month pattern
  const engRx = /(January|February|March|April|May|June|July|August|September|October|November|December)[：:]*\s*([^\n]+)/gi;
  while ((m = engRx.exec(section)) !== null) {
    const mon = monthNames[m[1].toLowerCase()];
    if (mon && !seen.has(mon)) {
      const desc = m[2].trim();
      months.push({ month: mon, description: desc, tone: detectTone(desc) });
      seen.add(mon);
    }
  }

  return months.sort((a, b) => a.month - b.month);
}

function detectTone(text) {
  const positive = /好時機|突破|機會|順利|高峰|大好|有利|貴人|收穫|豐收|成果|favorable|opportunity|breakthrough|peak|harvest|好調|チャンス|飛躍|順風|吉/i;
  const negative = /小心|謹慎|注意|風險|低潮|挑戰|阻礙|衝突|避免|caution|careful|risk|challenge|avoid|friction|要注意|警戒|リスク|困難|障害|凶/i;
  const neutral = /轉換|過渡|調整|準備|穩定|反思|規劃|transition|shift|adjust|steady|reflect|転換|準備|安定|見直し|調整/i;
  if (negative.test(text)) return "caution";
  if (positive.test(text)) return "positive";
  if (neutral.test(text)) return "neutral";
  return "neutral";
}
function clearSession(user) {
  try { localStorage.removeItem(sessionKey(user)); } catch {}
}
function migrateGuestSession(user) {
  try {
    const guest = localStorage.getItem(SESSION_KEY_GUEST);
    if (guest && user?.email) {
      const userKey = `${SESSION_KEY_PREFIX}${user.email}`;
      if (!localStorage.getItem(userKey)) {
        localStorage.setItem(userKey, guest);
      }
      localStorage.removeItem(SESSION_KEY_GUEST);
    }
  } catch {}
}
function saveAuth(data) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(data)); } catch {}
}
function loadAuth() {
  try { const d = localStorage.getItem(AUTH_KEY); return d ? JSON.parse(d) : null; } catch { return null; }
}
function saveAuthToken(token) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
}
function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}
function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}
function authHeaders() {
  const token = getAuthToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// KB: server-first (fetch default-kb.json), localStorage as cache
let _kbCache = null;
function loadKB() {
  if (_kbCache) return _kbCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_KB);
    const savedVer = localStorage.getItem("fortune-kb-version");
    if (raw && savedVer === KB_VERSION) {
      _kbCache = JSON.parse(raw);
      return _kbCache;
    }
  } catch {}
  return [];
}
async function fetchKB() {
  try {
    const res = await fetch("./default-kb.json");
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      _kbCache = data;
      localStorage.setItem(STORAGE_KEY_KB, JSON.stringify(data));
      localStorage.setItem("fortune-kb-version", KB_VERSION);
      return data;
    }
  } catch {}
  return loadKB();
}

// Goal/relation definitions use i18n keys (no hardcoded Chinese)
const GOALS = [
  { key: "goal.love", promptKey: "goal.lovePrompt", topicTag: "love", hasSub: true },
  { key: "goal.career", promptKey: "goal.careerPrompt", topicTag: "career" },
  { key: "goal.wealth", promptKey: "goal.wealthPrompt", topicTag: "wealth" },
  { key: "goal.health", promptKey: "goal.healthPrompt", topicTag: "health" },
  { key: "goal.general", promptKey: "goal.generalPrompt", topicTag: "general" },
];

const LOVE_SUBS = [
  { key: "goal.loveSingle", promptKey: "goal.loveSinglePrompt" },
  { key: "goal.loveMarried", promptKey: "goal.loveMarriedPrompt" },
];

const RELATIONS = [
  { key: "relations.lover" },
  { key: "relations.spouse" },
  { key: "relations.family" },
  { key: "relations.friend" },
  { key: "relations.colleague" },
  { key: "relations.twin" },
];

// 合盤聚焦選項
const HEBAN_FOCUS_OPTIONS = [
  { key: "heban.overall", topics: null },  // null = 用關係預設
  { key: "heban.love", topics: ["love", "core"] },
  { key: "heban.career", topics: ["career", "core"] },
  { key: "heban.wealth", topics: ["wealth", "core"] },
  { key: "heban.children", topics: ["love", "core"] },
];

// 關係類型 → 預設 KB topics（沒選聚焦時用）
const HEBAN_DEFAULT_TOPICS = {
  "relations.lover": ["love", "timing", "core"],
  "relations.spouse": ["love", "wealth", "timing", "core"],
  "relations.family": ["love", "core"],
  "relations.friend": ["career", "core"],
  "relations.colleague": ["career", "wealth", "core"],
  "relations.twin": null, // 全送
};

function filterKBForHeban(kbEntries, relation, focusKey) {
  // 有選聚焦主題 → 用聚焦的 topics
  const focusOption = HEBAN_FOCUS_OPTIONS.find(f => f.key === focusKey);
  const topics = focusOption?.topics || HEBAN_DEFAULT_TOPICS[relation] || null;

  if (!topics) return kbEntries; // null = 全送

  const filtered = kbEntries.filter(e => {
    const t = e.tags || e.topics || [];
    if (t.includes("core")) return true;
    return topics.some(topic => t.includes(topic));
  });
  if (filtered.length < 10) return kbEntries;
  return filtered;
}

// System prompts are always Chinese for the AI (best quality); language instruction added dynamically
const HEBAN_SYSTEM_PROMPT_ZH = `你是「命理三鏡」的關係分析師。

核心規則：
1. 絕對禁止提到任何命理系統名稱和專有術語。
2. 用自然語言描述兩人關係。

格式規則：
絕對禁止 Markdown 語法（#、**、*、- 列表、表格）。絕對禁止 emoji 和表情符號。
用 [SECTION] 標記分段。格式：獨立一行寫 [SECTION] 標題，換行寫內容。用自然句子書寫。

輸出結構：

[SECTION] 你們的緣分指數
（用 1-100 分，並用一句話形容這段關係的本質）

[SECTION] 你們的互動模式
（兩人相處的天然模式、互補或衝突的地方）

[SECTION] 關係中的優勢
（兩人在一起特別好的面向）

[SECTION] 需要注意的地方
（潛在摩擦、容易產生誤解的部分）

[SECTION] ${new Date().getFullYear()} 年兩人關係走向
（今年這段關係的趨勢和關鍵時間點）

[SECTION] 相處建議
（具體可行的互動建議）

日期規則：
所有日期一律使用國曆（西元）。提到農曆月份時必須用括號標註國曆對照，例如「農曆三月（國曆4月中旬）」。

一致性原則：
分析必須嚴格基於排盤資料。相同排盤資料的核心結論必須一致。

中立原則：不可假設兩人的職業、行業、生活背景。
語氣：溫暖有洞察力，正面為主但誠實，具體有畫面感。`;

// ============================================================
// DECISION ADVISOR (#8)
// ============================================================
// Hard block list — keyword pre-filter applied BEFORE any LLM call. The LLM
// classifier runs as a second safety net inside the analysis step so that
// softer rewrites ("if I don't make it, ...") still get caught. The keywords
// below cover direct self-harm, suicide, and violent intent across zh/en/ja.
const DECISION_BLOCK_KEYWORDS = [
  "自殺", "自杀", "自我了斷", "輕生", "自傷", "自残",
  "結束生命", "结束生命", "不想活", "活不下去", "想死", "去死",
  "殺人", "杀人", "殺了", "殺死", "杀死", "害死", "下毒",
  "suicide", "kill myself", "end my life", "end it all", "self-harm",
  "murder", "kill someone", "poison someone",
  "死にたい", "自殺", "自傷", "殺す", "殺し",
];

const DECISION_SAFETY_MESSAGE = {
  "zh-TW": "此類問題涉及生命安全，命理工具無法也不應該回應。\n如果你正在經歷困難，請聯繫：\n・台灣 1925（安心專線）｜1995（生命線）｜1980（張老師）\n・日本 いのちの電話 0120-783-556\n・US 988 Suicide & Crisis Lifeline",
  "en": "This question touches on life safety. Fortune tools are not the right resource here.\nIf you're going through something hard, please reach out:\n• Taiwan 1925 / 1995 / 1980\n• Japan いのちの電話 0120-783-556\n• US 988 Suicide & Crisis Lifeline",
  "ja": "この質問は命の安全に関わるため、占いでは答えられません。\n困っているときはご連絡ください：\n・日本 いのちの電話 0120-783-556\n・台湾 1925／1995／1980\n・US 988 Suicide & Crisis Lifeline",
};

function decisionSystemPrompt(langLabel) {
  // The LLM returns a strict JSON envelope so the frontend can render option
  // cards without heuristic parsing. Schema mirrors DecisionSession in the
  // spec (#8.6). The analysis layers are framed so the model cross-references
  // 本命 / 流年 / 流月 (and 流日時 when time_anchor is set) instead of freely
  // associating. `notes` doubles as the safety payload for type=blocked.
  const safetyZh = DECISION_SAFETY_MESSAGE["zh-TW"].replace(/\n/g, "\\n");
  const safetyEn = DECISION_SAFETY_MESSAGE["en"].replace(/\n/g, "\\n");
  const safetyJa = DECISION_SAFETY_MESSAGE["ja"].replace(/\n/g, "\\n");
  return `你是「命理三鏡」的決策建議顧問。根據排盤資料（本命 + 流年 + 流月，若 time_anchor 有值則加流日流時）為使用者評估選項。

**輸出必須是合法 JSON，僅輸出 JSON，不要任何 markdown 或說明文字。** Schema:
{
  "type": "yesno" | "multi" | "timed" | "open" | "blocked",
  "question_summary": string,
  "time_anchor": string | null,  // ISO 8601 if timed, else null
  "options": [
    {
      "label": string,
      "score": number 0-100,
      "keyPoints": [string, string, string],
      "analysis": string  // 4 層交叉：本命 / 流年 / 流月 / 流日時（若 timed）。自然語言段落，不露術語。
    }
  ],
  "recommendation": string,  // options[i].label 的某一個；open/blocked 留空
  "gap": "顯著" | "邊際" | "",  // 分差 >15 → 顯著；open/blocked 留空
  "notes": string  // 對應 type 給不同內容（見下）
}

分類規則：
- yesno：是非題。options = [{label:"接受/去/選A", ...}, {label:"拒絕/不去/選B", ...}]。
- multi：多選題。options = 每個明確選項各一個。
- timed：題目含具體時間。time_anchor 填 ISO；options = [{label:"去/接", ...}, {label:"不去/拒", ...}]。
- open：題目太模糊（「未來如何」「我最近怎辦」）。options = []；recommendation = ""；gap = ""；notes = 用使用者語言說明「此問題不符合決策建議格式，請重新描述為是非題或選擇題」並給 2-3 個範例。
- blocked：涉及生命安全、自殺自傷、殺人、重大犯罪決策。options = []；recommendation = ""；gap = ""；notes 一律用使用者語言的安全文案：
  - zh-TW：${safetyZh}
  - en：${safetyEn}
  - ja：${safetyJa}

評分規則（yesno/multi/timed 適用）：
- 以本命格局為底（30%）+ 流年能量（30%）+ 流月走勢（25%）+ 流日流時疊宮（15%，沒時間則把 15% 平均分給前三）。
- 分數 0-100；正負判斷依排盤吉凶（化祿/化權/化科/祿存/天馬 正向；化忌/地劫地空/羊陀火鈴 負向；疊宮衝剋扣分；三合/六合/拱照加分）。
- keyPoints：三個最關鍵的點，具體到格局（不暴露術語）。
- analysis：至少 4 段，每層一段。若 timed 再加第 4 段談那個具體日時的疊宮。

綜合建議：
- recommendation 填評分最高的 option.label。
- gap：分差 >15 填「顯著」，否則「邊際」。
- notes：即使選贏家也要列關鍵風險（1-2 項）。

表達風格：
- 禁止出現任何命理系統名稱（紫微、八字、星盤、命盤、排盤）或專有術語（四化、化祿、宮位、相位、星座、主星）。
- 自然語言、日常口吻。
- 使用者語言為 "${langLabel}"，所有 label、keyPoints、analysis、notes、recommendation 都必須是此語言。

絕對禁止：
- 不要評論情感道德面。只做能量分析。
- 不要替使用者選擇傷害他人、違法、違反安全線的行為。`;
}

function hitsDecisionBlockList(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return DECISION_BLOCK_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

const DECISION_TYPES = ["yesno", "multi", "timed", "open", "blocked"];

// Validate the JSON the model returns for decision analysis. We can't trust the
// LLM to always stick to the schema, so checks are cheap guards before we render
// anything — missing fields here have surfaced as blank screens in the past.
function validateDecisionResponse(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "not_object" };
  }
  if (!DECISION_TYPES.includes(parsed.type)) {
    return { ok: false, reason: `bad_type:${parsed.type}` };
  }
  if (parsed.type === "blocked" || parsed.type === "open") {
    if (typeof parsed.question_summary !== "string" || !parsed.question_summary.trim()) {
      return { ok: false, reason: "missing_question_summary" };
    }
    return { ok: true };
  }
  if (parsed.type === "yesno" || parsed.type === "multi" || parsed.type === "timed") {
    if (!Array.isArray(parsed.options) || parsed.options.length === 0) {
      return { ok: false, reason: "missing_options" };
    }
    for (const [i, opt] of parsed.options.entries()) {
      if (!opt || typeof opt !== "object") return { ok: false, reason: `option_${i}_not_object` };
      if (typeof opt.label !== "string" || !opt.label.trim()) return { ok: false, reason: `option_${i}_missing_label` };
      if (typeof opt.score !== "number" || opt.score < 0 || opt.score > 100) {
        return { ok: false, reason: `option_${i}_bad_score` };
      }
    }
    if (parsed.type === "timed" && !parsed.time_anchor) {
      return { ok: false, reason: "timed_missing_anchor" };
    }
    return { ok: true };
  }
  return { ok: false, reason: "unreachable" };
}

// Goal-specific framework for section 4 (topic deep-dive) and section 5
// (12-month breakdown). Kept as a function (not a const) so the current year
// interpolates at call time instead of at module load.
function getGoalFramework(y) {
  return {
    "goal.health": {
      section4Title: "健康與養生——你的現況與趨勢",
      section4Body: `（必須寫 5-6 個飽滿的自然段落，篇幅充足，不可草草帶過。必須具體涵蓋以下面向，每項至少一段：
1. 體質基底：你天生體質偏強還是偏弱？哪些系統/部位是先天弱點（消化、循環、呼吸、神經、內分泌、骨骼關節、肝膽、腎系統...依排盤挑最明顯的 2-3 項深入說明，要具體到身體部位）。
2. 近期身心狀態：睡眠品質、食慾、精力、情緒壓力之間如何互相拉扯？現在是消耗期還是修復期？疲倦感來源是身體還是心理？
3. 慢性累積趨勢：哪些小症狀若長期忽視會滾成慢性問題？免疫力、代謝速度、老化節奏的走向？
4. 壓力源與修復資源：哪些人際/工作/環境正在消耗你的健康？你身邊有哪些資源/條件可以幫你修復（照顧者、財務能支持就醫、時間彈性）？兩者的拉扯關係如何？
5. 最需要特別留意的健康面向：依排盤格局，未來 1-3 年哪個系統/部位是主要課題？
6. 跨系統交叉訊號：若多個系統同時指向某個健康面向（例如消化、情緒、睡眠），點出來並解釋意義。）`,
      section5Title: `${y} 年 12 個月健康走勢`,
      section5Body: `（必須逐月分析 12 個月，從 1 月到 12 月全部列出，不可跳月也不可只挑幾個月。每個月用 2-4 句具體說明：
- 該月身心狀態主調（體力充沛／容易疲倦／情緒敏感／壓力大／適合休養／免疫偏弱...）
- 該月最容易出現的身體訊號（睡眠、消化、呼吸、情緒、免疫、頭痛、筋骨...挑最可能的 1-2 項）
- 該月適合做什麼保養（健康檢查時機、運動強度、飲食重點、作息調整、情緒紓壓）
格式：每月獨立一段，用「${y}年 X 月」開頭。12 段全部都要寫，禁止用「其他月份大致類似」帶過。）`
    },
    "goal.wealth": {
      section4Title: "財富與投資——你的現況與趨勢",
      section4Body: `（必須寫 5-6 段飽滿內容：
1. 財富本質：穩定積累型、高爆發型、還是靠人合作型？錢的性格是什麼樣？
2. 收入結構：主業、副業、投資、被動收入的狀態與平衡。
3. 守財能力：容易存錢還是漏財？錢進來後通常跑去哪？
4. 近期財運趨勢：進攻期還是守成期？是在賺錢季還是調整季？
5. 投資 vs 風險：目前格局適合承擔多大風險？哪些類型投資符合你？
6. 跨系統共鳴：若多系統都指向特定財務主題（如合作、不動產、創業），點出並說明。）`,
      section5Title: `${y} 年 12 個月財運走勢`,
      section5Body: `（必須逐月分析 12 個月全部都要寫。每月 2-4 句：
- 該月財運主調（進財月／守財月／破財風險月／投資窗口／合作機會／簽約吉時...）
- 該月最可能發生的財務事件
- 該月具體建議（簽約時機、投資動作、開銷控制、收帳催款）
格式：「${y}年 X 月」開頭，每月獨立一段。）`
    },
    "goal.love": {
      section4Title: "感情與關係——你的現況與趨勢",
      section4Body: `（必須寫 5-6 段飽滿內容：感情基底特質／目前關係狀態（若有伴，談伴侶互動；若單身，談會遇到什麼樣的人）／桃花與穩定的拉扯／對方輪廓或理想對象特質／近期關係主題／跨系統共鳴訊號。）`,
      section5Title: `${y} 年 12 個月感情走勢`,
      section5Body: `（12 個月全部逐月分析。每月 2-4 句：桃花活躍度／穩定或動盪／吸引力高低／衝突或分合可能／具體建議（表白、溝通、獨處、經營）。「${y}年 X 月」格式。）`
    },
    "goal.career": {
      section4Title: "事業與工作——你的現況與趨勢",
      section4Body: `（必須寫 5-6 段飽滿內容：天賦與適合的工作方向／目前事業階段（開創、擴張、穩定、轉型）／升遷或轉職訊號／貴人與阻力的來源／近期最關鍵的事業主題／跨系統共鳴訊號。）`,
      section5Title: `${y} 年 12 個月事業走勢`,
      section5Body: `（12 個月全部逐月分析。每月 2-4 句：升遷／轉職／合作／衝突／出差／考試／創業窗口 + 具體建議。「${y}年 X 月」格式。）`
    },
    "goal.general": {
      section4Title: "今年整體運勢——你的現況與趨勢",
      section4Body: `（必須寫 5-6 段飽滿內容：今年主題／事業財運面／感情人際面／健康養生面／最需要注意的事／跨系統共鳴訊號。）`,
      section5Title: `${y} 年 12 個月運勢走勢`,
      section5Body: `（12 個月全部逐月分析。每月 2-4 句：該月整體能量 + 事業/財運/感情/健康挑 1-2 個亮點 + 建議。「${y}年 X 月」格式。）`
    },
  };
}

function getWizardSystemPromptZh(goalKey) {
  const _now = new Date();
  const _y = _now.getFullYear(), _m = _now.getMonth() + 1, _d = _now.getDate();
  const framework = getGoalFramework(_y);
  const fw = framework[goalKey] || framework["goal.general"];
  const s4Title = fw.section4Title;
  const s4Body = fw.section4Body;
  const s5Title = fw.section5Title;
  const s5Body = fw.section5Body;
  return `你是「命理三鏡」的命運顧問，用溫暖自然的語氣為一般大眾解讀命運。

核心規則（必須嚴格遵守）：
1. 絕對禁止提到任何命理系統名稱：不可出現「紫微斗數」「八字」「四柱」「西洋占星」「星盤」「命盤」「排盤」等詞彙。
2. 不可提到任何系統專有術語：不可出現「化祿」「化忌」「天干地支」「十神」「宮位」「相位」「行星」「星座」「主星」「命宮」「財帛宮」等。
3. 直接給出結論和建議，不要展示推理過程。用戶不需要知道「為什麼」，只需要知道「是什麼」和「怎麼做」。
4. 用日常生活化的語言，像朋友在聊天一樣自然。

格式規則（必須嚴格遵守）：
絕對禁止使用 Markdown 語法。不可出現 #、##、###、**粗體**、*斜體*、- 列表、| 表格 |、代碼塊。
絕對禁止使用 emoji、表情符號、小圖示。不可出現任何 emoji unicode 字元。
用 [SECTION] 標記來分段。格式為：每段開頭獨立一行寫 [SECTION] 標題文字，然後換行寫內容。段落之間空行分隔。
內容用自然的句子和段落書寫，像寫文章一樣，不要用列表或項目符號。

篇幅要求（極重要）：
用戶選擇專項主題（健康／財富／感情／事業）時，該主題的分析必須深入、飽滿、具體。禁止用「你目前的健康走勢像是兩頭在拉扯...好消息是，接下來會出現幾個對健康相對友善的時間窗口」這類籠統 3 段帶過的寫法。專項主題章節至少 5-6 段，月度走勢必須 12 個月全部逐月展開。

輸出結構：

[SECTION] 你是這樣的人
（用 3-4 段深入描述核心性格、天賦才華、思維方式和行為模式。要具體到讓人覺得「對！就是我」。不是籠統的「你很聰明」，而是描述具體的性格特質、做事風格、與人相處的方式。包含優勢和需要注意的盲點。）

[SECTION] 你走過的路——過去十年的人生階段
（根據上一個大運的格局，回顧過去這段時間的人生主調。這段時期的重心在哪裡？經歷了什麼樣的成長或挑戰？讓用戶感覺「確實是這樣」，建立信任感。要具體描述這段時期的生活重心、情感狀態、事業走向。）

[SECTION] 你正在經歷的——現在這個人生階段
（根據目前大運的格局，描述現階段的主題和能量走向。跟上一個階段有什麼不同？重心轉移到哪裡？目前的機會和挑戰是什麼？讓用戶理解「為什麼最近感覺不一樣了」。）

[SECTION] ${s4Title}
${s4Body}

[SECTION] ${s5Title}
${s5Body}

[SECTION] 你現在該做的三件事
（具體、可行動的建議，不要空泛的道理）

[SECTION] 近期提醒
（最近 1-3 個月最關鍵的一件事）

寫作風格：
把每一段寫得像在跟好朋友說話，有溫度、有畫面。避免學術口吻和空泛的形容詞。每個建議都要具體到「做什麼」而不是「注意什麼」。篇幅適中，不要太長，重點突出。

日期規則：
所有日期一律使用國曆（西元）。如果需要提到農曆月份，必須附上國曆對照。

一致性原則：
分析必須 100% 基於排盤資料的客觀格局，不可隨意發揮。但輸出時只呈現結論，不暴露推導過程。

中立原則：
不可猜測或假設用戶的職業、行業、家庭、收入、教育等背景。描述保持通用。

時間背景：
今天是 ${_y} 年 ${_m} 月 ${_d} 日。用戶說「今年」指 ${_y} 年，「明年」指 ${_y+1} 年，「後年」指 ${_y+2} 年，「去年」指 ${_y-1} 年。所有時間相關的分析都必須以此為基準。「近期提醒」只能涵蓋 ${_y} 年 ${_m} 月起（含本月）到未來 3 個月以內的範圍，不可提到早於本月的月份。

語氣：溫暖、直接、有洞察力。正面為主但誠實。不需要加免責聲明。`;
}

// Goal topic mapping for KB filtering (language-neutral)
const GOAL_TOPIC_MAP = {
  "goal.love": ["love", "timing"],
  "goal.career": ["career", "timing"],
  "goal.wealth": ["wealth", "timing"],
  "goal.health": ["health"],
  "goal.general": null, // null = return all
};

function filterKBByGoal(kbEntries, goalKey) {
  if (!goalKey || GOAL_TOPIC_MAP[goalKey] === null) return kbEntries;

  const needTopics = GOAL_TOPIC_MAP[goalKey] || [];
  if (needTopics.length === 0) return kbEntries;

  const filtered = kbEntries.filter(e => {
    const t = e.tags || e.topics || [];
    if (t.includes("core")) return true;
    return needTopics.some(topic => t.includes(topic));
  });
  // Safety: if filtering removed too much, send all (quality first). Log so we
  // can audit how often fallback fires and tune thresholds / topic maps.
  if (filtered.length < 20) {
    console.warn(`[KB_FALLBACK] goal=${goalKey} filtered=${filtered.length}/${kbEntries.length} below threshold=20, sending full KB`);
    try { trackEvent("kb_fallback", { goal: goalKey, filtered: filtered.length, total: kbEntries.length }); } catch {}
    return kbEntries;
  }
  return filtered;
}

function buildWizardPrompt(kbEntries, goalKey) {
  // [LAB] KB is handled server-side with goal-based filtering
  // Only send the base system prompt, no KB entries
  // Rebuilt each call so today's date stays fresh (Bug fix: prompt was frozen at module load)
  return getWizardSystemPromptZh(goalKey);
}

/**
 * [LAB] Extract summary from report for follow-up context
 * Takes first 2 sentences from each [SECTION], ~400-800 chars total
 */
function extractSummary(report) {
  if (!report) return "";
  const sections = report.split(/\[SECTION\]\s*/);
  const parts = [];
  for (const sec of sections) {
    const trimmed = sec.trim();
    if (!trimmed) continue;
    // First line is the section title, rest is content
    const lines = trimmed.split("\n");
    const title = lines[0].trim();
    const body = lines.slice(1).join("\n").trim();
    // Take first 2 sentences (split by 。or .)
    const sentences = body.split(/(?<=[。\.\!！\?？])\s*/).filter(s => s.trim());
    const excerpt = sentences.slice(0, 2).join("");
    if (title && excerpt) {
      parts.push(`【${title}】${excerpt}`);
    }
  }
  return parts.join("\n");
}

// ============================================================
// FOLLOW-UP: 問題路由 — 根據追問內容判斷該聚焦哪些宮位和疊宮
// ============================================================

const QUESTION_FOCUS_MAP = [
  { pattern: /小孩|生子|女兒|兒子|子女|懷孕|baby|child|pregnan/i,
    focus: "子女",
    palaces: ["子女宮", "田宅宮", "命宮", "夫妻宮"],
    guide: "判斷子女緣：看本命子女宮主星與四化（化祿=子女緣厚、化忌=延遲或壓力），大限子女宮疊本命哪宮判斷這十年的子女運，流年子女宮疊宮判斷今年時機，流月四化進入子女宮的月份=最可能的時間窗口。生男生女：陽星多偏男、陰星多偏女，結合命宮和子女宮的陰陽屬性判斷。" },
  { pattern: /感情|婚姻|另一半|桃花|離婚|對象|戀愛|交往|復合|love|marriage|divorce/i,
    focus: "感情",
    palaces: ["夫妻宮", "福德宮", "命宮", "遷移宮"],
    guide: "判斷感情：看本命夫妻宮主星與四化，大限夫妻宮疊本命哪宮=這十年感情主題，流年夫妻宮疊宮=今年感情走向，流月四化進夫妻宮=感情變化的具體月份。桃花看交友宮和遷移宮。" },
  { pattern: /事業|工作|升遷|轉職|跳槽|老闆|同事|職場|career|job|promotion/i,
    focus: "事業",
    palaces: ["官祿宮", "命宮", "遷移宮", "田宅宮"],
    guide: "判斷事業：看本命官祿宮主星與四化，大限官祿宮疊本命哪宮=這十年事業主題，流年官祿宮疊宮=今年事業走向，流月四化進官祿宮=關鍵變化月份。升遷看化權、化祿飛入官祿宮的時機。" },
  { pattern: /財運|投資|賺錢|進財|破財|買賣|股票|理財|wealth|money|invest/i,
    focus: "財運",
    palaces: ["財帛宮", "福德宮", "田宅宮", "官祿宮"],
    guide: "判斷財運：看本命財帛宮主星與四化，福德宮=財庫（能不能存住），大限財帛宮疊本命哪宮=這十年財運格局，流年財帛宮疊宮=今年財運走向，流月化祿/祿存進財帛宮=進財月份，化忌進財帛宮=破財風險月份。" },
  { pattern: /健康|身體|開刀|手術|生病|養生|疾病|過敏|health|sick/i,
    focus: "健康",
    palaces: ["疾厄宮", "命宮", "父母宮", "福德宮"],
    guide: "判斷健康：看本命疾厄宮主星判斷體質弱點，大限疾厄宮疊宮=這十年健康主題，流年疾厄宮化忌=今年需注意的健康問題，流月化忌進疾厄宮=具體風險月份。八字看五行偏枯判斷臟腑弱點。" },
  { pattern: /搬家|買房|房產|不動產|裝潢|租房|house|property/i,
    focus: "房產",
    palaces: ["田宅宮", "財帛宮", "命宮", "遷移宮"],
    guide: "判斷房產：看本命田宅宮主星與四化，大限/流年田宅宮疊宮=房產變動時機，化祿進田宅宮=有購屋機會，化忌=搬遷壓力或房屋問題。遷移宮看搬遷跡象。" },
  { pattern: /考試|學業|留學|進修|讀書|證照|exam|study/i,
    focus: "學業",
    palaces: ["父母宮", "官祿宮", "命宮", "遷移宮"],
    guide: "判斷學業：看父母宮（文書宮）主星與四化，官祿宮=學業表現，化科進父母宮或官祿宮=考運佳，留學看遷移宮。流年/流月四化進這些宮位=關鍵時間。" },
  { pattern: /合夥|創業|開店|做生意|合作|partner|startup|business/i,
    focus: "合夥創業",
    palaces: ["交友宮", "官祿宮", "財帛宮", "兄弟宮"],
    guide: "判斷合夥：看交友宮（僕役宮）主星與四化=合作對象品質，兄弟宮=平輩合夥關係，官祿宮=事業能否成功，財帛宮=合夥財運。化忌在交友宮=合夥有風險，化祿=有好的合作機會。" },
  { pattern: /父母|爸|媽|長輩|家人|parent|family/i,
    focus: "家庭",
    palaces: ["父母宮", "田宅宮", "命宮", "兄弟宮"],
    guide: "判斷家庭關係：看父母宮主星與四化=與父母的互動模式，田宅宮=家庭環境，兄弟宮=手足關係。大限/流年疊宮變化看具體時間的家庭事件。" },
];

function getFollowUpFocus(question) {
  for (const rule of QUESTION_FOCUS_MAP) {
    if (rule.pattern.test(question)) return rule;
  }
  return null;
}

const FOLLOWUP_SYSTEM_PROMPT = `你是「命理三鏡」的命運顧問。用戶已經做過完整分析，現在針對特定問題追問。

回覆規則：
1. 直接回答問題，不要重新跑完整報告，不要加 [SECTION] 標記
2. 必須根據排盤資料中的具體宮位、四化、疊宮（本命/大限/流年/流月的交互）來推論，給出有依據的回答
3. 不提任何命理系統名稱和專有術語（紫微、八字、宮位、四化等），用自然語言表達
4. 涉及時間的判斷必須對應到排盤中的具體數據，不可隨意指定月份或年份
5. 不可編造排盤中不存在的星曜、宮位、相位
6. 回答要具體、有結論，不要空泛
7. 篇幅適中，聚焦問題本身，不要發散到其他主題`;

// ============================================================
// WIZARD COMPONENT
// ============================================================

const TOTAL_STEPS = 5;

export default function WizardApp({ auth, onBack, onLogout }) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'zh-TW';
  const changeLang = (lng) => {
    i18n.changeLanguage(lng);
    // Save language preference to server for future sessions
    if (wizardUser?.email) {
      fetch(`${API_BASE}/api/fortune-session`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: wizardUser.email, session: { _lang: lng } }),
      }).catch(() => {});
    }
    // Re-translate horoscope if already loaded
    if (horoscopeData?.horoscope && lng !== 'zh-TW' && horoscopeData.horoscope._lang !== lng) {
      translateHoroscope(horoscopeData.horoscope, lng).then(translated => {
        setHoroscopeData(prev => prev ? { ...prev, horoscope: translated } : null);
      });
    } else if (lng === 'zh-TW' && horoscopeData?.horoscope?._lang) {
      // Switch back to Chinese — refetch original
      fetchHoroscope(selectedZodiac || null);
    }
  };

  const savedAuth = loadAuth();
  const saved = loadSession(savedAuth);

  const [step, setStep] = useState(0); // Always start at Welcome page
  const [gender, setGender] = useState(saved?.gender ?? "");
  const [goal, setGoal] = useState(saved?.goal ?? "");
  const [goalPrompt, setGoalPrompt] = useState(saved?.goalPrompt ?? "");
  const [loveSub, setLoveSub] = useState(saved?.loveSub ?? "");
  const [birthYear, setBirthYear] = useState(saved?.birthYear ?? "");
  const [birthMonth, setBirthMonth] = useState(saved?.birthMonth ?? "");
  const [birthDay, setBirthDay] = useState(saved?.birthDay ?? "");
  const [birthHour, setBirthHour] = useState(saved?.birthHour ?? "");
  const [birthMinute, setBirthMinute] = useState(saved?.birthMinute ?? "0");
  const [birthPlace, setBirthPlace] = useState(saved?.birthPlace || "");
  const [birthCity, setBirthCity] = useState(saved?.birthCity ?? null);
  const [citySearchResults, setCitySearchResults] = useState([]);
  const [citySearchQuery, setCitySearchQuery] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [serverReadings, setServerReadings] = useState([]);
  const [finalResult, setFinalResult] = useState(saved?.finalResult ?? "");
  const [reportSummary, setReportSummary] = useState("");
  const [rawResults, setRawResults] = useState(saved?.rawResults ?? []);
  const [error, setError] = useState("");

  // 合盤 state (restore from session)
  const [showHeban, setShowHeban] = useState(saved?.showHeban ?? false);
  const [hebanRelation, setHebanRelation] = useState(saved?.hebanRelation ?? "");
  const [hebanFocus, setHebanFocus] = useState("");
  const [hebanName, setHebanName] = useState(saved?.hebanName ?? "");
  const [hebanYear, setHebanYear] = useState(saved?.hebanYear ?? "");
  const [hebanMonth, setHebanMonth] = useState(saved?.hebanMonth ?? "");
  const [hebanDay, setHebanDay] = useState(saved?.hebanDay ?? "");
  const [hebanHour, setHebanHour] = useState(saved?.hebanHour ?? "");
  const [hebanMinute, setHebanMinute] = useState(saved?.hebanMinute ?? "0");
  const [hebanGender, setHebanGender] = useState(saved?.hebanGender ?? "");

  // Twin state — uses language-neutral values: "same"/"mixed" and "first"/"second"
  const [isTwin, setIsTwin] = useState(saved?.isTwin ?? false);
  const [twinOrder, setTwinOrder] = useState(saved?.twinOrder ?? "");
  const [twinType, setTwinType] = useState(saved?.twinType ?? "");
  const [hebanAnalyzing, setHebanAnalyzing] = useState(false);
  const [hebanResult, setHebanResult] = useState(saved?.hebanResult ?? "");
  // 合盤子模式: basic / monthly / timed (L5 / L6). 月度/擇吉需對方時辰 + 目標月或日
  const [hebanMode, setHebanMode] = useState(saved?.hebanMode ?? "basic");
  const [hebanTargetMonth, setHebanTargetMonth] = useState(saved?.hebanTargetMonth ?? String(new Date().getMonth() + 1));
  const [hebanTargetDay, setHebanTargetDay] = useState(saved?.hebanTargetDay ?? String(new Date().getDate()));

  const [activeReadingId, setActiveReadingId] = useState(saved?.activeReadingId ?? null);
  const [chatHistory, setChatHistory] = useState(saved?.chatHistory ?? []);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showQuickQ, setShowQuickQ] = useState(true);
  const chatEndRef = useRef(null);
  const hebanRef = useRef(null);

  const [wizardUser, setWizardUser] = useState(savedAuth);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const pendingActionRef = useRef(null);

  const [translatedResults, setTranslatedResults] = useState({});
  const [translating, setTranslating] = useState(false);
  const [displayLang, setDisplayLang] = useState(null);

  const [showFamily, setShowFamily] = useState(false);

  const [showAccount, setShowAccount] = useState(false);
  const [userFeatures, setUserFeatures] = useState([]);
  const [userCredits, setUserCredits] = useState(0);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [paymentPlans, setPaymentPlans] = useState(null);
  const [paymentMsg, setPaymentMsg] = useState(null); // {type: "success"|"fail"|"cancel", order}

  // Handle payment callback from OEN redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    const orderId = params.get("order");
    if (paymentStatus) {
      setPaymentMsg({ type: paymentStatus, order: orderId });
      if (paymentStatus === "success" && wizardUser?.email) {
        fetchUserStatus(wizardUser.email);
      }
      setShowAccount(true);
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
      // Auto-dismiss after 8 seconds
      setTimeout(() => setPaymentMsg(null), 8000);
    }
  }, []);

  // Charts (命盤庫) state
  const [userCharts, setUserCharts] = useState([]);
  // Save-chart modal: pops after each analysis where the birth data is new to
  // this user. `pendingSave` holds the data the modal will persist on confirm.
  const [showSaveChartModal, setShowSaveChartModal] = useState(false);
  const [saveChartName, setSaveChartName] = useState("");
  const [pendingSave, setPendingSave] = useState(null);
  // Monthly overview expansion + paywall
  const [expandedMonth, setExpandedMonth] = useState(null);  // 1..12
  const [showUnlockMonthly, setShowUnlockMonthly] = useState(false);
  // #8 Decision Advisor — modal state. decisionChart=null means "guest mode"
  // (home CTA with no chart selected); otherwise the chart the decision is
  // anchored to. `status` drives the modal view stack: input form →
  // analyzing spinner → result cards (or blocked/error screens).
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionChart, setDecisionChart] = useState(null);
  const [decisionQuestion, setDecisionQuestion] = useState("");
  const [decisionStatus, setDecisionStatus] = useState("input");
  const [decisionResult, setDecisionResult] = useState(null);
  const [decisionError, setDecisionError] = useState("");
  // When the question has no parseable date, switch to status="need_date" and
  // render an inline date/time picker. On 繼續 we use these instead of
  // re-parsing the question string.
  const [decisionDateOverride, setDecisionDateOverride] = useState("");  // "YYYY-MM-DD"
  const [decisionTimeOverride, setDecisionTimeOverride] = useState("");  // "HH:MM" (optional)
  // Chat-only view: when user enters via "問事" on a chart card they want to
  // dive straight into the Q&A UI without re-reading the full report.
  const [chatOnlyMode, setChatOnlyMode] = useState(false);
  // 歷史詢問 panel is collapsed by default so the user lands in an empty,
  // clean input box instead of a long scroll of past Q&A.
  const [showChatHistoryPanel, setShowChatHistoryPanel] = useState(false);
  const [showAddChart, setShowAddChart] = useState(false);
  const [selectedChart, setSelectedChart] = useState(null);
  const [expandedChartId, setExpandedChartId] = useState(null);
  const [newChartName, setNewChartName] = useState("");
  const [newChartGender, setNewChartGender] = useState("");
  const [newChartYear, setNewChartYear] = useState("");
  const [newChartMonth, setNewChartMonth] = useState("");
  const [newChartDay, setNewChartDay] = useState("");
  const [newChartHour, setNewChartHour] = useState("");
  const [newChartMinute, setNewChartMinute] = useState("0");
  const [newChartPlace, setNewChartPlace] = useState("");
  const [newChartSaving, setNewChartSaving] = useState(false);

  // Horoscope state
  const [horoscopeData, setHoroscopeData] = useState(null);
  const [horoscopeLoading, setHoroscopeLoading] = useState(false);
  const [selectedZodiac, setSelectedZodiac] = useState("");
  const [showHoroscopeDetail, setShowHoroscopeDetail] = useState(false);

  // #8 — Extract an explicit date (optional time) out of the user's question
  // so we can pre-compute the 流日/流時 overlay before sending to the LLM.
  // The LLM no longer needs to guess day stems; the prompt gets exact sihua.
  // Supported forms: "3/15", "3-15", "3月15日", optional "下午2 / 14:00 / 2pm".
  const parseQuestionDateTime = (question) => {
    if (!question) return null;
    const now = new Date();
    const todayY = now.getFullYear(), todayM = now.getMonth() + 1, todayD = now.getDate();
    let y = null, m = null, d = null;

    // 1. 相對日期 (zh/en/ja)
    const relMap = [
      [/(大大後天|大後天)/, 3],
      [/(後天|後日|the day after tomorrow)/i, 2],
      [/(明天|明日|tomorrow)/i, 1],
      [/(今天|今日|today)/i, 0],
      [/(昨天|昨日|yesterday)/i, -1],
    ];
    for (const [rx, delta] of relMap) {
      if (rx.test(question)) {
        const target = new Date(todayY, todayM - 1, todayD + delta);
        y = target.getFullYear(); m = target.getMonth() + 1; d = target.getDate();
        break;
      }
    }

    // 2. 週 X / 下週 X / 下星期 X / next <weekday>
    if (!y) {
      const weekMap = { "日": 0, "天": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6,
        "sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6,
        "日曜": 0, "月曜": 1, "火曜": 2, "水曜": 3, "木曜": 4, "金曜": 5, "土曜": 6 };
      const wx = question.match(/(下|下個|next)?\s*(週|禮拜|星期|week)\s*([日天一二三四五六])/) ||
                 question.match(/next\s+(sun|mon|tue|wed|thu|fri|sat)/i) ||
                 question.match(/(下|下個)?\s*(日|月|火|水|木|金|土)曜日?/);
      if (wx) {
        const dayKey = (wx[3] || wx[1] || wx[2] || "").toLowerCase();
        const targetDow = weekMap[dayKey];
        if (targetDow !== undefined) {
          const curDow = now.getDay();
          let delta = (targetDow - curDow + 7) % 7;
          if (delta === 0) delta = 7; // 同一天的「下週X」= 下週
          const wantNext = /下|next/.test(question);
          if (wantNext && delta < 7) delta += 7;
          const target = new Date(todayY, todayM - 1, todayD + delta);
          y = target.getFullYear(); m = target.getMonth() + 1; d = target.getDate();
        }
      }
    }

    // 3. 下個月 X 號
    if (!y) {
      const nm = question.match(/下個?月\s*(\d{1,2})\s*[號日]?/);
      if (nm) {
        const target = new Date(todayY, todayM, parseInt(nm[1], 10));
        y = target.getFullYear(); m = target.getMonth() + 1; d = target.getDate();
      }
    }

    // 4. 具體日期 N/M, N月M日 (fallback — 原本邏輯)
    if (!y) {
      const mdMatch = question.match(/(\d{1,2})\s*[\/月\-]\s*(\d{1,2})\s*日?/);
      if (mdMatch) {
        const mm = parseInt(mdMatch[1], 10);
        const dd = parseInt(mdMatch[2], 10);
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
          y = todayY; m = mm; d = dd;
          const candidate = new Date(y, m - 1, d);
          if (candidate.getTime() < now.getTime() - 24 * 3600 * 1000) y++;
        }
      }
    }

    if (!y) return null;

    // 5. 時間解析 (optional — 流時)
    let hour = null, minute = null;
    const timeMatch = question.match(/(下午|晚上|晚|上午|早上|afternoon|evening|morning|pm|am)?\s*(\d{1,2})\s*[點:時]\s*(\d{1,2})?/i);
    if (timeMatch) {
      hour = parseInt(timeMatch[2], 10);
      minute = parseInt(timeMatch[3] || "0", 10) || 0;
      const period = (timeMatch[1] || "").toLowerCase();
      if ((period.includes("下午") || period.includes("晚") || period.includes("afternoon") || period.includes("evening") || period === "pm") && hour < 12) hour += 12;
    }
    if (hour === null) {
      const clockMatch = question.match(/(\d{1,2}):(\d{2})/);
      if (clockMatch) {
        hour = parseInt(clockMatch[1], 10);
        minute = parseInt(clockMatch[2], 10);
      }
    }
    return { year: y, month: m, day: d, hour, minute };
  };

  // #8 — Open the decision advisor modal anchored to a chart (null → guest).
  const openDecision = (chart, entrySource) => {
    setDecisionChart(chart || null);
    setDecisionQuestion("");
    setDecisionResult(null);
    setDecisionError("");
    setDecisionDateOverride("");
    setDecisionTimeOverride("");
    setDecisionStatus("input");
    setShowDecisionModal(true);
    trackEvent("decision_started", { entry: entrySource || "unknown", has_chart: !!chart });
  };

  // #8 — Run classification + decision analysis. Returns parsed JSON or an
  // error payload. Uses the existing /api/fortune poll loop so infra stays
  // single-track.
  const runDecision = async () => {
    const question = decisionQuestion.trim();
    if (!question) return;
    // Client-side keyword pre-filter — don't even call the LLM for obvious
    // self-harm / violence terms. Saves tokens and guarantees the safety
    // message shows even if the LLM misclassifies.
    if (hitsDecisionBlockList(question)) {
      setDecisionResult({
        type: "blocked",
        question_summary: question,
        time_anchor: null,
        options: [],
        recommendation: "",
        gap: "",
        notes: DECISION_SAFETY_MESSAGE[currentLang] || DECISION_SAFETY_MESSAGE["zh-TW"],
      });
      setDecisionStatus("blocked");
      trackEvent("decision_blocked", { reason: "keyword_prefilter" });
      return;
    }

    // ════════════════════════════════════════════════════════════
    // 決策建議強制規則 (不可繞過):
    //   1. 必須有具體日期 (才能算流日)
    //   2. 必須有命盤 (本命盤 — 才能疊流日)
    //   3. 必須成功計算本命+大限+流年+流月+流日 (+流時 if 可用)
    //   4. 任一層疊宮計算失敗 → 中止, 不送 AI
    // ════════════════════════════════════════════════════════════

    // Step 1. 日期 — 先看問題能不能解析；不能就改成 need_date 狀態讓使用者
    // 透過日期選擇器補資料，**不要 block**。使用者已經給的 override 也接受。
    let preDt = parseQuestionDateTime(question);
    if (!preDt && decisionDateOverride) {
      const [y, m, d] = decisionDateOverride.split("-").map(s => parseInt(s, 10));
      if (y && m && d) {
        let h = null, min = null;
        if (decisionTimeOverride) {
          const [hh, mm] = decisionTimeOverride.split(":").map(s => parseInt(s, 10));
          if (!isNaN(hh)) { h = hh; min = isNaN(mm) ? 0 : mm; }
        }
        preDt = { year: y, month: m, day: d, hour: h, minute: min };
      }
    }
    if (!preDt) {
      // Pre-fill picker with today to reduce friction; user can adjust.
      if (!decisionDateOverride) {
        const n = new Date();
        setDecisionDateOverride(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`);
      }
      setDecisionStatus("need_date");
      trackEvent("decision_need_date");
      return;
    }

    // Step 2. 命盤 — 缺盤就切到 need_chart，列出可用盤給使用者挑；沒有盤
    // 就顯示建立命盤的 CTA（真的沒盤能用時才是 block case）。
    let chart = decisionChart;
    if (!chart?.birthData?.year) {
      if (userCharts?.length > 0) {
        setDecisionStatus("need_chart");
        trackEvent("decision_need_chart", { available: userCharts.length });
        return;
      }
      setDecisionError(
        t('decision.needChart', {
          defaultValue: '決策建議必須基於完整命盤。請先登入並建立一張命盤，再使用決策建議。'
        })
      );
      setDecisionStatus("input");
      trackEvent("decision_blocked", { reason: "missing_chart" });
      return;
    }

    setDecisionStatus("analyzing");
    try {
      const chartsText = Object.entries(chart.charts || {}).map(([sys, text]) => `【${sys}】\n${text}`).join("\n\n===\n\n");
      const bd = chart.birthData;
      const bdLine = `- 出生：${bd.year}/${bd.month}/${bd.day} ${bd.hour || 0}:${bd.minute || 0}\n- 性別：${chart?.gender || "未指定"}\n- 出生地：${bd.place || "未指定"}`;
      const today = new Date();
      const dt = preDt;

      // Step 3. 疊宮到極致 — 強制計算, 失敗即中止
      let dayHourBlock = "";
      try {
        const rawChart = calculateChart(
          parseInt(bd.year), parseInt(bd.month), parseInt(bd.day),
          parseInt(bd.hour || 0), parseInt(bd.minute || 0),
          chart.gender || "男"
        );
        if (!rawChart || !rawChart.gongs) throw new Error("本命盤計算失敗");

        // 大限 / 流年 / 流月 overlay — 必須
        const transitOverlay = calculateTransitOverlay(rawChart);
        if (!transitOverlay) throw new Error("大限/流年/流月疊宮計算失敗");

        // 流日 (+ 流時) overlay — 必須
        const dayHourOverlay = calculateDayHourOverlay(
          rawChart, dt.year, dt.month, dt.day, dt.hour, dt.minute
        );
        if (!dayHourOverlay?.summary) throw new Error("流日疊宮計算失敗");

        dayHourBlock = `\n## 精算流日${dt.hour !== null ? '/流時' : ''}疊宮（請直接引用，勿自推）\n${dayHourOverlay.summary}\n`;
      } catch (e) {
        console.error("[decision] overlay computation failed:", e);
        setDecisionError(
          t('decision.overlayFailed', {
            defaultValue: '命理疊宮計算失敗：' + e.message + '。請重試，或聯繫管理員。'
          })
        );
        setDecisionStatus("input");
        trackEvent("decision_blocked", { reason: "overlay_failed", error: e.message });
        return;
      }

      const timeAnchorLine = `使用者決策日期：${dt.year}/${dt.month}/${dt.day}${dt.hour !== null ? ` ${String(dt.hour).padStart(2,'0')}:${String(dt.minute||0).padStart(2,'0')}` : '（未指定具體時間，僅算到流日）'}`;
      const userPrompt = `## 時間基準
今天是 ${today.getFullYear()}/${today.getMonth()+1}/${today.getDate()}。
${timeAnchorLine}

## 排盤資料
${chartsText}
${dayHourBlock}
## 用戶資料
${bdLine}

## 使用者問題
${question}

## 分析規則（決策層級強制）
你做的是「決策建議」, 不是泛泛運勢. 你必須:
1. 主要依據「流日疊宮」判斷該日吉凶與建議（若有流時更具體到時辰）
2. 流月提供背景氛圍、流年提供更大格局、大限提供長期脈絡 — 這些是背景, 不是主判據
3. 本命盤提供個性傾向 — 影響如何詮釋流日訊號
4. 必須明確指出「${dt.year}/${dt.month}/${dt.day}」當天的流日四化落在哪些宮位, 並據此給出選項評分
5. 禁止只講流年/流月就下結論 — 如果流日疊宮資料不足，要在 gap 欄位明說「流日資料不足，建議依流月氛圍參考」

請依系統指令分類並輸出 JSON。`;

      const langLabel = LANG_AI[currentLang] || "繁體中文";
      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: [],
          system: decisionSystemPrompt(langLabel),
          prompt: userPrompt,
          visitor_id: getVisitorId(),
          user: wizardUser?.email || null,
          user_name: wizardUser?.name || "",
          goal: "decision",
          job_type: "decision",
          chart_id: chart?.id || "",
          birth_data: bd,
        }),
      });
      if (!submitRes.ok) throw new Error(`submit ${submitRes.status}`);
      const { job_id } = await submitRes.json();

      let resultText = "";
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
        if (!pollRes.ok) continue;
        const data = await pollRes.json();
        if (data.status === "done") { resultText = data.result || ""; break; }
      }
      if (!resultText) throw new Error("timeout");

      // Model sometimes wraps JSON in a ```json fence despite the instructions;
      // strip it defensively before parsing.
      const cleaned = resultText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        // Last-ditch: find the first { and last } and try again.
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (m) {
          try { parsed = JSON.parse(m[0]); } catch { parsed = null; }
        }
      }
      if (!parsed) {
        console.error("[decision] unparseable AI response:", cleaned.slice(0, 500));
        trackEvent("decision_error", { reason: "json_parse_failed" });
        setDecisionError(t('decision.badResponse', {
          defaultValue: 'AI 回應格式錯誤（無法解析 JSON）。請重試，或換個問題方式。'
        }));
        setDecisionStatus("input");
        return;
      }
      const schemaCheck = validateDecisionResponse(parsed);
      if (!schemaCheck.ok) {
        console.error("[decision] schema validation failed:", schemaCheck.reason, parsed);
        trackEvent("decision_error", { reason: `schema_${schemaCheck.reason}` });
        setDecisionError(t('decision.badResponse', {
          defaultValue: 'AI 回應格式錯誤（欄位不完整）。請重試，或換個問題方式。'
        }));
        setDecisionStatus("input");
        return;
      }

      setDecisionResult(parsed);
      trackEvent("decision_type_detected", { type: parsed.type });
      if (parsed.type === "blocked") {
        trackEvent("decision_blocked", { reason: "llm_classifier" });
        setDecisionStatus("blocked");
      } else if (parsed.type === "open") {
        setDecisionStatus("result");  // still result screen, rendered differently
      } else {
        setDecisionStatus("result");
        trackEvent("decision_completed", { type: parsed.type, options: parsed.options?.length || 0 });
        // Persist the decision under the chart (or unfiled if guest) so it
        // shows up alongside analyses in the chart library. The raw JSON
        // lives in `decisionResult`; the dashboard history card knows to
        // dispatch back to the modal instead of restoreReading()'s report view.
        if (wizardUser?.email) {
          const decisionRecord = {
            id: `decision_${job_id}`,
            date: new Date().toISOString(),
            goal: "decision",
            goalPrompt: question,
            decisionResult: parsed,
            result: "",
            birthData: bd,
            gender: chart?.gender || wizardUser?.gender || "",
            source: "b2c",
          };
          saveReading(wizardUser, decisionRecord);
          setServerReadings(prev => [decisionRecord, ...prev].slice(0, 50));
        }
      }
    } catch (e) {
      console.error("[decision] error:", e);
      setDecisionError(e.message || "error");
      setDecisionStatus("error");
    }
  };

  // #7b — Start the chat UI on a specific chart without running a new analysis.
  // If the chart has any prior reading, the most recent one seeds the chat's
  // report context so follow-up questions reference it. If not, we still land
  // the user on the result/chat screen with the chart's raw birthdata so they
  // can ask general questions.
  const startChatOnChart = (chart) => {
    const readings = serverReadings.filter(r => {
      const bd = r.birthData || {};
      const cbd = chart.birthData || {};
      return String(bd.year) === String(cbd.year)
        && String(bd.month) === String(cbd.month)
        && String(bd.day) === String(cbd.day);
    });
    readings.sort((a, b) => new Date(b.time || b.date || 0) - new Date(a.time || a.date || 0));
    setChatOnlyMode(true);
    setShowChatHistoryPanel(false);
    if (readings.length > 0) {
      restoreReading(readings[0]);
    } else {
      // No prior reading for this chart — synthesize minimal chat context.
      const bd = chart.birthData || {};
      if (chart.gender) setGender(chart.gender);
      setBirthYear(bd.year || "");
      setBirthMonth(bd.month || "");
      setBirthDay(bd.day || "");
      setBirthHour(bd.hour || "");
      setBirthMinute(bd.minute || "0");
      if (bd.place) setBirthPlace(bd.place);
      if (bd.city) setBirthCity(bd.city);
      const raw = Object.entries(chart.charts || {}).map(([system, text]) => ({ system, text, result: "" }));
      setRawResults(raw);
      setFinalResult("");
      setActiveReadingId(chart.id || null);
      setChatHistory([]);
      setReportSummary("");
      setShowQuickQ(true);
      setStep(TOTAL_STEPS + 1);
    }
    trackEvent("ask_question_clicked", { chart_id: chart.id, has_prior_reading: readings.length > 0 });
  };

  // Click handler for history cards. Decisions get their own path so we don't
  // spin up the full analysis result screen for a quick decision re-check.
  const openHistoryCard = (reading) => {
    if (reading?.goal === "decision") {
      let parsed = reading.decisionResult;
      if (!parsed && reading.finalResult) {
        try { parsed = JSON.parse(reading.finalResult); } catch { parsed = null; }
      }
      if (!parsed) return;
      // Find the chart this decision was anchored to (by birthData) so the
      // modal header shows the right name.
      const bd = reading.birthData || {};
      const anchor = userCharts.find(c => {
        const cb = c.birthData || {};
        return String(cb.year) === String(bd.year)
          && String(cb.month) === String(bd.month)
          && String(cb.day) === String(bd.day);
      }) || null;
      setDecisionChart(anchor);
      setDecisionQuestion(reading.goalPrompt || "");
      setDecisionResult(parsed);
      setDecisionStatus(parsed.type === "blocked" ? "blocked" : "result");
      setDecisionError("");
      setShowDecisionModal(true);
      return;
    }
    restoreReading(reading);
  };

  // Restore a past reading into current state (for dashboard)
  const restoreReading = (reading) => {
    // Server saves use "finalResult", local saves use "result"
    const resultText = reading.result || reading.finalResult || "";
    // Server saves may have results array from pro format
    if (!resultText && reading.results?.length > 0) {
      setFinalResult(reading.results.map(r => r.result).join("\n\n"));
    } else {
      setFinalResult(resultText);
    }
    let restoredResults = reading.rawResults || [];
    if (reading.goal) setGoal(reading.goal);
    if (reading.goalPrompt) setGoalPrompt(reading.goalPrompt);
    if (reading.gender) setGender(reading.gender);
    if (reading.birthData) {
      setBirthYear(reading.birthData.year || "");
      setBirthMonth(reading.birthData.month || "");
      setBirthDay(reading.birthData.day || "");
      setBirthHour(reading.birthData.hour || "");
      setBirthMinute(reading.birthData.minute || "0");
      if (reading.birthData.place) setBirthPlace(reading.birthData.place);
      if (reading.birthData.city) setBirthCity(reading.birthData.city);

      // 自動補算/更新疊宮分析（確保是當前年份）
      try {
        const bd = reading.birthData;
        const g = reading.gender || "男";
        const cityObj = bd.city || findCity(bd.place);
        const tst = calculateTrueSolarTime(
          parseInt(bd.year), parseInt(bd.month), parseInt(bd.day),
          parseInt(bd.hour), parseInt(bd.minute || 0),
          cityObj?.lng || 121.3130, cityObj?.timezone || "Asia/Taipei"
        );
        const ziweiRaw = calculateChart(tst.adjustedYear, tst.adjustedMonth, tst.adjustedDay, tst.trueSolarHour, tst.trueSolarMinute, g);
        const overlay = calculateTransitOverlay(ziweiRaw);
        if (overlay?.summary) {
          restoredResults = restoredResults.filter(r => r.system !== "疊宮分析");
          restoredResults.push({ system: "疊宮分析", text: overlay.summary, result: "" });
        }
      } catch (e) { console.warn("[restoreReading] overlay calc failed:", e); }
    }
    setRawResults(restoredResults);
    setActiveReadingId(reading.id || reading.time);
    setChatHistory(Array.isArray(reading.chat) && reading.chat.length > 0 ? reading.chat : []);
    setHebanResult("");
    setShowHeban(false);
    setDisplayLang(null);
    setTranslatedResults({});
    setReportSummary("");
    setShowQuickQ(true);
    setStep(TOTAL_STEPS + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Helper: get display text for gender
  const genderDisplay = (g) => g === "男" ? t('welcome.male') : g === "女" ? t('welcome.female') : g;
  // Helper: get display text for goal key
  const goalDisplay = (gk) => gk ? t(gk) : "";
  // Helper: get display text for relation key
  const relationDisplay = (rk) => rk ? t(rk) : "";

  // Helper: match a reading's birthData to a chart's birthData (by year/month/day)
  const birthMatch = (bd1, bd2) => {
    if (!bd1 || !bd2) return false;
    return String(bd1.year) === String(bd2.year) && String(bd1.month) === String(bd2.month) && String(bd1.day) === String(bd2.day);
  };

  // Group readings by chart — returns { chartId: [readings], _unmatched: [readings] }
  const groupReadingsByChart = () => {
    const readings = serverReadings.filter(r => (r.finalResult || r.result) && r.goal !== "family");
    const groups = {};
    const unmatched = [];
    for (const r of readings) {
      const bd = r.birthData || {};
      let matched = false;
      for (const chart of userCharts) {
        if (birthMatch(bd, chart.birthData)) {
          if (!groups[chart.id]) groups[chart.id] = [];
          groups[chart.id].push(r);
          matched = true;
          break;
        }
      }
      if (!matched) unmatched.push(r);
    }
    return { groups, unmatched };
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Fetch KB from server on mount
  useEffect(() => { fetchKB(); }, []);

  // Migration: enforce at most one primary chart per user, preferring the
  // earliest createdAt. Older accounts predate the mutex rule (every auto-save
  // set is_primary=true) so we resolve conflicts by creation order.
  const ensureOnePrimary = async (charts) => {
    if (!charts || charts.length === 0) return charts;
    const primaries = charts.filter(c => c.is_primary);
    if (primaries.length === 1) return charts;
    const sorted = [...charts].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const keep = primaries.length > 1
      ? [...primaries].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0]
      : sorted[0];
    const fixed = charts.map(c => ({ ...c, is_primary: c.id === keep.id }));
    // Persist the deltas (keep network chatter down — only charts whose flag changed).
    for (let i = 0; i < fixed.length; i++) {
      if (fixed[i].is_primary !== charts[i].is_primary) {
        try { await saveChart(wizardUser, fixed[i]); } catch {}
      }
    }
    return fixed;
  };

  // Atomic primary toggle. Passing a chart that is currently primary clears it
  // (no successor is promoted — matches the spec's "手動刪本命盤後不自動補位"
  // behavior applied to the toggle case too).
  const togglePrimary = async (chart) => {
    if (!wizardUser?.email) return;
    const target = !chart.is_primary;
    const updates = userCharts.map(c => {
      if (c.id === chart.id) return { ...c, is_primary: target };
      if (target && c.is_primary) return { ...c, is_primary: false };
      return c;
    });
    setUserCharts(updates);  // optimistic
    for (const c of updates) {
      const before = userCharts.find(x => x.id === c.id);
      if (before && before.is_primary !== c.is_primary) {
        try { await saveChart(wizardUser, c); } catch {}
      }
    }
    loadCharts(wizardUser).then(c => setUserCharts(c));
  };

  // Load readings from server when user changes
  useEffect(() => {
    if (wizardUser?.email) {
      loadReadings(wizardUser).then(readings => setServerReadings(readings));
      loadCharts(wizardUser).then(charts => ensureOnePrimary(charts)).then(charts => setUserCharts(charts));
      // Sync session from server if local is empty or stale
      loadSessionFromServer(wizardUser).then(serverSess => {
        if (!serverSess) return;
        const localSess = loadSessionLocal(wizardUser);
        const serverTs = serverSess._ts ? new Date(serverSess._ts).getTime() : 0;
        const localTs = localSess?._ts ? new Date(localSess._ts).getTime() : 0;
        if (serverTs > localTs) {
          saveSessionLocal(serverSess, wizardUser);
        }
      }).catch(() => {});
    } else {
      setServerReadings(loadReadingsLocal(wizardUser));
    }
  }, [wizardUser]);

  // Save session to localStorage whenever ANY user data changes (per-user, including guest)
  useEffect(() => {
    if (analyzing || hebanAnalyzing) return;
    const sessionData = {
      step, gender, goal, goalPrompt, loveSub,
      birthYear, birthMonth, birthDay, birthHour, birthMinute, birthPlace, birthCity,
      isTwin, twinOrder, twinType,
      finalResult, rawResults,
      // 合盤
      hebanResult, hebanRelation, hebanName, hebanGender,
      hebanYear, hebanMonth, hebanDay, hebanHour, hebanMinute,
      showHeban,
      hebanMode, hebanTargetMonth, hebanTargetDay,
      // 追問
      chatHistory,
      activeReadingId,
    };
    saveSession(sessionData, wizardUser);
  }, [step, gender, goal, goalPrompt, loveSub, birthYear, birthMonth, birthDay, birthHour, birthMinute, birthPlace, birthCity, isTwin, twinOrder, twinType, finalResult, rawResults, hebanResult, hebanRelation, hebanName, hebanGender, hebanYear, hebanMonth, hebanDay, hebanHour, hebanMinute, showHeban, chatHistory, activeReadingId, analyzing, hebanAnalyzing, wizardUser]);

  // Always land on Welcome page on mount; prior readings are reachable via history panel.
  // (previous behavior auto-jumped to the result page when a saved finalResult existed)

  // Reset chat-only mode whenever the user is not on the result screen, so the
  // next time they land on the result page they see the full report by default.
  useEffect(() => {
    if (step !== TOTAL_STEPS + 1) {
      setChatOnlyMode(false);
      setShowChatHistoryPanel(false);
    }
  }, [step]);

  const translateHoroscope = async (horoscope, targetLang) => {
    if (!horoscope || targetLang === 'zh-TW') return horoscope;
    const langName = LANG_AI[targetLang] || targetLang;
    console.log('[Horoscope] translating to', langName);
    try {
      const res = await fetch(`${API_HOROSCOPE}/translate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horoscope, lang: langName }),
      });
      if (!res.ok) { console.warn('[Horoscope] translate failed', res.status); return horoscope; }
      const data = await res.json();
      if (data.ok && data.horoscope) {
        console.log('[Horoscope] translated ok');
        return { ...data.horoscope, _lang: targetLang };
      }
    } catch (e) { console.error('[Horoscope] translate error', e); }
    return horoscope;
  };

  // Fetch daily horoscope on mount or when user/zodiac changes
  const fetchHoroscope = async (zodiac) => {
    setHoroscopeLoading(true);
    try {
      const params = new URLSearchParams();
      if (wizardUser?.email) params.set("user", wizardUser.email);
      if (zodiac) params.set("zodiac", zodiac);
      const res = await fetch(`${API_HOROSCOPE}/today?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.horoscope || data.horoscopes) {
        // Show immediately, translate in background if needed
        setHoroscopeData(data);
        if (currentLang !== 'zh-TW' && data.horoscope) {
          translateHoroscope(data.horoscope, currentLang).then(translated => {
            setHoroscopeData(prev => prev ? { ...prev, horoscope: translated } : null);
          });
        }
      } else {
        setHoroscopeData(null);
      }
    } catch {
      setHoroscopeData(null);
    }
    setHoroscopeLoading(false);
  };

  useEffect(() => {
    if (step === 0) fetchHoroscope(selectedZodiac || null);
  }, [step, wizardUser]);

  const requireAuth = (callback) => {
    if (wizardUser) {
      callback();
    } else {
      pendingActionRef.current = callback;
      setShowAuthModal(true);
      setAuthMode("register");
      setAuthError("");
    }
  };

  const restoreFromSession = (s) => {
    if (!s) return;
    // Intentionally do NOT restore step: login should always land on Welcome page.
    if (s.gender) setGender(s.gender);
    if (s.goal) setGoal(s.goal);
    if (s.goalPrompt) setGoalPrompt(s.goalPrompt);
    if (s.loveSub) setLoveSub(s.loveSub);
    if (s.birthYear) setBirthYear(s.birthYear);
    if (s.birthMonth) setBirthMonth(s.birthMonth);
    if (s.birthDay) setBirthDay(s.birthDay);
    if (s.birthHour !== undefined) setBirthHour(s.birthHour);
    if (s.birthMinute !== undefined) setBirthMinute(s.birthMinute);
    if (s.birthPlace) setBirthPlace(s.birthPlace);
    if (s.finalResult) setFinalResult(s.finalResult);
    if (s.rawResults) setRawResults(s.rawResults);
    // 合盤
    if (s.hebanResult) setHebanResult(s.hebanResult);
    if (s.hebanRelation) setHebanRelation(s.hebanRelation);
    if (s.hebanName) setHebanName(s.hebanName);
    if (s.hebanGender) setHebanGender(s.hebanGender);
    if (s.hebanYear) setHebanYear(s.hebanYear);
    if (s.hebanMonth) setHebanMonth(s.hebanMonth);
    if (s.hebanDay) setHebanDay(s.hebanDay);
    if (s.hebanHour) setHebanHour(s.hebanHour);
    if (s.hebanMinute) setHebanMinute(s.hebanMinute);
    if (s.showHeban) setShowHeban(s.showHeban);
    if (s.hebanMode) setHebanMode(s.hebanMode);
    if (s.hebanTargetMonth) setHebanTargetMonth(s.hebanTargetMonth);
    if (s.hebanTargetDay) setHebanTargetDay(s.hebanTargetDay);
    // 追問
    if (s.chatHistory) setChatHistory(s.chatHistory);
  };

  const handleAuthSubmit = async () => {
    let user;
    if (authMode === "register") {
      if (!authName.trim() || !authEmail.trim() || !authPassword.trim()) {
        setAuthError(t('auth.fillAll'));
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail)) {
        setAuthError(t('auth.invalidEmail'));
        return;
      }
      if (authPassword.length < 6) {
        setAuthError(t('auth.passwordMin'));
        return;
      }
      try {
        const res = await fetch(API_BACKEND.replace("/api/fortune", "/api/fortune-register"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: authEmail.trim(), password: authPassword, name: authName.trim(), visitor_id: getVisitorId(), source: "b2c" }),
        });
        const data = await res.json();
        if (!res.ok) {
          setAuthError(data.error || t('auth.emailExists'));
          setAuthMode("login");
          return;
        }
        if (data.token) saveAuthToken(data.token);
      } catch { setAuthError(t('auth.emailExists')); return; }
      user = { name: authName.trim(), email: authEmail.trim() };
      trackEvent("register", { email: authEmail.trim(), name: authName.trim() });
      migrateGuestSession(user);
    } else {
      if (!authEmail.trim() || !authPassword.trim()) {
        setAuthError(t('auth.fillEmailPw'));
        return;
      }
      // Try API login first
      try {
        const res = await fetch(API_BACKEND.replace("/api/fortune", "/api/fortune-login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: authEmail.trim(), password: authPassword }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.token) saveAuthToken(data.token);
          user = { name: data.name || authEmail.trim(), email: authEmail.trim(), role: data.role };
        } else {
          const data = await res.json().catch(() => ({}));
          setAuthError(data.error || t('auth.wrongPassword'));
          return;
        }
      } catch {
        setAuthError(t('auth.networkError'));
        return;
      }
      // Try server session first, fallback to localStorage
      let existingSession = null;
      try {
        existingSession = await loadSessionFromServer(user);
      } catch {}
      if (!existingSession) existingSession = loadSession(user);
      if (existingSession?.finalResult) {
        restoreFromSession(existingSession);
      }
    }

    setWizardUser(user);
    saveAuth(user);
    setAuthPassword("");
    setShowAuthModal(false);
    setAuthError("");

    if (pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      setTimeout(() => action(), 100);
    }
  };

  const fetchUserStatus = async (email) => {
    try {
      const res = await fetch(`${API_SANDBOX}/payment/status?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setUserFeatures(data.paid_features || []);
        setUserCredits(data.credits || 0);
      }
    } catch {}
  };

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${API_SANDBOX}/payment/plans`);
      if (res.ok) {
        const data = await res.json();
        setPaymentPlans(data.plans || {});
      }
    } catch {}
  };

  const handleCheckout = async (planId) => {
    if (!wizardUser?.email) return;
    setLoadingPayment(true);
    try {
      const res = await fetch(`${API_SANDBOX}/payment/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, email: wizardUser.email, name: wizardUser.name || "User" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.checkout_url) {
          if (data.mock) {
            const mockRes = await fetch(`${API_SANDBOX}/payment/mock-complete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ order_id: data.order_id }),
            });
            if (mockRes.ok) {
              const result = await mockRes.json();
              setUserFeatures(result.unlocked || []);
            }
          } else {
            window.location.href = data.checkout_url;
          }
        }
      }
    } catch {}
    setLoadingPayment(false);
  };

  useEffect(() => {
    if (showAccount && wizardUser?.email) {
      fetchUserStatus(wizardUser.email);
      if (!paymentPlans) fetchPlans();
    }
  }, [showAccount]);

  const translateResult = async (targetLang) => {
    if (!finalResult) return;
    if (translatedResults[targetLang]) {
      setDisplayLang(targetLang);
      return;
    }
    setTranslating(true);
    try {
      const langName = LANG_AI[targetLang] || targetLang;
      const prompt = `請將以下命理分析報告完整翻譯成「${langName}」。保持原始格式（[SECTION] 標記、段落結構），只翻譯內容，不要添加或刪減任何分析內容。\n\n${finalResult}`;
      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: `你是專業翻譯。將命理報告翻譯成${langName}，保持[SECTION]格式標記不變，保持原文的語氣和風格。`, prompt, analysis_type: "general", visitor_id: getVisitorId(), user: wizardUser?.email || null }),
      });
      if (!submitRes.ok) throw new Error("Translation failed");
      const { job_id } = await submitRes.json();
      for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
        if (!pollRes.ok) continue;
        const data = await pollRes.json();
        if (data.status === "done") {
          setTranslatedResults(prev => ({ ...prev, [targetLang]: data.result }));
          setDisplayLang(targetLang);
          break;
        }
      }
    } catch (e) {
      console.error("Translation failed:", e);
    }
    setTranslating(false);
  };

  const displayResult = displayLang && translatedResults[displayLang] ? translatedResults[displayLang] : finalResult;

  const progress = Math.round((step / (TOTAL_STEPS - 1)) * 100);

  // ---- API calls ----
  const autoAnalyze = async (systemName, chartText, systemPrompt, engine = "claude") => {
    try {
      const prompt = engine === "manus" ? chartText
        : `⚠️ 以下排盤資料已確認正確。直接基於此資料分析。\n\n${chartText}\n\n請根據【${systemName}】排盤進行深度分析，特別針對：${goalPrompt}\n\n要深入、專業、具體。`;
      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: systemPrompt, prompt, engine, analysis_type: "general" }),
      });
      if (!submitRes.ok) return null;
      const { job_id } = await submitRes.json();
      for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
          if (!pollRes.ok) continue;
          const data = await pollRes.json();
          if (data.status === "done") return data.result;
        } catch { continue; }
      }
      return null;
    } catch { return null; }
  };

  const startAnalysis = async () => {
    setStep(TOTAL_STEPS);
    setAnalyzing(true);
    setError("");
    setFinalResult("");
    setRawResults([]);
    trackEvent("start_analysis", { gender, goal, loveSub, birth: `${birthYear}/${birthMonth}/${birthDay} ${birthHour}:${birthMinute}`, birthPlace });

    const loadingMsgs = t('loading.msgs', { returnObjects: true }) || [];
    let msgIdx = 0;
    setLoadingMsg(loadingMsgs[0] || "...");
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % loadingMsgs.length;
      setLoadingMsg(loadingMsgs[msgIdx]);
    }, 3000);

    try {
      const y = parseInt(birthYear), m = parseInt(birthMonth), d = parseInt(birthDay);
      const h = parseInt(birthHour) || 0;
      const min = parseInt(birthMinute) || 0;
      const kbEntries = loadKB();

      let cityLat, cityLng, cityTz;
      if (birthCity && birthCity.lat) {
        cityLat = birthCity.lat;
        cityLng = birthCity.lng;
        cityTz = birthCity.timezone;
      } else {
        const cityMatch = findCity(birthPlace);
        cityLat = cityMatch ? cityMatch.lat : 24.9936;
        cityLng = cityMatch ? cityMatch.lng : 121.3130;
        cityTz = "Asia/Taipei";
      }

      const tst = calculateTrueSolarTime(y, m, d, h, min, cityLng, cityTz);
      const tstY = tst.adjustedYear, tstM = tst.adjustedMonth, tstD = tst.adjustedDay;
      const tstH = tst.trueSolarHour, tstMin = tst.trueSolarMinute;

      const ziweiRaw = calculateChart(tstY, tstM, tstD, tstH, tstMin, gender);
      // [LAB] Use compact format to save tokens
      const ziweiChart = formatChartCompact(ziweiRaw);
      const transitOverlay = calculateTransitOverlay(ziweiRaw);
      const baziChart = formatBaziCompact(calculateBazi(tstY, tstM, tstD, tstH, gender, tstMin));
      const astroChart = formatAstroCompact(calculateAstro(y, m, d, h, min, cityLat, cityLng));

      // Twin: calculate sibling charts
      let twinZiweiChart = "", twinBaziChart = "", twinAstroChart = "";
      if (isTwin) {
        const sibGender = twinType === "mixed" ? (gender === "男" ? "女" : "男") : gender;
        twinZiweiChart = formatChartCompact(calculateChart(tstY, tstM, tstD, tstH, tstMin, sibGender));
        twinBaziChart = formatBaziCompact(calculateBazi(tstY, tstM, tstD, tstH, sibGender, tstMin));
        twinAstroChart = formatAstroCompact(calculateAstro(y, m, d, h, min, cityLat, cityLng));
      }

      const tstInfo = formatCorrectionDetails(tst);

      const results = [
        { system: "紫微斗數", text: ziweiChart, result: "" },
        { system: "八字", text: baziChart, result: "" },
        { system: "西洋占星", text: astroChart, result: "" },
        ...(transitOverlay?.summary ? [{ system: "疊宮分析", text: transitOverlay.summary, result: "" }] : []),
      ];
      if (isTwin) {
        results.push(
          { system: "紫微斗數（手足）", text: twinZiweiChart, result: "" },
          { system: "八字（手足）", text: twinBaziChart, result: "" },
          { system: "西洋占星（手足）", text: twinAstroChart, result: "" },
        );
      }
      setRawResults(results);

      const wizardSP = buildWizardPrompt(kbEntries, goal);
      const twinChartBlock = isTwin ? `

===

【紫微斗數排盤 — 手足】
${twinZiweiChart}

===

【八字排盤 — 手足】
${twinBaziChart}

===

【西洋占星排盤 — 手足】
${twinAstroChart}` : "";

      // Twin info block for prompt (always Chinese for AI)
      const twinTypeZh = twinType === "mixed" ? "龍鳳胎" : "同性雙胞胎";
      const twinOrderZh = twinOrder === "first" ? "先出生（兄/姊）" : "後出生（弟/妹）";
      const sibGenderZh = twinType === "mixed" ? (gender === "男" ? "女" : "男") : gender;

      const twinInfoBlock = isTwin ? `
- ⚠️ 雙胞胎：${twinTypeZh}
- 本人出生順序：${twinOrderZh}
- 手足性別：${sibGenderZh}` : "";

      const twinTaskBlock = isTwin ? `

## 雙胞胎分析要求
這位用戶是${twinTypeZh}，${twinOrder === "first" ? "先出生" : "後出生"}。以上提供了本人和手足各自的排盤。
請務必在報告中：
1. 先分析本人的命盤（主要報告）
2. 加一個段落比較雙胞胎之間的差異
3. 套用以下雙胞胎命理理論：
   - 八字：得氣深淺（先出生者得氣較淺、後出生者得氣較深）、陰陽分化規則、日主強弱判斷
   - 紫微：${twinType === "mixed" ? "龍鳳胎因性別不同，大限方向相反，第二大限起命運明顯分歧" : "命遷互換法（後出生者以遷移宮為命宮）"}
   - 占星：上升度數微小差異、推運盤月亮位置逐年累積差異
4. 分開描述「你們的共同基礎」和「你們的差異之處」
5. 不要只說「你們很像」，要具體指出哪裡不同、為什麼不同` : "";

      // Get translated goal and sub for prompt display
      const goalTextZh = t(goal, { lng: 'zh-TW' }) || t(goal);
      const loveSubTextZh = loveSub ? (t(loveSub, { lng: 'zh-TW' }) || t(loveSub)) : "";

      // Anchor "today" into the user prompt so month predictions don't drift between re-runs
      const _today = new Date();
      const _todayStr = `${_today.getFullYear()}/${_today.getMonth()+1}/${_today.getDate()}`;

      const oneCallPrompt = `以下是一位用戶的三套命理排盤資料（內部資料，不可對外揭露來源系統）：

## 分析時間基準
今天是 ${_todayStr}。所有關於「近期」「重點月份」「年運勢」的判斷都必須以此日期為基準，不可任意漂移到其他月份。

【紫微斗數排盤】
${ziweiChart}

===

【八字排盤】
${baziChart}

===

【西洋占星排盤】
${astroChart}${twinChartBlock}
${transitOverlay?.summary || ''}
## 用戶資料
- 性別：${gender}
- 出生：${birthYear}年${birthMonth}月${birthDay}日 ${h}時${min}分
- 出生地：${birthPlace}（經度${cityLng}°, 緯度${cityLat}°）
- 真太陽時：${tst.trueSolarTimeStr}（${tst.shichen}時）${tst.nearBoundary ? `\n- ⚠️ ${tst.nearBoundary.message}` : ""}${tst.isEarlyZi ? "\n- ⚠️ 早子時，日柱用當日" : ""}${twinInfoBlock}
- 關注方向：${goalTextZh}${loveSubTextZh ? `（${loveSubTextZh}）` : ""}

## 任務
請綜合以上三套排盤資料，直接產出一份統一的命理報告。
你需要自己解讀排盤資料、找出格局和重點，然後整合成報告。

## 三系統權重
以紫微斗數為主軸（佔50%），八字為輔證（佔30%），西洋占星為補充（佔20%）。
具體做法：先從紫微斗數的命盤格局、四化飛化、大限流年建立核心結論，再用八字的四柱十神大運來驗證和補充紫微的判斷，最後用占星的行星相位宮位提供額外維度。
三套排盤的結論必須交叉驗證：共鳴點重點強調，矛盾處以紫微為準、八字為輔判。這是我們的核心分析方法。

## 疊宮分析（已由程式預先計算完成）
排盤資料中包含「疊宮分析結果」區塊，裡面有程式精確計算好的：大限四化飛入宮位、流年四化飛入宮位、12個月的流月四化、以及重要疊宮效果（雙祿、雙忌、祿忌沖等）。
你的任務是：直接根據這些已計算好的疊宮結果來撰寫分析，用自然語言表達，不暴露術語。
禁止忽略疊宮結果而給出空泛的「會有好運」結論。每個時間段的判斷都必須對應到疊宮結果中的具體四化和宮位。

⚠️ 嚴格遵守系統規則：不提任何命理系統名稱和專有術語，用自然語言表達所有洞見。
⚠️ 按照指定的輸出格式（天賦特質 → 主題深度解析 → 年運勢 → 建議 → 近期提醒）組織內容。
⚠️ 重點針對用戶關注的「${goalTextZh}${loveSubTextZh ? `（${loveSubTextZh}）` : ""}」方向深入分析。
⚠️ 絕對不可假設或猜測用戶的職業、行業、家庭狀況、生活背景。你只知道用戶提供的出生資料，不知道其他任何事。描述特質和建議時要保持中立通用，例如說「你適合需要統籌協調的領域」而不是「你適合供應鏈管理」。${twinTaskBlock}
⚠️ 你必須用「${LANG_AI[currentLang] || '繁體中文'}」撰寫整份報告。所有標題、內容、建議都必須使用「${LANG_AI[currentLang] || '繁體中文'}」。`;

      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: wizardSP, prompt: oneCallPrompt, visitor_id: getVisitorId(), user: wizardUser?.email || null, user_name: wizardUser?.name || "", notify_email: wizardUser?.email || "", goal, job_type: "analysis", birth_data: { year: birthYear, month: birthMonth, day: birthDay, hour: birthHour, minute: birthMinute, place: birthPlace } }),
      });
      if (!submitRes.ok) throw new Error(t('result.analysisError'));
      const { job_id } = await submitRes.json();

      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
          if (!pollRes.ok) continue;
          const data = await pollRes.json();
          if (data.status === "done") {
            setFinalResult(data.result);
            // [LAB] Extract summary for cheaper follow-ups
            setReportSummary(extractSummary(data.result));
            // Save to reading history
            const newReading = {
              id: job_id,
              date: new Date().toISOString(),
              goal: goal,
              goalPrompt: goalPrompt,
              loveSub: loveSub,
              gender: gender,
              birth: `${birthYear}/${birthMonth}/${birthDay}`,
              birthData: { year: birthYear, month: birthMonth, day: birthDay, hour: birthHour, minute: birthMinute, place: birthPlace, city: birthCity },
              result: data.result,
              rawResults: rawResults,
              monthHighlights: parseMonthHighlights(data.result),
            };
            // Chart + reading persistence split:
            //   * If the birthday matches an existing chart → this reading
            //     goes straight into the user's library under that chart. No
            //     prompt, keeps flow fast for follow-up analyses.
            //   * If it's a new birthday → stash reading + chart data and
            //     pop the save modal. User can discard; audit.db already has
            //     the analysis regardless of their choice.
            setActiveReadingId(job_id);
            setChatHistory([]);
            const bdMatch = wizardUser?.email ? userCharts.find(c => {
              const bd = c.birthData || {};
              return String(bd.year) === String(birthYear)
                && String(bd.month) === String(birthMonth)
                && String(bd.day) === String(birthDay);
            }) : null;
            if (bdMatch) {
              saveReading(wizardUser, newReading);
              setServerReadings(prev => [newReading, ...prev].slice(0, 50));
            } else if (wizardUser?.email && rawResults.length > 0) {
              const defaultName = `${birthYear}/${birthMonth}/${birthDay}`;
              setPendingSave({
                reading: newReading,
                chart: {
                  name: defaultName,
                  is_primary: userCharts.length === 0,  // first chart → auto-primary
                  birthData: { year: birthYear, month: birthMonth, day: birthDay, hour: birthHour, minute: birthMinute, place: birthPlace, city: birthCity },
                  gender: gender,
                  charts: Object.fromEntries(rawResults.filter(r => r.text).map(r => [r.system, r.text])),
                  createdAt: Date.now(),
                },
              });
              setSaveChartName(defaultName);
              setShowSaveChartModal(true);
            } else {
              // Guest user — keep reading visible locally even without a chart
              saveReading(wizardUser, newReading);
              setServerReadings(prev => [newReading, ...prev].slice(0, 50));
            }
            break;
          }
        } catch { continue; }
      }

      setAnalyzing(false);
      setLoadingMsg("");
      setStep(TOTAL_STEPS + 1);
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 100);
      trackEvent("analysis_complete", { goal, loveSub, resultLength: finalResult?.length || 0 });
    } catch (err) {
      setError(t('result.analysisError') + ": " + err.message);
      setAnalyzing(false);
    } finally {
      clearInterval(interval);
    }
  };

  const sendChat = async (question) => {
    if (!question.trim() || chatLoading) return;
    setShowQuickQ(false);
    trackEvent("chat_question", { question: question.slice(0, 200) });
    // Snapshot current chat BEFORE adding user message, then add
    const chatBefore = [...chatHistory];
    setChatHistory(prev => [...prev, { role: "user", text: question }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const kbEntries = loadKB();
      const wizardSP = buildWizardPrompt(kbEntries, goal);
      // [LAB] Only last 3 turns — use snapshot, not stale closure
      const recentChat = chatBefore.slice(-6).map(m => `${m.role === "user" ? "問" : "答"}：${m.text}`).join("\n");

      // 確保疊宮分析是最新的（檢查年份，需要時重算）
      let currentResults = [...rawResults];
      const existingOverlay = currentResults.find(r => r.system === "疊宮分析");
      const currentYear = new Date().getFullYear();
      const overlayYear = existingOverlay?.text?.match(/【(\d{4})年流年】/)?.[1];
      // 追問涉及特定年份？
      const mentionedYear = question.match(/(20\d{2})\s*年/)?.[1];
      const targetYear = mentionedYear ? parseInt(mentionedYear) : currentYear;

      if (!existingOverlay || (overlayYear && parseInt(overlayYear) !== targetYear)) {
        // 重新計算疊宮（用存的 birthData 重排紫微盤）
        if (birthYear && birthMonth && birthDay && birthHour !== undefined) {
          try {
            const tst = calculateTrueSolarTime(
              parseInt(birthYear), parseInt(birthMonth), parseInt(birthDay),
              parseInt(birthHour), parseInt(birthMinute || 0),
              birthCity?.lng || 121.3130, birthCity?.timezone || "Asia/Taipei"
            );
            const ziweiRaw = calculateChart(tst.adjustedYear, tst.adjustedMonth, tst.adjustedDay, tst.trueSolarHour, tst.trueSolarMinute, gender);
            const overlay = calculateTransitOverlay(ziweiRaw, targetYear);
            if (overlay?.summary) {
              currentResults = currentResults.filter(r => r.system !== "疊宮分析");
              currentResults.push({ system: "疊宮分析", text: overlay.summary, result: "" });
              setRawResults(currentResults);
            }
          } catch (e) { console.warn("[TransitOverlay] recalc failed:", e); }
        }
      }

      // Build follow-up prompt with question routing
      const chartBlock = currentResults.filter(r => r.text).map(r => `【${r.system}排盤資料】\n${r.text}`).join("\n\n===\n\n");
      const hebanBlock = hebanResult ? `\n\n===== 合盤分析報告（${hebanName || '對方'}，${t(hebanRelation) || ''}）=====\n${hebanResult}` : "";

      // 問題路由：判斷該看哪些宮位
      const focusRule = getFollowUpFocus(question);
      const focusBlock = focusRule
        ? `\n\n===== 分析指引 =====\n問題類型：${focusRule.focus}\n重點宮位：${focusRule.palaces.join("、")}\n分析方法：${focusRule.guide}\n\n你必須從排盤資料中找到上述宮位的本命主星、四化，然後查疊宮對照表中該宮位在大限和流年的疊宮位置，再查疊宮分析結果中對應的四化飛入情況，據此推論。如果排盤中找不到足夠依據，就明確說「排盤中沒有明確跡象」。`
        : "";

      const hasTimeQ = /月|年|季|時|何時|when|最近|今年|明年|上半|下半|幾月|什麼時候|進財|財運|感情運|健康運|事業運|運勢/i.test(question);
      const transitBlock = hasTimeQ ? `\n\n⚠️ 時間相關問題 — 排盤資料中有「疊宮分析結果」區塊，裡面有程式精確計算好的大限/流年/流月四化和疊宮效果。你必須直接根據這些已計算好的結果回答，不可忽略。每個時間判斷都要對應到具體的四化和宮位。如果疊宮結果中找不到依據，就明確說「排盤中沒有明確的跡象」。` : "";

      const prompt = `${chartBlock ? `===== 原始排盤資料（精確數據，以此為準）=====\n${chartBlock}\n\n` : ""}${finalResult ? `===== 之前的分析摘要 =====\n${finalResult.slice(0, 1500)}\n\n` : ""}${hebanBlock}${focusBlock}${recentChat ? `\n對話紀錄：\n${recentChat}\n\n` : ""}用戶追問：${question}${transitBlock}\n\n直接回答上述問題，聚焦問題本身，不要發散到其他主題。你必須用「${LANG_AI[currentLang] || '繁體中文'}」回覆。`;

      // 追問用 FOLLOWUP_SYSTEM_PROMPT，不用主分析的 [SECTION] 格式
      const followUpSP = FOLLOWUP_SYSTEM_PROMPT + (wizardSP.includes("知識庫") ? wizardSP.slice(wizardSP.indexOf("## 內部知識庫")) : "");

      const isDeep = /大運|流年|逐月|十年|運勢走向|life phase|month.by.month/i.test(question);
      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: followUpSP, prompt, analysis_type: isDeep ? "deep" : "general", visitor_id: getVisitorId(), user: wizardUser?.email || null, user_name: wizardUser?.name || "", goal, job_type: "chat", chart_id: activeReadingId || "" }),
      });
      if (!submitRes.ok) throw new Error(t('result.chatError'));
      const { job_id } = await submitRes.json();
      for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
        if (!pollRes.ok) continue;
        const data = await pollRes.json();
        if (data.status === "done") {
          const fullChat = [...chatBefore, { role: "user", text: question }, { role: "assistant", text: data.result }];
          setChatHistory(fullChat);
          // Save chat to the current reading (update, not create new)
          saveChatToServer(wizardUser, fullChat, activeReadingId);
          // Sync chat to in-memory readings so switching readings stays isolated
          setServerReadings(prev => prev.map(sr => (sr.id || sr.time) === activeReadingId ? { ...sr, chat: fullChat } : sr));
          break;
        }
      }
    } catch (e) {
      setChatHistory(prev => [...prev, { role: "assistant", text: t('result.chatError') + ": " + e.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ---- Heban (compatibility) analysis ----
  const startHeban = async () => {
    setHebanAnalyzing(true);
    setHebanResult("");
    setError("");
    trackEvent("start_heban", { relation: hebanRelation, partnerGender: hebanGender, partnerName: hebanName });

    const hebanLoadingMsgs = t('result.hebanLoadingMsgs', { returnObjects: true }) || [];
    let msgIdx = 0;
    setLoadingMsg(hebanLoadingMsgs[0] || "...");
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % hebanLoadingMsgs.length;
      setLoadingMsg(hebanLoadingMsgs[msgIdx]);
    }, 3000);

    try {
      const y1 = parseInt(birthYear), m1 = parseInt(birthMonth), d1 = parseInt(birthDay);
      const h1 = parseInt(birthHour) || 0, min1 = parseInt(birthMinute) || 0;
      const y2 = parseInt(hebanYear), m2 = parseInt(hebanMonth), d2 = parseInt(hebanDay);
      const h2 = parseInt(hebanHour) || 12, min2 = parseInt(hebanMinute) || 0;
      const hasPartnerTime = hebanHour !== "";
      const kbEntries = filterKBForHeban(loadKB(), hebanRelation, hebanFocus);

      const myZiwei = rawResults.find(r => r.system === "紫微斗數");
      const myCharts = myZiwei ? `【紫微斗數】\n${myZiwei.text}` : "";

      const partnerGender = hebanGender || (gender === "男" ? "女" : "男");
      let partnerCharts = "";
      let partnerChartObj = null;

      if (hasPartnerTime) {
        const pChart = calculateChart(y2, m2, d2, h2, 0, partnerGender);
        partnerChartObj = pChart;
        partnerCharts = `【紫微斗數】\n${formatChartCompact(pChart)}`;
      } else {
        const tianGanChart = formatChartByTianGan(y2, m2, d2, partnerGender);
        partnerCharts = tianGanChart;
        // No precise hour → partner palace layout unreliable. Still compute a chart
        // at noon so we can surface natal 四化 交叉, but skip L2/L3/L4 cross-sihua
        // since those depend on accurate palace placement.
        partnerChartObj = calculateChart(y2, m2, d2, 12, 0, partnerGender);
      }

      // Compute user chart fresh for cross-sihua. Uses raw birth time (not TST
      // corrected) to match the partner side — relationship structure is far less
      // time-sensitive than main-analysis 疊宮, so this is acceptable.
      const myChartObj = calculateChart(
        parseInt(birthYear), parseInt(birthMonth), parseInt(birthDay),
        parseInt(birthHour) || 12, parseInt(birthMinute) || 0, gender,
      );

      let crossSihuaBlock = "";
      let modeDirective = "";
      try {
        const baseLevels = hasPartnerTime
          ? ["natal", "palace", "decadal", "yearly"]
          : ["natal"];
        const me = wizardUser?.name || "本人";
        const them = hebanName || "對方";
        const crossOpts = { levels: baseLevels, nameA: me, nameB: them };
        const currentYear = new Date().getFullYear();

        if (hebanMode === "monthly" && hasPartnerTime) {
          const m = parseInt(hebanTargetMonth);
          if (m >= 1 && m <= 12) {
            const aSt = getMonthlySihuaStars(myChartObj, m);
            const bSt = getMonthlySihuaStars(partnerChartObj, m);
            if (aSt && bSt) {
              crossOpts.levels = [...baseLevels, "monthly"];
              crossOpts.monthlySihua = { a: aSt, b: bSt };
              crossOpts.monthlyLabel = `${currentYear}年${m}月`;
              modeDirective = `\n本次分析聚焦於 ${currentYear} 年 ${m} 月的關係動態, 請以該月流月飛化為重點時間軸 (其他層為背景)。`;
            }
          }
        } else if (hebanMode === "timed" && hasPartnerTime) {
          const m = parseInt(hebanTargetMonth);
          const d = parseInt(hebanTargetDay);
          if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            const aSt = getDailySihuaStars(myChartObj, currentYear, m, d);
            const bSt = getDailySihuaStars(partnerChartObj, currentYear, m, d);
            if (aSt && bSt) {
              crossOpts.levels = [...baseLevels, "daily"];
              crossOpts.dailySihua = { a: aSt, b: bSt };
              crossOpts.dailyLabel = `${currentYear}/${m}/${d}`;
              modeDirective = `\n本次為擇吉合盤, 鎖定 ${currentYear}/${m}/${d} 這天. 請以流日飛化為主判據 (回答「這天見面/決定/約會」等具體情境適不適合, 有哪些加持或阻力)。`;
            }
          }
        }

        const cross = calculateCrossSihua(myChartObj, partnerChartObj, crossOpts);
        crossSihuaBlock = `\n\n${cross.summary}\n`;
      } catch (e) {
        console.warn("[heban] crosssihua failed:", e);
        trackEvent("heban_crosssihua_failed", { error: e.message, mode: hebanMode });
      }

      // Resolve relation display text (always Chinese for AI prompt)
      const hebanRelationZh = t(hebanRelation, { lng: 'zh-TW' }) || t(hebanRelation);

      const hebanPrompt = `以下是兩個人的命理資料（內部資料，不可對外揭露來源系統）：

## 本人
- 性別：${gender}
- 出生：${birthYear}年${birthMonth}月${birthDay}日 ${h1}時${min1}分
- 出生地：${birthPlace}

${myCharts}

## 對方（${hebanName || "對方"}）
- 關係：${hebanRelationZh}
- 性別：${partnerGender}
- 出生：${hebanYear}年${hebanMonth}月${hebanDay}日${hasPartnerTime ? ` ${h2}時${min2}分` : "（未知出生時間）"}
${hasPartnerTime ? "（有完整出生時間，可做完整飛化交叉分析）" : "（無出生時間，以生年天干四化和主星分佈推算宮位影響，命宮位置不確定）"}

${partnerCharts}
${crossSihuaBlock}
## 任務
請根據兩人的紫微斗數命盤分析這兩人作為「${hebanRelationZh}」的關係。
${crossSihuaBlock ? "上方「交叉飛化分析」是程式精算的結果, 直接引用其中的四化飛入關係做推論, 不要自己重推飛化; 你的工作是把這些飛入點轉為自然語言的關係描述。" : ""}${modeDirective}
${hasPartnerTime
  ? "重點分析：雙方命盤的宮位飛化互動、四化交叉影響、主星搭配的互補或衝突。"
  : "對方無出生時間，請以對方的生年天干四化為核心，分析其四化星落入哪些宮位的主星、這些能量如何與本人的命盤產生互動。重點看生年四化的祿忌落宮與本人的對應宮位關係。"}
${hebanRelation === "relations.spouse" ? `
## 夫妻合盤重點
除了一般互動分析外，請特別深入以下面向：
- 婚姻長期經營：磨合模式、溝通盲點、容易起衝突的觸發點
- 財務共管：兩人的理財觀念是否互補或衝突、家庭財務適合誰主導
- 子女緣：兩人的子女宮交叉分析、適合的教養分工
- 家庭角色：各自在家庭中自然扮演的角色、責任分配建議` : ""}
${hebanRelation === "relations.family" ? `
## 家人合盤重點
請特別分析：
- 親子/手足的天然互動模式與代際差異
- 溝通上容易產生的誤解和化解方式
- 彼此在家庭中的角色定位和期望落差` : ""}
${hebanRelation === "relations.twin" ? `
## 雙胞胎合盤特殊分析
這是雙胞胎手足的合盤，請套用以下理論：
1. 八字：兩人四柱相同或極相似。先出生者得氣較淺、後出生者得氣較深（《三命通會》得氣深淺理論）
2. 紫微：${gender !== partnerGender ? "龍鳳胎 — 性別不同導致大限方向相反（陽男陰女順行、陰男陽女逆行），從第二大限起所經歷的星曜四化完全不同" : "同性雙胞胎 — 套用命遷互換法：後出生者以遷移宮為命宮，十二宮重新排列"}
3. 八字陰陽分化：${gender === "男" ? "雙胞胎兄弟" : "雙胞胎姊妹"}生於陽日陽時則${gender === "男" ? "兄比弟強" : "妹比姊強"}，陰日陰時則${gender === "男" ? "弟比兄強" : "姊比妹強"}
4. 重點分析：兩人的共同天賦基礎、性格差異原因、各自的發展方向、互補之處
5. 不要只說「你們很像」，要具體指出差異和各自的優勢` : ""}

⚠️ 嚴格遵守規則：不提任何命理系統名稱和專有術語。
⚠️ 用自然語言描述兩人的互動與緣分。
⚠️ 按照指定輸出格式。
⚠️ 你必須用「${LANG_AI[currentLang] || '繁體中文'}」撰寫整份報告。`;

      let sp = HEBAN_SYSTEM_PROMPT_ZH;
      if (kbEntries.length > 0) {
        sp += "\n\n## 內部知識庫（推理用，不可對外提及）\n";
        kbEntries.forEach(e => { sp += `- ${e.title}: ${e.content.slice(0, 200)}\n`; });
      }

      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: sp, prompt: hebanPrompt, visitor_id: getVisitorId(), user: wizardUser?.email || null, user_name: wizardUser?.name || "", goal: "goal.love", job_type: "heban", birth_data: { year: birthYear, month: birthMonth, day: birthDay, hebanYear, hebanMonth, hebanDay, hebanRelation } }),
      });
      if (!submitRes.ok) throw new Error(t('result.hebanError'));
      const { job_id } = await submitRes.json();

      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
          if (!pollRes.ok) continue;
          const data = await pollRes.json();
          if (data.status === "done") {
            setHebanResult(data.result);
            // Save heban result to server
            const hebanSave = {
              date: new Date().toISOString(),
              goal: "heban",
              goalPrompt: `合盤 — ${hebanName || t(hebanRelation)} (${hebanYear}/${hebanMonth}/${hebanDay})`,
              gender: gender,
              birth: `${birthYear}/${birthMonth}/${birthDay}`,
              birthData: { year: birthYear, month: birthMonth, day: birthDay, hour: birthHour, minute: birthMinute, place: birthPlace, city: birthCity },
              result: data.result,
              rawResults: rawResults,
              monthHighlights: [],
            };
            saveReading(wizardUser, hebanSave);
            setServerReadings(prev => [hebanSave, ...prev].slice(0, 50));
            break;
          }
        } catch { continue; }
      }
    } catch (err) {
      setError(t('result.hebanError') + ": " + err.message);
    } finally {
      setHebanAnalyzing(false);
      setLoadingMsg("");
      clearInterval(interval);
    }
  };

  // ---- RESULT RENDERER ----
  const CollapsibleSection = ({ title, body, summary, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
      <div className="wizard-section">
        {title && (
          <div className="wizard-section-header" onClick={() => setOpen(!open)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="wizard-section-title">{title}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
          </div>
        )}
        {open && (
          <>
            {body && <div className="wizard-section-body">{body}</div>}
            {summary && <div className="wizard-section-summary">{summary}</div>}
          </>
        )}
      </div>
    );
  };

  const renderFormattedResult = (text) => {
    if (!text) return null;

    let cleaned = text
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^\|.*\|$/gm, '')
      .replace(/^[-|:]+$/gm, '')
      .replace(/^>\s*/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{2702}-\u{27B0}\u{200D}\u{20E3}\u{FE0F}\u{E0020}-\u{E007F}✦✧★☆♠♣♥♦⚡❌✅✓✔❤️‍♀️♂️☀️☁️⭐️❄️☯️⚠️]/gu, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    cleaned = cleaned
      .replace(/【\s*SECTION\s*】/gi, '[SECTION]')
      .replace(/\[\s*SECTION\s*\]\s*[:：\-—]/gi, '[SECTION]')
      .replace(/\[\s*SECTION\s*\]/gi, '[SECTION]')

    const parts = cleaned.split(/\[SECTION\]\s*/);
    const sections = [];

    const cleanSectionTags = (s) => s
      .replace(/\[?\s*SECTION\s*\]?\s*[:：\-—]?\s*/gi, '')
      .replace(/【\s*SECTION\s*】\s*/gi, '')
      .trim();

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const lines = trimmed.split('\n');
      const title = cleanSectionTags(lines[0].trim());
      const body = cleanSectionTags(lines.slice(1).join('\n').trim());

      if (body) {
        sections.push({ title, body });
      } else if (sections.length === 0) {
        sections.push({ title: "", body: title });
      } else {
        sections.push({ title, body: "" });
      }
    }

    if (sections.length <= 1 && cleaned.length > 200) {
      const blocks = cleaned.split(/\n\n+/);
      if (blocks.length >= 3) {
        return blocks.map((block, i) => (
          <div key={i} className="wizard-section">
            <div className="wizard-section-body">{block.trim()}</div>
          </div>
        ));
      }
    }

    if (sections.length === 0) {
      return <div className="wizard-section"><div className="wizard-section-body">{cleaned}</div></div>;
    }

    return sections.map((sec, i) => {
      let mainBody = sec.body || "";
      let summary = "";
      const explicitMatch = mainBody.match(/[【\[](?:總結|小結|結論|重點)[】\]]\s*[:：]?\s*([\s\S]*?)$/);
      if (explicitMatch) {
        summary = explicitMatch[1].trim();
        mainBody = mainBody.slice(0, explicitMatch.index).trim();
      } else if (mainBody.length > 100) {
        const lines = mainBody.trim().split('\n').filter(l => l.trim());
        if (lines.length >= 3) {
          const lastLine = lines[lines.length - 1].trim();
          if (lastLine.length >= 10 && lastLine.length <= 80 && !lastLine.includes('？')) {
            summary = lastLine;
            mainBody = lines.slice(0, -1).join('\n').trim();
          }
        }
      }
      return (
        <CollapsibleSection key={i} title={sec.title} body={mainBody} summary={summary} defaultOpen={i < 2} />
      );
    });
  };

  // ---- RENDER STEPS ----

  const renderAccountPanel = () => {
    const FEATURE_NAMES = { deep: t('account.featureDeep'), heban: t('account.featureHeban') };
    const PLAN_ICONS = { deep_analysis: "深", heban: "合", bundle: "全" };

    return (
      <div className="wizard-account-panel">
        <div className="wizard-account-header">
          <button className="wizard-back" onClick={() => setShowAccount(false)}>‹</button>
          <div className="wizard-account-title">{t('account.title')}</div>
        </div>

        {paymentMsg && (
          <div style={{
            padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14, fontWeight: 500,
            background: paymentMsg.type === "success" ? "#e8f5e9" : paymentMsg.type === "fail" ? "#ffebee" : "#fff3e0",
            color: paymentMsg.type === "success" ? "#2e7d32" : paymentMsg.type === "fail" ? "#c62828" : "#e65100",
            border: `1px solid ${paymentMsg.type === "success" ? "#a5d6a7" : paymentMsg.type === "fail" ? "#ef9a9a" : "#ffcc80"}`,
          }}>
            {paymentMsg.type === "success"
              ? (currentLang === 'en' ? "Payment successful! Your features have been unlocked." : currentLang === 'ja' ? "お支払い完了！機能がアンロックされました。" : "付款成功！功能已解鎖。")
              : paymentMsg.type === "fail"
              ? (currentLang === 'en' ? "Payment failed. Please try again." : currentLang === 'ja' ? "お支払いに失敗しました。再試行してください。" : "付款失敗，請重試。")
              : (currentLang === 'en' ? "Payment was cancelled." : currentLang === 'ja' ? "お支払いがキャンセルされました。" : "付款已取消。")}
          </div>
        )}

        <div className="wizard-account-info">
          <div className="wizard-account-avatar">{wizardUser?.name?.[0] || "U"}</div>
          <div className="wizard-account-detail">
            <div className="wizard-account-name">{wizardUser?.name}</div>
            <div className="wizard-account-email">{wizardUser?.email}</div>
          </div>
        </div>

        <div className="wizard-account-section">
          <div className="wizard-account-section-title">{t('account.unlockedFeatures')}</div>
          {userFeatures.length > 0 ? (
            <div className="wizard-account-features">
              {userFeatures.map(f => (
                <div key={f} className="wizard-account-feature-badge">{FEATURE_NAMES[f] || f}</div>
              ))}
            </div>
          ) : (
            <div className="wizard-account-empty">{t('account.noFeatures')}</div>
          )}
        </div>

        <div className="wizard-account-section">
          <div className="wizard-account-section-title">{t('account.plans')}</div>
          {paymentPlans ? (
            <div className="wizard-account-plans">
              {Object.entries(paymentPlans).map(([id, plan]) => {
                const owned = plan.feature === "all"
                  ? userFeatures.includes("deep") && userFeatures.includes("heban")
                  : userFeatures.includes(plan.feature);
                return (
                  <div key={id} className={`wizard-account-plan ${owned ? "owned" : ""}`}>
                    <div className="wizard-account-plan-icon">{PLAN_ICONS[id] || "+"}</div>
                    <div className="wizard-account-plan-info">
                      <div className="wizard-account-plan-name">{plan.name}</div>
                      <div className="wizard-account-plan-price">NT$ {plan.price}</div>
                    </div>
                    {owned ? (
                      <div className="wizard-account-plan-owned">{t('account.unlocked')}</div>
                    ) : (
                      <button className="wizard-account-plan-btn" disabled={loadingPayment}
                        onClick={() => handleCheckout(id)}>
                        {loadingPayment ? t('account.processing') : t('account.buy')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="wizard-account-empty">{t('account.loadingPlans')}</div>
          )}
        </div>

        <button className="wizard-cta-secondary" style={{ marginTop: 24 }} onClick={() => {
          setWizardUser(null);
          localStorage.removeItem(AUTH_KEY);
          clearAuthToken();
          setShowAccount(false);
          setStep(0); setGender(""); setGoal(""); setGoalPrompt("");
          setBirthYear(""); setBirthMonth(""); setBirthDay(""); setBirthHour(""); setBirthMinute("0");
          setBirthPlace(""); setFinalResult(""); setRawResults([]); setHebanResult("");
          setChatHistory([]); setShowHeban(false);
        }}>
          {t('welcome.logout')}
        </button>
      </div>
    );
  };

  const renderWelcome = () => (
    <div className="wizard-welcome">
      <div className="wizard-lang-switcher">
        {Object.entries(LANG_NAMES).map(([lng, label]) => (
          <button key={lng} className={`wizard-lang-btn ${currentLang === lng ? 'active' : ''}`}
            onClick={() => changeLang(lng)}>{label}</button>
        ))}
      </div>
      <div className="wizard-welcome-icon wizard-diamond"></div>
      <h1>{t('app.title')}</h1>
      <p className="tagline">{t('app.tagline')}</p>

      {wizardUser ? (
        <>
          <div className="wizard-user-greeting">
            {t('welcome.greeting', { name: wizardUser.name })}
            <button className="wizard-account-link" onClick={() => setShowAccount(true)}>{t('welcome.myAccount')}</button>
            <button className="wizard-logout-link" onClick={() => {
              if (wizardUser?.email) {
                fetch(`${API_BASE}/api/fortune-session?user=${encodeURIComponent(wizardUser.email)}`, { method: "DELETE", headers: authHeaders() }).catch(() => {});
              }
              setWizardUser(null);
              localStorage.removeItem(AUTH_KEY);
              clearAuthToken();
              setStep(0); setGender(""); setGoal(""); setGoalPrompt("");
              setBirthYear(""); setBirthMonth(""); setBirthDay(""); setBirthHour(""); setBirthMinute("0");
              setBirthPlace(""); setIsTwin(false); setTwinOrder(""); setTwinType("");
              setFinalResult(""); setRawResults([]); setHebanResult("");
              setChatHistory([]); setShowHeban(false);
            }}>{t('welcome.logout')}</button>
          </div>
          <div className="wizard-question">{t('welcome.iAm')}</div>
          <div className="wizard-gender-cards">
            <div className={`wizard-gender-card ${gender === "男" ? "selected" : ""}`} onClick={() => { setGender("男"); trackEvent("select_gender", { gender: "男" }); setTimeout(() => setStep(1), 300); }}>
              <div className="wizard-gender-icon">M</div>
              <div className="wizard-gender-label"><span>{t('welcome.male')}</span><span>›</span></div>
            </div>
            <div className={`wizard-gender-card ${gender === "女" ? "selected" : ""}`} onClick={() => { setGender("女"); trackEvent("select_gender", { gender: "女" }); setTimeout(() => setStep(1), 300); }}>
              <div className="wizard-gender-icon">F</div>
              <div className="wizard-gender-label"><span>{t('welcome.female')}</span><span>›</span></div>
            </div>
          </div>

          {/* Daily Horoscope */}
          <div className="wizard-horoscope-section" style={{ marginTop: 24, maxWidth: 480, width: '100%' }}>
            <div className="wizard-horoscope-header">
              <span className="wizard-horoscope-icon">&#9788;</span>
              <div className="wizard-horoscope-title">{t('horoscope.title')}</div>
            </div>
            {!wizardUser && !selectedZodiac && (
              <div className="wizard-horoscope-zodiac-grid">
                {ZODIAC_ZH.map((z, i) => (
                  <button key={z} className="wizard-horoscope-zodiac-btn"
                    onClick={() => { setSelectedZodiac(z); fetchHoroscope(z); }}>
                    {t(`horoscope.zodiacNames.${i}`)}
                  </button>
                ))}
              </div>
            )}
            {horoscopeLoading && <div className="wizard-horoscope-loading">...</div>}
            {!horoscopeLoading && horoscopeData?.horoscope && (() => {
              const h = horoscopeData.horoscope;
              return (
                <div className="wizard-horoscope-card" onClick={() => setShowHoroscopeDetail(!showHoroscopeDetail)}>
                  {horoscopeData.date && <div className="wizard-horoscope-date">{horoscopeData.date}</div>}
                  {horoscopeData.zodiac && <div className="wizard-horoscope-zodiac-label">{horoscopeData.zodiac}</div>}
                  <div className="wizard-horoscope-stars">
                    {'★'.repeat(h.overall_stars || 0)}{'☆'.repeat(5 - (h.overall_stars || 0))}
                  </div>
                  <div className="wizard-horoscope-summary">{h.summary}</div>
                  {showHoroscopeDetail && (
                    <div className="wizard-horoscope-details">
                      {[['love', h.love], ['career', h.career], ['wealth', h.wealth], ['health', h.health]].map(([key, val]) => val && (
                        <div key={key} className="wizard-horoscope-detail-row">
                          <span className="wizard-horoscope-detail-label">{t(`horoscope.${key}`)}</span>
                          <span className="wizard-horoscope-detail-stars">{'★'.repeat(val.stars || 0)}{'☆'.repeat(5 - (val.stars || 0))}</span>
                          <span className="wizard-horoscope-detail-text">{val.text}</span>
                        </div>
                      ))}
                      {h.lucky_color && <div className="wizard-horoscope-lucky"><b>{t('horoscope.luckyColor')}:</b> {h.lucky_color}</div>}
                      {h.lucky_number && <div className="wizard-horoscope-lucky"><b>{t('horoscope.luckyNumber')}:</b> {h.lucky_number}</div>}
                      {h.advice && <div className="wizard-horoscope-advice"><b>{t('horoscope.advice')}:</b> {h.advice}</div>}
                    </div>
                  )}
                  <div className="wizard-horoscope-powered">{t('horoscope.poweredBy')}</div>
                </div>
              );
            })()}
            {!horoscopeLoading && !horoscopeData?.horoscope && selectedZodiac && (
              <div className="wizard-horoscope-empty">{t('horoscope.notReady')}</div>
            )}
            {!wizardUser && selectedZodiac && (
              <button className="wizard-horoscope-zodiac-back" onClick={() => { setSelectedZodiac(""); setHoroscopeData(null); }}>
                {t('goal.back')}
              </button>
            )}
            {/* #8 — Decision Advisor CTA under the horoscope block. If the
                user has a primary chart, auto-use it; otherwise fall back to
                guest mode so visitors can still try the feature. */}
            <button
              className="wizard-cta"
              style={{ marginTop: 12, background: 'linear-gradient(135deg, rgba(160,140,255,0.9), rgba(200,140,255,0.9))' }}
              onClick={() => {
                const primary = userCharts.find(c => c.is_primary) || userCharts[0] || null;
                openDecision(primary, "home");
              }}
            >
              🎯 {t('decision.cta', { defaultValue: '決策建議' })}
            </button>
          </div>

          {/* Charts Library (命盤庫) — grouped with readings */}
          {wizardUser && (() => {
            const { groups, unmatched } = groupReadingsByChart();
            // Deduplicate charts by birthData (keep first match, merge names)
            const seen = new Map();
            const dedupedCharts = [];
            for (const chart of userCharts) {
              const key = `${chart.birthData?.year}-${chart.birthData?.month}-${chart.birthData?.day}`;
              if (seen.has(key)) continue;
              seen.set(key, chart.id);
              dedupedCharts.push(chart);
            }
            return (
            <div className="wizard-charts-section" style={{ marginTop: 24, maxWidth: 480, width: '100%' }}>
              <div className="wizard-heban-promo-header" style={{ marginBottom: 12 }}>
                <span className="wizard-heban-promo-icon wizard-diamond"></span>
                <div className="wizard-heban-promo-title">{t('charts.title')}</div>
              </div>

              {dedupedCharts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {dedupedCharts.map(chart => {
                    const isExpanded = expandedChartId === chart.id;
                    const chartReadings = groups[chart.id] || [];
                    // Also collect readings from duplicate charts with same birthData
                    for (const c2 of userCharts) {
                      if (c2.id !== chart.id && birthMatch(c2.birthData, chart.birthData) && groups[c2.id]) {
                        chartReadings.push(...groups[c2.id]);
                      }
                    }
                    // Sort by date desc
                    chartReadings.sort((a, b) => new Date(b.time || b.date) - new Date(a.time || a.date));
                    const hasChartData = chart.charts && Object.keys(chart.charts).length > 0;

                    return (
                      <div key={chart.id} className="wizard-dashboard-card" style={{ position: 'relative' }}>
                        {/* Chart header — click to expand/collapse */}
                        <div style={{ cursor: 'pointer' }} onClick={() => setExpandedChartId(isExpanded ? null : chart.id)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                              {isExpanded ? '▾' : '▸'} {chart.name} {chart.is_primary ? '⭐' : ''}
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                              {chartReadings.length > 0 ? `${chartReadings.length} ${t('charts.analyses', { defaultValue: '筆分析' })}` : ''}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                            {chart.birthData ? `${chart.birthData.year}/${chart.birthData.month}/${chart.birthData.day} ${String(chart.birthData.hour || 0).padStart(2,'0')}:${String(chart.birthData.minute || 0).padStart(2,'0')}` : ''}
                            {chart.gender ? ` · ${chart.gender === '男' ? t('welcome.male') : t('welcome.female')}` : ''}
                            {chart.birthData?.city?.nameZh ? ` · ${chart.birthData.city.nameZh}` : chart.birthData?.place ? ` · ${chart.birthData.place}` : ''}
                          </div>
                        </div>

                        {/* Expanded: readings list + actions */}
                        {isExpanded && (
                          <div style={{ marginTop: 12 }}>
                            {/* Quick actions: new analysis + ask a question */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: chartReadings.length > 0 ? 10 : 0 }}>
                              <button
                                className="wizard-cta-secondary"
                                style={{ flex: 1, fontSize: 13, padding: '8px 0' }}
                                onClick={() => {
                                  if (chart.birthData) {
                                    setBirthYear(chart.birthData.year || "");
                                    setBirthMonth(chart.birthData.month || "");
                                    setBirthDay(chart.birthData.day || "");
                                    setBirthHour(chart.birthData.hour || "");
                                    setBirthMinute(chart.birthData.minute || "0");
                                    if (chart.birthData.place) setBirthPlace(chart.birthData.place);
                                    if (chart.birthData.city) setBirthCity(chart.birthData.city);
                                  }
                                  if (chart.gender) setGender(chart.gender);
                                  setChatHistory([]); setActiveReadingId(null); setFinalResult(""); setRawResults([]); setReportSummary("");
                                  setStep(1);
                                }}
                              >
                                + {t('charts.newAnalysis', { defaultValue: '新分析' })}
                              </button>
                              <button
                                className="wizard-cta-secondary"
                                style={{ flex: 1, fontSize: 13, padding: '8px 0' }}
                                onClick={() => startChatOnChart(chart)}
                              >
                                💬 {t('charts.askQuestion', { defaultValue: '問事' })}
                              </button>
                              <button
                                className="wizard-cta-secondary"
                                style={{ flex: 1, fontSize: 13, padding: '8px 0' }}
                                onClick={() => openDecision(chart, "library")}
                              >
                                🎯 {t('decision.cta', { defaultValue: '決策建議' })}
                              </button>
                            </div>

                            {/* Readings for this chart */}
                            {chartReadings.map((r, i) => (
                              <div
                                key={r.id || r.time || i}
                                style={{
                                  padding: '8px 12px', marginBottom: 4, borderRadius: 8,
                                  background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
                                  border: '1px solid rgba(255,255,255,0.06)',
                                }}
                                onClick={() => openHistoryCard(r)}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                                    {(() => {
                                      let k = (r.goal || r.goalPrompt || '').replace(/\s*\(chat\)\s*/g, '').trim();
                                      if (k === 'heban') return t('account.featureHeban');
                                      if (k === 'decision') {
                                        const q = r.goalPrompt || '';
                                        const short = q.length > 24 ? q.slice(0, 24) + '…' : q;
                                        return `🎯 ${t('decision.cta', { defaultValue: '決策建議' })}${short ? '：' + short : ''}`;
                                      }
                                      if (k.startsWith('goal.') && k.endsWith('Prompt')) k = k.slice(0, -'Prompt'.length);
                                      if (k.startsWith('goal.')) return t(k);
                                      if (k.startsWith('合盤')) return k;
                                      return k || t('history.analysis');
                                    })()}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {r.chat?.length > 0 && (
                                      <span style={{ fontSize: 11, color: 'rgba(160,140,255,0.7)' }}>
                                        {r.chat.length / 2 | 0} Q&A
                                      </span>
                                    )}
                                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                                      {new Date(r.date || r.time).toLocaleDateString()}
                                    </span>
                                    <button
                                      style={{ background: 'none', border: 'none', color: 'rgba(255,100,100,0.5)', fontSize: 14, cursor: 'pointer', padding: '2px 4px' }}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!confirm(t('charts.confirmDeleteReading'))) return;
                                        const ok = await deleteReading(wizardUser, r.time || r.date);
                                        if (ok) setServerReadings(prev => prev.filter(s => (s.time || s.date) !== (r.time || r.date)));
                                      }}
                                    >✕</button>
                                  </div>
                                </div>
                              </div>
                            ))}

                            {/* Chart actions */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                              <button
                                style={{ background: 'none', border: `1px solid ${chart.is_primary ? 'rgba(255,215,100,0.6)' : 'rgba(160,140,255,0.3)'}`, color: chart.is_primary ? 'rgba(255,215,100,0.95)' : 'rgba(160,140,255,0.8)', fontSize: 11, cursor: 'pointer', padding: '3px 10px', borderRadius: 6 }}
                                onClick={(e) => { e.stopPropagation(); togglePrimary(chart); }}
                              >{chart.is_primary
                                ? t('charts.unsetPrimary', { defaultValue: '⭐ 取消本命盤' })
                                : t('charts.setAsPrimary')}</button>
                              <button
                                style={{ background: 'none', border: '1px solid rgba(255,100,100,0.3)', color: 'rgba(255,100,100,0.6)', fontSize: 11, cursor: 'pointer', padding: '3px 10px', borderRadius: 6 }}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm(t('charts.confirmDelete', { name: chart.name }))) return;
                                  const ok = await deleteChart(wizardUser, chart.id);
                                  if (ok) setUserCharts(prev => prev.filter(c => c.id !== chart.id));
                                }}
                              >{t('charts.delete')}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Unmatched readings (no chart) */}
              {unmatched.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                    {t('charts.unmatched', { defaultValue: '未歸類紀錄', count: unmatched.length })}
                  </div>
                  {unmatched.map((r, i) => (
                    <div
                      key={r.id || r.time || i}
                      style={{
                        padding: '8px 12px', marginBottom: 4, borderRadius: 8,
                        background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openHistoryCard(r)}>
                          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                            {(() => {
                              let k = (r.goal || r.goalPrompt || '').replace(/\s*\(chat\)\s*/g, '').trim();
                              if (k === 'heban') return t('account.featureHeban');
                              if (k === 'decision') {
                                const q = r.goalPrompt || '';
                                const short = q.length > 24 ? q.slice(0, 24) + '…' : q;
                                return `🎯 ${t('decision.cta', { defaultValue: '決策建議' })}${short ? '：' + short : ''}`;
                              }
                              if (k.startsWith('goal.') && k.endsWith('Prompt')) k = k.slice(0, -'Prompt'.length);
                              if (k.startsWith('goal.')) return t(k);
                              return k || t('history.analysis');
                            })()}
                            {r.birthData?.year ? ` — ${r.birthData.year}/${r.birthData.month}/${r.birthData.day}` : ''}
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                            {new Date(r.date || r.time).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          style={{ background: 'none', border: 'none', color: 'rgba(255,100,100,0.5)', fontSize: 14, cursor: 'pointer', padding: '2px 4px' }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(t('charts.confirmDeleteReading'))) return;
                            const ok = await deleteReading(wizardUser, r.time || r.date);
                            if (ok) setServerReadings(prev => prev.filter(s => (s.time || s.date) !== (r.time || r.date)));
                          }}
                        >✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new chart button */}
              <button className="wizard-cta-secondary" style={{ width: '100%', marginTop: 12 }} onClick={() => setShowAddChart(true)}>
                + {t('charts.addNew')}
              </button>
            </div>
            );
          })()}

          {/* Family Chart — show existing family or create new */}
          {(() => {
            const familySaves = serverReadings.filter(r => r.goal === "family" && r.familyData?.members?.length > 0);
            const localFamily = (() => { try { const d = localStorage.getItem("fortune-family-data"); return d ? JSON.parse(d) : null; } catch { return null; } })();
            const hasFamilyData = familySaves.length > 0 || localFamily?.members?.length > 0;

            if (hasFamilyData) {
              // Group by familyName
              const families = {};
              for (const s of familySaves) {
                const name = s.familyData?.familyName || s.goalPrompt?.replace(/^家族命盤 — /, '') || t('family.chartTitle');
                if (!families[name]) families[name] = [];
                families[name].push(s);
              }
              // Also add local if not in server
              if (localFamily?.familyName && !families[localFamily.familyName]) {
                families[localFamily.familyName] = [{ familyData: localFamily, finalResult: localFamily.result, time: new Date().toISOString() }];
              }

              return (
                <div className="wizard-family-section" style={{ marginTop: 24, maxWidth: 480, width: '100%' }}>
                  <div className="wizard-heban-promo-header" style={{ marginBottom: 12 }}>
                    <span className="wizard-heban-promo-icon wizard-diamond"></span>
                    <div className="wizard-heban-promo-title">{t('family.chartTitle')}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(families).map(([fname, saves]) => {
                      const latest = saves[0];
                      const memberCount = latest.familyData?.members?.length || 0;
                      const protoName = latest.familyData?.protagonist?.name || '';
                      return (
                        <div key={fname} className="wizard-dashboard-card" style={{ position: 'relative' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ flex: 1, cursor: 'pointer', textAlign: 'center' }} onClick={() => setShowFamily(true)}>
                              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{fname}</div>
                              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                                {memberCount > 0 ? `${memberCount} ${t('family.members', { defaultValue: '位成員' })}` : ''}
                                {protoName ? ` · ${t('family.protagonist', { defaultValue: '主角' })}：${protoName}` : ''}
                              </div>
                              {saves.length > 1 && (
                                <div style={{ fontSize: 12, color: 'rgba(160,140,255,0.6)', marginTop: 4 }}>{saves.length} {t('family.analyses', { defaultValue: '次分析' })}</div>
                              )}
                            </div>
                            {wizardUser && (
                              <button
                                style={{ background: 'none', border: 'none', color: 'rgba(255,100,100,0.6)', fontSize: 16, cursor: 'pointer', padding: '4px 8px' }}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm(t('charts.confirmDeleteFamily', { name: fname }))) return;
                                  // Delete all saves for this family
                                  for (const s of saves) {
                                    if (s.time) await deleteReading(wizardUser, s.time);
                                  }
                                  setServerReadings(prev => prev.filter(s => {
                                    const n = s.familyData?.familyName || s.goalPrompt?.replace(/^家族命盤 — /, '');
                                    return n !== fname;
                                  }));
                                  // Also clear localStorage family data if matching
                                  try {
                                    const local = JSON.parse(localStorage.getItem("fortune-family-data") || "{}");
                                    if (local.familyName === fname) localStorage.removeItem("fortune-family-data");
                                  } catch {}
                                }}
                                title={t('charts.delete')}
                              >✕</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button className="wizard-cta-secondary" style={{ marginTop: 12, width: '100%' }} onClick={() => setShowFamily(true)}>
                    + {t('family.buildChart')}
                  </button>
                </div>
              );
            }

            // No family data — show promo
            return (
              <div className="wizard-heban-promo" style={{ marginTop: 24, maxWidth: 480, width: '100%' }}>
                <div className="wizard-heban-promo-header">
                  <span className="wizard-heban-promo-icon wizard-diamond"></span>
                  <div>
                    <div className="wizard-heban-promo-title">{t('family.chartTitle')}</div>
                    <div className="wizard-heban-promo-desc">{t('family.chartDesc')}</div>
                  </div>
                </div>
                <button className="wizard-cta" style={{ marginTop: 16 }} onClick={() => setShowFamily(true)}>
                  {t('family.buildChart')}
                </button>
              </div>
            );
          })()}

          {/* Dashboard removed — readings are now grouped under Charts above */}
        </>
      ) : (
        <div className="wizard-welcome-auth">
          <div className="wizard-question">{t('welcome.iAm')}</div>
          <div className="wizard-gender-cards">
            <div className={`wizard-gender-card ${gender === "男" ? "selected" : ""}`} onClick={() => { setGender("男"); trackEvent("select_gender", { gender: "男" }); setTimeout(() => setStep(1), 300); }}>
              <div className="wizard-gender-icon">M</div>
              <div className="wizard-gender-label"><span>{t('welcome.male')}</span><span>›</span></div>
            </div>
            <div className={`wizard-gender-card ${gender === "女" ? "selected" : ""}`} onClick={() => { setGender("女"); trackEvent("select_gender", { gender: "女" }); setTimeout(() => setStep(1), 300); }}>
              <div className="wizard-gender-icon">F</div>
              <div className="wizard-gender-label"><span>{t('welcome.female')}</span><span>›</span></div>
            </div>
          </div>

          <div className="wizard-welcome-divider">
            <span>{t('welcome.hasAccount')}</span>
          </div>

          <div className="wizard-welcome-auth-card">
            <div className="wizard-welcome-auth-tabs">
              <button className={`wizard-welcome-auth-tab ${authMode === "login" ? "active" : ""}`}
                onClick={() => { setAuthMode("login"); setAuthError(""); }}>{t('auth.login')}</button>
              <button className={`wizard-welcome-auth-tab ${authMode === "register" ? "active" : ""}`}
                onClick={() => { setAuthMode("register"); setAuthError(""); }}>{t('auth.register')}</button>
            </div>

            {authMode === "register" && (
              <input className="wizard-auth-input" placeholder={t('auth.name')} value={authName}
                onChange={e => setAuthName(e.target.value)} />
            )}
            <input className="wizard-auth-input" placeholder={t('auth.email')} type="email" value={authEmail}
              onChange={e => setAuthEmail(e.target.value)} />
            <input className="wizard-auth-input" placeholder={t('auth.password')} type="password" value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAuthSubmit(); }} />

            {authError && <div className="wizard-auth-error">{authError}</div>}

            <button className="wizard-cta" onClick={handleAuthSubmit}>
              {authMode === "login" ? t('auth.login') : t('auth.freeRegister')}
            </button>
            <div className="wizard-guest-note" style={{ marginTop: 8 }}>{t('welcome.guestNote')}</div>
          </div>
        </div>
      )}
    </div>
  );

  // Step 1: Goal
  const renderGoal = () => {
    // #7a — dedupe goals already analysed for this chart. When entering via
    // "+ 新分析" on an existing chart card, birth data is already set. Match
    // server readings by birthday and hide goals the user has already run so
    // they don't pay tokens for a duplicate report.
    const sameChartAsked = new Set();
    if (birthYear && birthMonth && birthDay) {
      for (const r of serverReadings) {
        const bd = r.birthData || {};
        if (String(bd.year) === String(birthYear)
            && String(bd.month) === String(birthMonth)
            && String(bd.day) === String(birthDay)
            && r.goal) {
          sameChartAsked.add(r.goal);
        }
      }
    }
    const goalsToShow = sameChartAsked.size > 0
      ? GOALS.filter(g => !sameChartAsked.has(g.key))
      : GOALS;
    return (
    <div className="wizard-content">
      <div className="wizard-question">{goal === "goal.love" && loveSub === "" ? t('goal.loveStatus') : t('goal.question')}</div>
      <div className="wizard-subtitle">{goal === "goal.love" && loveSub === "" ? t('goal.loveStatusSub') : t('goal.subtitle')}</div>
      {sameChartAsked.size > 0 && goalsToShow.length < GOALS.length && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
          {t('goal.dedupeHint', { defaultValue: '已分析過的主題不再顯示。想重看之前的內容請回命盤庫點歷史紀錄。' })}
        </div>
      )}
      <div className="wizard-options">
        {goal === "goal.love" && loveSub === "" ? (
          <>
            {LOVE_SUBS.map(s => (
              <div key={s.key} className="wizard-option"
                onClick={() => { setLoveSub(s.key); setGoalPrompt(s.promptKey); trackEvent("select_goal", { goal: "love", sub: s.key }); setTimeout(() => setStep(2), 300); }}>
                <span className="wizard-option-text">{t(s.key)}</span>
                <span className="wizard-option-arrow">›</span>
              </div>
            ))}
            <div className="wizard-option" style={{ opacity: 0.6 }}
              onClick={() => { setGoal(""); setLoveSub(""); }}>
              <span className="wizard-option-text">{t('goal.back')}</span>
            </div>
          </>
        ) : goalsToShow.length > 0 ? (
          goalsToShow.map(g => (
            <div key={g.key} className={`wizard-option ${goal === g.key ? "selected" : ""}`}
              onClick={() => {
                setGoal(g.key);
                if (g.hasSub) {
                  setLoveSub("");
                } else {
                  setGoalPrompt(g.promptKey);
                  trackEvent("select_goal", { goal: g.key });
                  setTimeout(() => setStep(2), 300);
                }
              }}>
              <span className="wizard-option-text">{t(g.key)}</span>
              <span className="wizard-option-arrow">›</span>
            </div>
          ))
        ) : (
          <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
            {t('goal.allDone', { defaultValue: '這張命盤所有主題都已分析過。可以改問「問事」或回命盤庫看歷史。' })}
          </div>
        )}
      </div>
    </div>
    );
  };

  // Step 2: Birthday + Time
  const renderBirthday = () => {
    const years = [];
    for (let y = new Date().getFullYear() + 1; y >= 1940; y--) years.push(y);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

    const canProceed = birthYear && birthMonth && birthDay && birthHour !== "";

    return (
      <div className="wizard-content">
        <div className="wizard-question">{t('birth.question')}</div>
        <div className="wizard-hint">
          <span className="wizard-hint-text">{t('birth.hint')}</span>
        </div>

        <div className="wizard-date-row">
          <div className="wizard-select-wrap">
            <label>{t('birth.year')}</label>
            <select className="wizard-select" value={birthYear} onChange={e => setBirthYear(e.target.value)}>
              <option value="">--</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="wizard-select-wrap">
            <label>{t('birth.month')}</label>
            <select className="wizard-select" value={birthMonth} onChange={e => setBirthMonth(e.target.value)}>
              <option value="">--</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="wizard-select-wrap">
            <label>{t('birth.day')}</label>
            <select className="wizard-select" value={birthDay} onChange={e => setBirthDay(e.target.value)}>
              <option value="">--</option>
              {days.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div style={{ height: 20 }} />

        <div className="wizard-date-row">
          <div className="wizard-select-wrap">
            <label>{t('birth.hour')}</label>
            <select className="wizard-select" value={birthHour} onChange={e => setBirthHour(e.target.value)}>
              <option value="">--</option>
              {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}{t('birth.hourSuffix')}</option>)}
            </select>
          </div>
          <div className="wizard-select-wrap">
            <label>{t('birth.minute')}</label>
            <input type="number" className="wizard-select wizard-minute-input" min="0" max="59"
              value={birthMinute} placeholder="00"
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                const n = parseInt(v);
                if (v === '' || (n >= 0 && n <= 59)) setBirthMinute(v);
              }}
              onBlur={e => {
                const n = parseInt(e.target.value);
                if (isNaN(n)) setBirthMinute("0");
                else setBirthMinute(String(Math.min(59, Math.max(0, n))));
              }}
            />
          </div>
        </div>

        <div style={{ height: 20 }} />
        <div className="wizard-twin-toggle">
          <label className="wizard-twin-check">
            <input type="checkbox" checked={isTwin} onChange={e => { setIsTwin(e.target.checked); if (!e.target.checked) { setTwinOrder(""); setTwinType(""); } }} />
            <span>{t('birth.twin')}</span>
          </label>
        </div>

        {isTwin && (
          <div className="wizard-twin-options">
            <div className="wizard-twin-row">
              <div className="wizard-twin-label">{t('birth.twinSibGender')}</div>
              <div className="wizard-twin-btns">
                <button className={`wizard-twin-btn ${twinType === "same" ? "selected" : ""}`} onClick={() => setTwinType("same")}>{t('birth.twinSameGender', { gender: gender === "男" ? t('welcome.male') : t('welcome.female') })}</button>
                <button className={`wizard-twin-btn ${twinType === "mixed" ? "selected" : ""}`} onClick={() => setTwinType("mixed")}>{t('birth.twinDiffGender', { otherGender: gender === "男" ? t('welcome.female') : t('welcome.male') })}</button>
              </div>
            </div>
            <div className="wizard-twin-row">
              <div className="wizard-twin-label">{t('birth.twinOrder')}</div>
              <div className="wizard-twin-btns">
                <button className={`wizard-twin-btn ${twinOrder === "first" ? "selected" : ""}`} onClick={() => setTwinOrder("first")}>{t('birth.twinFirst')}</button>
                <button className={`wizard-twin-btn ${twinOrder === "second" ? "selected" : ""}`} onClick={() => setTwinOrder("second")}>{t('birth.twinSecond')}</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ height: 32 }} />
        <button className="wizard-cta" disabled={!canProceed || (isTwin && (!twinOrder || !twinType))} onClick={() => setStep(3)}>
          {t('birth.continue')}
        </button>
        <button className="wizard-cta-secondary" onClick={() => { setBirthHour("12"); setBirthMinute("0"); setStep(3); }}>
          {t('birth.defaultTime')}
        </button>
      </div>
    );
  };

  // Step 3: Birth place
  const handleCitySearch = async (query) => {
    setCitySearchQuery(query);
    setBirthPlace(query);
    if (query.length >= 1) {
      const results = await searchCities(query, 8);
      setCitySearchResults(results);
    } else {
      setCitySearchResults([]);
    }
  };

  const handleCitySelect = (city) => {
    setBirthPlace(currentLang === 'zh-TW' && city.nameZh !== city.name ? `${city.nameZh} (${city.name})` : city.name);
    setBirthCity({ lat: city.lat, lng: city.lng, timezone: city.timezone, name: city.name, nameZh: city.nameZh });
    setCitySearchResults([]);
    setCitySearchQuery("");
  };

  const renderPlace = () => {
    return (
      <div className="wizard-content">
        <div className="wizard-question">{t('place.question')}</div>
        <div className="wizard-subtitle">{t('place.subtitle')}</div>
        <div style={{ maxWidth: 340, margin: "0 auto", position: "relative" }}>
          <input
            className="wizard-input"
            value={citySearchQuery || birthPlace}
            onChange={e => handleCitySearch(e.target.value)}
            onFocus={() => { if (birthPlace && birthPlace.length > 0) handleCitySearch(birthPlace); }}
            placeholder={t('place.search')}
            style={{ width: "100%", fontSize: 16, padding: "10px 12px" }}
            autoComplete="off"
          />
          {citySearchResults.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
              background: "var(--card-bg, #1a1a2e)", border: "1px solid var(--border, #333)",
              borderRadius: 8, maxHeight: 280, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
            }}>
              {citySearchResults.map(city => (
                <div
                  key={city.id}
                  onClick={() => handleCitySelect(city)}
                  style={{
                    padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border, #222)",
                    fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center"
                  }}
                  onMouseEnter={e => e.target.style.background = "var(--hover-bg, #252545)"}
                  onMouseLeave={e => e.target.style.background = "transparent"}
                >
                  <span>
                    <strong>{currentLang === 'zh-TW' && city.nameZh !== city.name ? city.nameZh : city.name}</strong>
                    {currentLang === 'zh-TW' && city.nameZh !== city.name && <span style={{ opacity: 0.6, marginLeft: 6 }}>{city.name}</span>}
                  </span>
                  <span style={{ opacity: 0.5, fontSize: 12 }}>{city.country}</span>
                </div>
              ))}
            </div>
          )}
          {birthCity && (
            <div className="wizard-hint" style={{ marginTop: 8, textAlign: "left" }}>
              <span className="wizard-hint-text">
                {t('place.coords', { timezone: birthCity.timezone, longitude: birthCity.lng, latitude: birthCity.lat })}
              </span>
            </div>
          )}
        </div>
        <div style={{ height: 32 }} />
        <button className="wizard-cta" disabled={!birthPlace.trim()} onClick={() => { setCitySearchResults([]); setStep(4); }}>
          {t('birth.continue')}
        </button>
      </div>
    );
  };

  // Step 4: Confirm
  const renderConfirm = () => (
    <div className="wizard-content">
      <div className="wizard-question">{t('confirm.question')}</div>
      <div className="wizard-confirm">
        <div className="wizard-confirm-card">
          <div className="wizard-confirm-row">
            <span className="wizard-confirm-label">{t('confirm.gender')}</span>
            <span className="wizard-confirm-value">{genderDisplay(gender)}</span>
          </div>
          <div className="wizard-confirm-row">
            <span className="wizard-confirm-label">{t('confirm.focus')}</span>
            <span className="wizard-confirm-value">{goalDisplay(goal)}{loveSub ? ` (${goalDisplay(loveSub)})` : ""}</span>
          </div>
          <div className="wizard-confirm-row">
            <span className="wizard-confirm-label">{t('confirm.birthDate')}</span>
            <span className="wizard-confirm-value">{t('confirm.dateFormat', { year: birthYear, month: birthMonth, day: birthDay })}</span>
          </div>
          <div className="wizard-confirm-row">
            <span className="wizard-confirm-label">{t('confirm.birthTime')}</span>
            <span className="wizard-confirm-value">{String(birthHour).padStart(2, '0')}:{String(birthMinute).padStart(2, '0')}</span>
          </div>
          <div className="wizard-confirm-row">
            <span className="wizard-confirm-label">{t('confirm.birthPlace')}</span>
            <span className="wizard-confirm-value">{birthPlace}</span>
          </div>
          {isTwin && (
            <div className="wizard-confirm-row">
              <span className="wizard-confirm-label">{t('confirm.twinLabel')}</span>
              <span className="wizard-confirm-value">{twinType === "same" ? t('confirm.twinSame') : t('confirm.twinDiff')}{' / '}{twinOrder === "first" ? t('confirm.twinFirst') : t('confirm.twinSecond')}</span>
            </div>
          )}
        </div>
        <button className="wizard-cta" onClick={startAnalysis}>
          {t('confirm.startAnalysis')}
        </button>
        <button className="wizard-cta-secondary" onClick={() => setStep(0)}>
          {t('confirm.redo')}
        </button>
      </div>
    </div>
  );

  // Loading screen
  const renderLoading = () => (
    <div className="wizard-content">
      <div className="wizard-loading">
        <div className="wizard-loading-anim">
          <div className="wizard-loading-ring" />
          <div className="wizard-loading-ring" />
          <div className="wizard-loading-ring" />
          <div className="wizard-loading-star wizard-diamond"></div>
        </div>
        <div className="wizard-loading-text">{loadingMsg}</div>
        <div className="wizard-loading-step">{t('loading.wait')}</div>
      </div>
      {error && <div style={{ color: "#f87171", marginTop: 24, textAlign: "center" }}>{error}</div>}
    </div>
  );

  // Result screen
  const renderResult = () => {
    const years = [];
    for (let y = new Date().getFullYear() + 1; y >= 1940; y--) years.push(y);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

    const hebanReady = hebanRelation && hebanYear && hebanMonth && hebanDay && hebanGender;

    return (
      <div className="wizard-content">
        <div className="wizard-result">
          {/* Chart info banner when entering from chart library */}
          {selectedChart && !finalResult && (
            <div style={{ background: 'rgba(160,140,255,0.1)', border: '1px solid rgba(160,140,255,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(160,140,255,0.9)' }}>
                {selectedChart.name} {t('charts.chartOf')}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                {selectedChart.birthData ? `${selectedChart.birthData.year}/${selectedChart.birthData.month}/${selectedChart.birthData.day} ${String(selectedChart.birthData.hour || 0).padStart(2,'0')}:${String(selectedChart.birthData.minute || 0).padStart(2,'0')}` : ''}
                {selectedChart.gender ? ` · ${selectedChart.gender === '男' ? t('welcome.male') : t('welcome.female')}` : ''}
                {selectedChart.birthData?.city?.nameZh ? ` · ${selectedChart.birthData.city.nameZh}` : selectedChart.birthData?.place ? ` · ${selectedChart.birthData.place}` : ''}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                {t('charts.askAboutChart')}
              </div>
            </div>
          )}
          <div className="wizard-question" style={{ marginBottom: 12 }}>
            {chatOnlyMode
              ? t('result.askMode', { defaultValue: '問事 — 直接提問，系統依命盤資料回答' })
              : t('result.title')}
          </div>

          {chatOnlyMode && finalResult && (
            <button
              className="wizard-quick-q-toggle"
              style={{ width: '100%', marginBottom: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}
              onClick={() => setChatOnlyMode(false)}
            >
              ▸ {t('result.showFullReport', { defaultValue: '查看完整分析報告' })}
            </button>
          )}

          {!chatOnlyMode && (<>
          <div className="wizard-translate-bar">
            {Object.entries(LANG_NAMES).map(([lng, label]) => {
              const isOriginal = lng === currentLang && !displayLang;
              const isActive = displayLang === lng || isOriginal;
              return (
                <button key={lng}
                  className={`wizard-lang-btn ${isActive ? 'active' : ''}`}
                  disabled={translating}
                  onClick={() => {
                    if (lng === currentLang) { setDisplayLang(null); }
                    else { translateResult(lng); }
                  }}>
                  {label}
                </button>
              );
            })}
            {translating && <span className="wizard-translate-loading">{t('result.translating')}</span>}
          </div>

          {/* Month Quick Reference — grid is always shown on the result page so
              unlocking the yearly forecast is discoverable even when the user
              picked a non-monthly goal. A cell with real data expands inline;
              an empty cell opens the unlock modal. */}
          {(() => {
            // Deterministic tone per month — derived from programmatic 流月四化
            // (calculateTransitOverlay.monthly), not parsed from LLM prose.
            // Same chart + same year → same colors every time.
            const llmHighlights = parseMonthHighlights(displayResult);
            const year = new Date().getFullYear();
            const KEY_PALACES = ["命宮", "財帛宮", "官祿宮", "疾厄宮", "夫妻宮", "福德宮", "遷移宮"];
            const scoreMonth = (effects) => {
              // +1 per 化祿/化權/化科 landing in a key palace; -1 per 化忌
              // there. Palace comes through as "本命X/流年Y" so startsWith match.
              let s = 0;
              for (const e of effects || []) {
                const landed = e.gongName || "";
                const inKey = KEY_PALACES.some(p => landed.includes(p));
                if (!inKey) continue;
                if (e.hua === "化忌") s -= 1;
                else if (e.hua === "化祿" || e.hua === "化權" || e.hua === "化科") s += 1;
              }
              return s;
            };
            let deterministicTones = null;
            try {
              // Rebuild the ziwei chart from current birth state if we have it
              // so the tones work on restored readings too, not only fresh runs.
              if (birthYear && birthMonth && birthDay) {
                const rawChart = calculateChart(
                  parseInt(birthYear), parseInt(birthMonth), parseInt(birthDay),
                  parseInt(birthHour || 0), parseInt(birthMinute || 0),
                  gender || "男"
                );
                const overlay = calculateTransitOverlay(rawChart, year);
                if (overlay?.monthly) {
                  deterministicTones = {};
                  for (let m = 1; m <= 12; m++) {
                    const mo = overlay.monthly[m];
                    const s = mo ? scoreMonth(mo.effects) : 0;
                    deterministicTones[m] = s >= 2 ? "positive" : s <= -1 ? "caution" : (mo?.effects?.length ? "neutral" : "default");
                  }
                }
              }
            } catch (e) { /* fall back to LLM-parsed tones */ }
            const hasAnyData = deterministicTones || llmHighlights.length > 0;
            const allMonths = Array.from({ length: 12 }, (_, i) => {
              const n = i + 1;
              const found = llmHighlights.find(h => h.month === n);
              const tone = deterministicTones ? deterministicTones[n] : (found?.tone || "default");
              return { month: n, tone, description: found?.description || "" };
            });
            const toneColors = { positive: "#4caf50", caution: "#ff9800", neutral: "#90caf9", default: "rgba(255,255,255,0.1)" };
            const toneLabels = { positive: t('calendar.good'), caution: "!", neutral: "", default: "" };
            const monthNames = t('calendar.months', { returnObjects: true });
            const onCellClick = (m) => {
              if (m.description) {
                setExpandedMonth(expandedMonth === m.month ? null : m.month);
              } else {
                trackEvent("unlock_monthly_clicked", { month: m.month, source: hasAnyData ? "partial" : "locked" });
                setShowUnlockMonthly(true);
              }
            };
            return (
              <div className="wizard-month-overview">
                <div className="wizard-month-overview-title">{t('calendar.title', { year })}</div>
                <div className="wizard-month-grid">
                  {allMonths.map(m => (
                    <div key={m.month}
                      className={`wizard-month-cell ${m.tone} ${expandedMonth === m.month ? 'expanded' : ''}`}
                      title={m.description || t('calendar.locked', { defaultValue: '點擊解鎖' })}
                      style={{ borderBottom: `3px solid ${toneColors[m.tone]}`, cursor: 'pointer', opacity: m.description ? 1 : 0.55 }}
                      onClick={() => onCellClick(m)}>
                      <span className="wizard-month-num">{monthNames[m.month - 1]}</span>
                      {toneLabels[m.tone] && <span className="wizard-month-badge">{toneLabels[m.tone]}</span>}
                      {!m.description && <span className="wizard-month-badge" style={{ opacity: 0.7 }}>🔒</span>}
                    </div>
                  ))}
                </div>
                {expandedMonth && (() => {
                  const m = allMonths.find(x => x.month === expandedMonth);
                  if (!m?.description) return null;
                  return (
                    <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, borderLeft: `3px solid ${toneColors[m.tone]}`, fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)' }}>
                      <strong>{monthNames[m.month - 1]}</strong>：{m.description}
                    </div>
                  );
                })()}
                <div className="wizard-month-legend">
                  <span className="wizard-month-legend-item"><span style={{ background: toneColors.positive }} className="wizard-month-dot" /> {t('calendar.favorable')}</span>
                  <span className="wizard-month-legend-item"><span style={{ background: toneColors.caution }} className="wizard-month-dot" /> {t('calendar.caution')}</span>
                  <span className="wizard-month-legend-item"><span style={{ background: toneColors.neutral }} className="wizard-month-dot" /> {t('calendar.transition')}</span>
                </div>
              </div>
            );
          })()}

          <div className="wizard-result-sections">
            {renderFormattedResult(displayResult)}
          </div>

          {/* Heban promo */}
          {!hebanResult && !hebanAnalyzing && (
            <div className="wizard-heban-promo" ref={hebanRef}>
              <div className="wizard-heban-promo-header">
                <span className="wizard-heban-promo-icon wizard-diamond"></span>
                <div>
                  <div className="wizard-heban-promo-title">{t('result.hebanPromoTitle')}</div>
                  <div className="wizard-heban-promo-desc">{t('result.hebanPromoDesc')}</div>
                </div>
              </div>
              {!showHeban ? (
                <button className="wizard-cta" style={{ marginTop: 16 }} onClick={() => requireAuth(() => setShowHeban(true))}>
                  {t('result.startHeban')}
                </button>
              ) : (
                <div className="wizard-heban-form">
                  <div className="wizard-heban-label">{t('result.hebanMode', { defaultValue: '合盤模式' })}</div>
                  <div className="wizard-heban-relations">
                    <button className={`wizard-heban-rel-btn ${hebanMode === "basic" ? "selected" : ""}`}
                      onClick={() => setHebanMode("basic")}>
                      {t('result.hebanModeBasic', { defaultValue: '基礎合盤' })}
                    </button>
                    <button className={`wizard-heban-rel-btn ${hebanMode === "monthly" ? "selected" : ""}`}
                      onClick={() => setHebanMode("monthly")}>
                      {t('result.hebanModeMonthly', { defaultValue: '合盤月度' })}
                    </button>
                    <button className={`wizard-heban-rel-btn ${hebanMode === "timed" ? "selected" : ""}`}
                      onClick={() => setHebanMode("timed")}>
                      {t('result.hebanModeTimed', { defaultValue: '合盤擇吉' })}
                    </button>
                  </div>

                  {hebanMode === "monthly" && (
                    <>
                      <div className="wizard-heban-label">{t('result.hebanTargetMonth', { defaultValue: '聚焦月份 (今年)' })}</div>
                      <select className="wizard-select" value={hebanTargetMonth}
                        onChange={e => setHebanTargetMonth(e.target.value)}
                        style={{ maxWidth: 140, marginBottom: 16 }}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                          <option key={m} value={m}>{m} 月</option>
                        ))}
                      </select>
                    </>
                  )}

                  {hebanMode === "timed" && (
                    <>
                      <div className="wizard-heban-label">{t('result.hebanTargetDate', { defaultValue: '擇吉日期 (今年)' })}</div>
                      <div className="wizard-date-row" style={{ marginBottom: 16, maxWidth: 260 }}>
                        <div className="wizard-select-wrap">
                          <label>{t('birth.month')}</label>
                          <select className="wizard-select" value={hebanTargetMonth}
                            onChange={e => setHebanTargetMonth(e.target.value)}>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                        <div className="wizard-select-wrap">
                          <label>{t('birth.day')}</label>
                          <select className="wizard-select" value={hebanTargetDay}
                            onChange={e => setHebanTargetDay(e.target.value)}>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="wizard-heban-label">{t('result.hebanRelation')}</div>
                  <div className="wizard-heban-relations">
                    {RELATIONS.map(r => (
                      <button key={r.key}
                        className={`wizard-heban-rel-btn ${hebanRelation === r.key ? "selected" : ""}`}
                        onClick={() => setHebanRelation(r.key)}>
                        {t(r.key)}
                      </button>
                    ))}
                  </div>

                  {hebanRelation && hebanRelation !== "relations.twin" && (
                    <>
                      <div className="wizard-heban-label">{t('result.hebanFocus')}</div>
                      <div className="wizard-heban-relations">
                        {HEBAN_FOCUS_OPTIONS.map(f => (
                          <button key={f.key}
                            className={`wizard-heban-rel-btn ${hebanFocus === f.key ? "selected" : ""}`}
                            onClick={() => setHebanFocus(hebanFocus === f.key ? "" : f.key)}>
                            {t(f.key)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="wizard-heban-label">{t('result.hebanGender')}</div>
                  <div className="wizard-heban-relations">
                    <button className={`wizard-heban-rel-btn ${hebanGender === "男" ? "selected" : ""}`}
                      onClick={() => setHebanGender("男")}>{t('welcome.male')}</button>
                    <button className={`wizard-heban-rel-btn ${hebanGender === "女" ? "selected" : ""}`}
                      onClick={() => setHebanGender("女")}>{t('welcome.female')}</button>
                  </div>

                  <div className="wizard-heban-label">{t('result.hebanName')}</div>
                  <input className="wizard-input" value={hebanName} onChange={e => setHebanName(e.target.value)}
                    placeholder={t('result.hebanNamePlaceholder')} style={{ maxWidth: 300, marginBottom: 16 }} />

                  <div className="wizard-heban-label">{t('result.hebanBirth')}</div>
                  <div className="wizard-date-row" style={{ marginBottom: 16 }}>
                    <div className="wizard-select-wrap">
                      <label>{t('birth.year')}</label>
                      <select className="wizard-select" value={hebanYear} onChange={e => setHebanYear(e.target.value)}>
                        <option value="">--</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div className="wizard-select-wrap">
                      <label>{t('birth.month')}</label>
                      <select className="wizard-select" value={hebanMonth} onChange={e => setHebanMonth(e.target.value)}>
                        <option value="">--</option>
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="wizard-select-wrap">
                      <label>{t('birth.day')}</label>
                      <select className="wizard-select" value={hebanDay} onChange={e => setHebanDay(e.target.value)}>
                        <option value="">--</option>
                        {days.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="wizard-heban-label">{t('result.hebanTime')}</div>
                  <div className="wizard-date-row" style={{ maxWidth: 250, marginBottom: 24 }}>
                    <div className="wizard-select-wrap">
                      <label>{t('birth.hour')}</label>
                      <select className="wizard-select" value={hebanHour} onChange={e => setHebanHour(e.target.value)}>
                        <option value="">{t('result.hebanNoTime')}</option>
                        {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}{t('birth.hourSuffix')}</option>)}
                      </select>
                    </div>
                    <div className="wizard-select-wrap">
                      <label>{t('birth.minute')}</label>
                      <input type="number" className="wizard-select wizard-minute-input" min="0" max="59"
                        value={hebanMinute} placeholder="00"
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                          const n = parseInt(v);
                          if (v === '' || (n >= 0 && n <= 59)) setHebanMinute(v);
                        }}
                        onBlur={e => {
                          const n = parseInt(e.target.value);
                          if (isNaN(n)) setHebanMinute("0");
                          else setHebanMinute(String(Math.min(59, Math.max(0, n))));
                        }}
                      />
                    </div>
                  </div>

                  <button className="wizard-cta" disabled={!hebanReady} onClick={startHeban}>
                    {t('result.hebanAnalyze')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Heban Loading */}
          {hebanAnalyzing && (
            <div className="wizard-result-card" style={{ textAlign: "center", padding: 40 }}>
              <div className="wizard-loading-anim" style={{ margin: "0 auto 20px", width: 80, height: 80 }}>
                <div className="wizard-loading-ring" />
                <div className="wizard-loading-ring" />
                <div className="wizard-loading-ring" />
                <div className="wizard-loading-star wizard-diamond" style={{ fontSize: 20, inset: 24 }}></div>
              </div>
              <div className="wizard-loading-text">{loadingMsg}</div>
            </div>
          )}

          {/* Heban Result */}
          {hebanResult && (
            <div className="wizard-heban-result">
              <div className="wizard-question" style={{ fontSize: 20, marginBottom: 16 }}>
                {t('result.hebanResult')}
              </div>
              <div className="wizard-result-sections">
                {renderFormattedResult(hebanResult)}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="wizard-result-actions">
            <button className="wizard-result-btn primary" onClick={() => {
              setStep(0); setFinalResult(""); setRawResults([]); setChatHistory([]); setActiveReadingId(null); setLoveSub("");
              setShowHeban(false); setHebanResult(""); setHebanRelation(""); setHebanName("");
              setHebanYear(""); setHebanMonth(""); setHebanDay(""); setHebanHour(""); setHebanGender("");
            }}>
              {t('result.newReading')}
            </button>
            <button className="wizard-result-btn secondary" onClick={onBack}>
              {t('result.backHome')}
            </button>
          </div>

          {/* Past Readings History — grouped by chart */}
          {(() => {
            const { groups, unmatched } = groupReadingsByChart();
            const totalReadings = Object.values(groups).reduce((sum, arr) => sum + arr.length, 0) + unmatched.length;
            if (totalReadings <= 1) return null;
            return (
              <>
                <button className="wizard-history-btn" onClick={() => {
                  const panel = document.getElementById("wizard-history-panel");
                  if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
                }}>
                  {t('history.pastReadings', { count: totalReadings })}
                </button>
                <div id="wizard-history-panel" className="wizard-history-panel" style={{ display: "none" }}>
                  {userCharts.map(chart => {
                    const chartReadings = groups[chart.id] || [];
                    if (chartReadings.length === 0) return null;
                    return (
                      <div key={chart.id} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(160,140,255,0.8)', marginBottom: 4 }}>
                          {chart.name}
                        </div>
                        {chartReadings.map((r, i) => (
                          <div key={r.id || r.time || i} className="wizard-history-card" onClick={() => openHistoryCard(r)}>
                            <div className="wizard-history-card-date">{new Date(r.date || r.time).toLocaleDateString()}</div>
                            <div className="wizard-history-card-title">
                              {(() => { let k = (r.goal || r.goalPrompt || '').replace(/\s*\(chat\)\s*/g, '').trim(); if (k === 'heban') return t('account.featureHeban'); if (k === 'decision') { const q = r.goalPrompt || ''; const short = q.length > 24 ? q.slice(0, 24) + '…' : q; return `🎯 ${t('decision.cta', { defaultValue: '決策建議' })}${short ? '：' + short : ''}`; } if (k.startsWith('goal.') && k.endsWith('Prompt')) k = k.slice(0, -'Prompt'.length); return k.startsWith('goal.') ? t(k) : k || t('history.analysis'); })()}
                              {r.chat?.length > 0 ? ` (${r.chat.length / 2 | 0} Q&A)` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {unmatched.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                        {t('charts.unmatched', { defaultValue: '未歸類' })}
                      </div>
                      {unmatched.map((r, i) => (
                        <div key={r.id || r.time || i} className="wizard-history-card" onClick={() => openHistoryCard(r)}>
                          <div className="wizard-history-card-date">{new Date(r.date || r.time).toLocaleDateString()}</div>
                          <div className="wizard-history-card-title">
                            {(() => { let k = (r.goal || r.goalPrompt || '').replace(/\s*\(chat\)\s*/g, '').trim(); if (k === 'heban') return t('account.featureHeban'); if (k === 'decision') { const q = r.goalPrompt || ''; const short = q.length > 24 ? q.slice(0, 24) + '…' : q; return `🎯 ${t('decision.cta', { defaultValue: '決策建議' })}${short ? '：' + short : ''}`; } if (k.startsWith('goal.') && k.endsWith('Prompt')) k = k.slice(0, -'Prompt'.length); return k.startsWith('goal.') ? t(k) : k || t('history.analysis'); })()}
                            {r.birthData?.year ? ` — ${r.birthData.year}/${r.birthData.month}/${r.birthData.day}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* Family Chart entry */}
          <div className="wizard-heban-promo" style={{ marginTop: 32 }}>
            <div className="wizard-heban-promo-header">
              <span className="wizard-heban-promo-icon wizard-diamond"></span>
              <div>
                <div className="wizard-heban-promo-title">{t('family.chartTitle')}</div>
                <div className="wizard-heban-promo-desc">{t('family.chartDesc')}</div>
              </div>
            </div>
            <button className="wizard-cta" style={{ marginTop: 16 }} onClick={() => requireAuth(() => setShowFamily(true))}>
              {t('family.buildChart')}
            </button>
          </div>
          </>)}

          {/* Chat follow-up */}
          <div style={{ height: 32 }} />
          <button
            className="wizard-cta"
            style={{ width: '100%', marginBottom: 16, background: 'linear-gradient(135deg, rgba(160,140,255,0.9), rgba(200,140,255,0.9))' }}
            onClick={() => {
              // Find the chart matching the current birthdata, or fall back to
              // the primary chart so the advisor always has chart context.
              const matching = userCharts.find(c => {
                const bd = c.birthData || {};
                return String(bd.year) === String(birthYear)
                  && String(bd.month) === String(birthMonth)
                  && String(bd.day) === String(birthDay);
              }) || userCharts.find(c => c.is_primary) || null;
              openDecision(matching, "analysis_result");
            }}
          >
            🎯 {t('decision.cta', { defaultValue: '決策建議' })}
          </button>
          <div className="wizard-chat">
            <div className="wizard-question" style={{ fontSize: 18, marginBottom: 8 }}>{t('result.chatTitle')}</div>
            <div className="wizard-subtitle" style={{ marginTop: 0, marginBottom: 20 }}>{t('result.chatSubtitle')}</div>

            {showQuickQ && (
              <div className="wizard-quick-questions">
                <div className="wizard-quick-q-divider">{t('quickQuestions.deepTitle')}</div>
                {[
                  t('quickQuestions.deepQ1'),
                  t('quickQuestions.deepQ2', { year: new Date().getFullYear() }),
                ].map((q, i) => (
                  <button key={`deep-${i}`} className="wizard-quick-q-btn wizard-quick-q-deep" onClick={() => requireAuth(() => sendChat(q))} disabled={chatLoading}>
                    {q}
                  </button>
                ))}

                <div className="wizard-quick-q-divider">{t('quickQuestions.followUpTitle')}</div>
                {[
                  t('quickQuestions.q1'),
                  t('quickQuestions.q2'),
                  t('quickQuestions.q3'),
                  t('quickQuestions.q4'),
                ].map((q, i) => (
                  <button key={i} className="wizard-quick-q-btn" onClick={() => requireAuth(() => sendChat(q))} disabled={chatLoading}>
                    {q}
                  </button>
                ))}

                {!hebanResult && !hebanAnalyzing && (
                  <>
                    <div className="wizard-quick-q-divider">{t('quickQuestions.hebanTitle')}</div>
                    {[
                      { label: t('quickQuestions.hebanQ1'), relation: "relations.colleague" },
                      { label: t('quickQuestions.hebanQ2'), relation: "relations.family" },
                      { label: t('quickQuestions.hebanQ3'), relation: "relations.lover" },
                    ].map((item, i) => (
                      <button key={`heban-${i}`} className="wizard-quick-q-btn wizard-quick-q-heban" onClick={() => requireAuth(() => {
                        setShowHeban(true);
                        setHebanRelation(item.relation);
                        setTimeout(() => hebanRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                      })}>
                        {item.label}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}

            {!showQuickQ && chatHistory.length > 0 && (
              <button className="wizard-quick-q-toggle" onClick={() => setShowQuickQ(true)}>
                {t('result.moreQuestions')}
              </button>
            )}

            {chatHistory.length > 0 && (
              <div style={{ marginTop: 8, marginBottom: 8 }}>
                <button
                  className="wizard-quick-q-toggle"
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                  onClick={() => setShowChatHistoryPanel(v => !v)}
                >
                  <span>{showChatHistoryPanel ? '▾' : '▸'} {t('result.chatHistory', { defaultValue: '歷史詢問', count: chatHistory.length / 2 | 0 })} ({chatHistory.length / 2 | 0})</span>
                </button>
                {showChatHistoryPanel && (
                  <div className="wizard-chat-messages" style={{ marginTop: 4 }}>
                    {chatHistory.map((msg, i) => (
                      <div key={i} className={`wizard-chat-msg ${msg.role}`}>{
                        msg.role === "assistant"
                          ? msg.text.replace(/\[?\s*SECTION\s*\]?\s*[:：\-—]?\s*/gi, '').replace(/【\s*SECTION\s*】\s*/gi, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#{1,6}\s*/gm, '')
                          : msg.text
                      }</div>
                    ))}
                    {chatLoading && <div className="wizard-chat-msg assistant" style={{ opacity: 0.5 }}>{t('result.chatLoading')}</div>}
                    <div ref={chatEndRef} />
                  </div>
                )}
                {!showChatHistoryPanel && chatLoading && (
                  <div className="wizard-chat-msg assistant" style={{ opacity: 0.5, marginTop: 4 }}>{t('result.chatLoading')}</div>
                )}
              </div>
            )}
            <div className="wizard-chat-input">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) requireAuth(() => sendChat(chatInput)); }}
                placeholder={t('result.chatPlaceholder')}
                disabled={chatLoading}
              />
              <button onClick={() => requireAuth(() => sendChat(chatInput))} disabled={chatLoading || !chatInput.trim()}>
                {t('result.chatSend')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ---- MAIN RENDER ----
  const isLoadingScreen = step === TOTAL_STEPS && analyzing;
  const isResultScreen = step === TOTAL_STEPS + 1 || (step === TOTAL_STEPS && !analyzing && finalResult);

  const stepRenderers = [renderWelcome, renderGoal, renderBirthday, renderPlace, renderConfirm];

  return (
    <div className="wizard">
      <div className="wizard-bg" />

      {step > 0 && (
      <div className="wizard-header">
        <button className="wizard-back" onClick={() => {
          if (isResultScreen) setStep(0);
          else setStep(s => Math.max(0, s - 1));
        }}>
          ‹
        </button>
        <div className="wizard-logo">{t('header.logo')}</div>
        <div className="wizard-menu" />
      </div>
      )}

      {step > 0 && step < TOTAL_STEPS && (
        <div className="wizard-progress">
          <div className="wizard-progress-track">
            <div className="wizard-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="wizard-step-counter">{step}/{TOTAL_STEPS - 1}</div>
        </div>
      )}

      {showFamily ? <FamilyChart apiBackend={API_BACKEND} wizardUser={wizardUser} getVisitorId={getVisitorId} onClose={() => setShowFamily(false)} />
        : showAccount ? renderAccountPanel()
        : isLoadingScreen ? renderLoading()
        : isResultScreen ? renderResult()
        : stepRenderers[step] ? stepRenderers[step]()
        : renderLoading()}

      <div className="wizard-footer">{t('app.footer')}</div>

      {/* Add Chart Modal */}
      {showAddChart && (
        <div className="wizard-auth-overlay" onClick={() => setShowAddChart(false)}>
          <div className="wizard-auth-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 16px', color: '#fff' }}>{t('charts.addNew')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="wizard-input" placeholder={t('charts.nameLabel')} value={newChartName} onChange={e => setNewChartName(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`wizard-gender-card ${newChartGender === '男' ? 'selected' : ''}`} style={{ flex: 1, padding: 8 }} onClick={() => setNewChartGender('男')}>
                  {t('welcome.male')}
                </button>
                <button className={`wizard-gender-card ${newChartGender === '女' ? 'selected' : ''}`} style={{ flex: 1, padding: 8 }} onClick={() => setNewChartGender('女')}>
                  {t('welcome.female')}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <select className="wizard-select" value={newChartYear} onChange={e => setNewChartYear(e.target.value)} style={{ flex: 2 }}>
                  <option value="">{t('birth.year')}</option>
                  {Array.from({ length: 87 }, (_, i) => new Date().getFullYear() + 1 - i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select className="wizard-select" value={newChartMonth} onChange={e => setNewChartMonth(e.target.value)} style={{ flex: 1 }}>
                  <option value="">{t('birth.month')}</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className="wizard-select" value={newChartDay} onChange={e => setNewChartDay(e.target.value)} style={{ flex: 1 }}>
                  <option value="">{t('birth.day')}</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <select className="wizard-select" value={newChartHour} onChange={e => setNewChartHour(e.target.value)} style={{ flex: 1 }}>
                  <option value="">{t('birth.hour')}</option>
                  {Array.from({ length: 24 }, (_, i) => i).map(h => <option key={h} value={h}>{h}{t('birth.hourSuffix')}</option>)}
                </select>
                <select className="wizard-select" value={newChartMinute} onChange={e => setNewChartMinute(e.target.value)} style={{ flex: 1 }}>
                  <option value="0">{t('birth.minute')}</option>
                  {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <input className="wizard-input" placeholder={t('charts.placeLabel')} value={newChartPlace} onChange={e => setNewChartPlace(e.target.value)} />
              <button
                className="wizard-cta"
                disabled={!newChartName || !newChartGender || !newChartYear || !newChartMonth || !newChartDay || newChartSaving}
                onClick={async () => {
                  setNewChartSaving(true);
                  try {
                    const y = parseInt(newChartYear), m = parseInt(newChartMonth), d = parseInt(newChartDay);
                    const h = newChartHour ? parseInt(newChartHour) : 12;
                    const min = parseInt(newChartMinute) || 0;
                    const g = newChartGender === '男' ? 1 : 0;
                    // Calculate all 3 charts
                    const ziweiChart = formatChart(calculateChart(y, m, d, h, min, g));
                    const baziChart = formatBazi(calculateBazi(y, m, d, h, g, min));
                    let astroChart = "";
                    try { astroChart = formatAstro(calculateAstro(y, m, d, h, min)); } catch {}
                    const chartData = {
                      name: newChartName,
                      is_primary: userCharts.length === 0,
                      birthData: { year: String(y), month: String(m), day: String(d), hour: String(h), minute: String(min), place: newChartPlace },
                      gender: newChartGender,
                      charts: {
                        '紫微斗數': ziweiChart,
                        '八字': baziChart,
                        ...(astroChart ? { '西洋占星': astroChart } : {}),
                      },
                      createdAt: Date.now(),
                    };
                    const saved = await saveChart(wizardUser, chartData);
                    if (saved) {
                      loadCharts(wizardUser).then(c => setUserCharts(c));
                      setShowAddChart(false);
                      setNewChartName(""); setNewChartGender(""); setNewChartYear(""); setNewChartMonth(""); setNewChartDay(""); setNewChartHour(""); setNewChartMinute("0"); setNewChartPlace("");
                    }
                  } catch (err) { alert(t('charts.calcError') + ': ' + err.message); }
                  finally { setNewChartSaving(false); }
                }}
              >
                {newChartSaving ? '...' : t('charts.calcAndSave')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAuthModal && (
        <div className="wizard-auth-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="wizard-auth-modal" onClick={e => e.stopPropagation()}>
            <button className="wizard-auth-close" onClick={() => setShowAuthModal(false)}>✕</button>
            <div className="wizard-auth-title">
              {authMode === "register" ? t('auth.registerUnlock') : t('auth.welcomeBack')}
            </div>
            <div className="wizard-auth-subtitle">
              {authMode === "register" ? t('auth.registerDesc') : t('auth.loginDesc')}
            </div>

            {authMode === "register" && (
              <input className="wizard-auth-input" placeholder={t('auth.name')} value={authName}
                onChange={e => setAuthName(e.target.value)} />
            )}
            <input className="wizard-auth-input" placeholder={t('auth.email')} type="email" value={authEmail}
              onChange={e => setAuthEmail(e.target.value)} />
            <input className="wizard-auth-input" placeholder={t('auth.password')} type="password" value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAuthSubmit(); }} />

            {authError && <div className="wizard-auth-error">{authError}</div>}

            <button className="wizard-cta" style={{ marginTop: 8 }} onClick={handleAuthSubmit}>
              {authMode === "register" ? t('auth.register') : t('auth.login')}
            </button>

            <button className="wizard-auth-switch" onClick={() => {
              setAuthMode(authMode === "register" ? "login" : "register");
              setAuthError("");
            }}>
              {authMode === "register" ? t('auth.hasAccountLogin') : t('auth.noAccountRegister')}
            </button>
            {authMode === "login" && (
              <button className="wizard-auth-switch" style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }} onClick={async () => {
                const email = authEmail.trim();
                if (!email) { setAuthError(t('auth.fillEmailPw')); return; }
                try {
                  const tempPw = Math.random().toString(36).slice(2, 10);
                  const res = await fetch(API_BACKEND.replace("/api/fortune", "/api/fortune-users"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "reset_password", username: email, password: tempPw }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setAuthError(t('auth.resetSent', { password: tempPw }));
                  } else {
                    setAuthError(data.error || t('auth.notFound'));
                  }
                } catch { setAuthError(t('auth.notFound')); }
              }}>
                {t('auth.forgotPassword')}
              </button>
            )}
          </div>
        </div>
      )}

      {showDecisionModal && (
        <div className="wizard-auth-overlay" onClick={() => { if (decisionStatus !== 'analyzing') setShowDecisionModal(false); }}>
          <div className="wizard-auth-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '85vh', overflow: 'auto' }}>
            {decisionStatus !== 'analyzing' && (
              <button className="wizard-auth-close" onClick={() => setShowDecisionModal(false)}>✕</button>
            )}
            <div className="wizard-auth-title">🎯 {t('decision.title', { defaultValue: '決策建議' })}</div>
            {decisionChart?.name && (
              <div className="wizard-auth-subtitle">
                {t('decision.anchoredOn', { defaultValue: '以命盤「{{name}}」為基礎', name: decisionChart.name })}
              </div>
            )}
            {!decisionChart && (
              <div className="wizard-auth-subtitle">
                {t('decision.guestMode', { defaultValue: '訪客模式 — 建議先建立命盤獲得更準確的能量評估' })}
              </div>
            )}

            {decisionStatus === 'input' && (
              <>
                <textarea
                  className="wizard-auth-input"
                  style={{ minHeight: 90, marginTop: 12, resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder={t('decision.placeholder', { defaultValue: '列出你在考慮的選項 —— 可以是二選一，也可以多個方案' })}
                  value={decisionQuestion}
                  onChange={e => setDecisionQuestion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runDecision(); }}
                />
                {(() => {
                  // `returnObjects` makes i18next return the JS array; if the
                  // user's current locale doesn't define examples we silently
                  // skip the chip row rather than rendering literal key text.
                  const examples = t('decision.examples', { returnObjects: true, defaultValue: [] });
                  if (!Array.isArray(examples) || examples.length === 0) return null;
                  return (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
                        {t('decision.examplesLabel', { defaultValue: '試試這些例子' })}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {examples.map((ex, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setDecisionQuestion(ex)}
                            style={{ padding: '6px 12px', fontSize: 12, background: 'rgba(160,140,255,0.12)', border: '1px solid rgba(160,140,255,0.25)', borderRadius: 14, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', textAlign: 'left', lineHeight: 1.4 }}
                          >
                            {ex}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <button
                  className="wizard-cta"
                  style={{ marginTop: 12 }}
                  disabled={!decisionQuestion.trim()}
                  onClick={runDecision}
                >{t('decision.analyze', { defaultValue: '開始分析' })}</button>
              </>
            )}

            {decisionStatus === 'need_date' && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 14, color: 'rgba(255,215,100,0.9)', marginBottom: 12 }}>
                  📅 {t('decision.askDateTitle', { defaultValue: '需要具體日期才能精算流日' })}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 10, lineHeight: 1.7 }}>
                  {t('decision.askDateHint', { defaultValue: '選日期（必填）+ 時辰（選填，有就精算到流時）' })}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <input
                    type="date"
                    value={decisionDateOverride}
                    onChange={e => setDecisionDateOverride(e.target.value)}
                    style={{ padding: '8px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', fontSize: 14 }}
                  />
                  <input
                    type="time"
                    placeholder="時間（選填）"
                    value={decisionTimeOverride}
                    onChange={e => setDecisionTimeOverride(e.target.value)}
                    style={{ padding: '8px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', fontSize: 14 }}
                  />
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>
                  {t('decision.askDateOptional', { defaultValue: '不選時間也可以，只是只能精算到「流日」層級，無法精算到「流時」。' })}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="wizard-cta"
                    style={{ flex: 1 }}
                    disabled={!decisionDateOverride}
                    onClick={runDecision}
                  >{t('decision.continue', { defaultValue: '繼續分析' })}</button>
                  <button
                    className="wizard-cta"
                    style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
                    onClick={() => { setDecisionStatus('input'); }}
                  >{t('decision.backToQuestion', { defaultValue: '回去改問題' })}</button>
                </div>
              </div>
            )}

            {decisionStatus === 'need_chart' && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 14, color: 'rgba(160,140,255,0.95)', marginBottom: 12 }}>
                  📋 {t('decision.askChartTitle', { defaultValue: '請選擇這個決策要以哪張命盤為基礎' })}
                </div>
                <div style={{ maxHeight: 280, overflow: 'auto', marginBottom: 12 }}>
                  {userCharts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setDecisionChart(c); setTimeout(runDecision, 0); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', marginBottom: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, cursor: 'pointer', color: '#fff' }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name} {c.is_primary && '⭐'}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                        {c.birthData?.year}/{c.birthData?.month}/{c.birthData?.day}
                        {c.gender && ` · ${c.gender === '男' ? t('welcome.male') : t('welcome.female')}`}
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  className="wizard-cta"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
                  onClick={() => setDecisionStatus('input')}
                >{t('decision.backToQuestion', { defaultValue: '回去改問題' })}</button>
              </div>
            )}

            {decisionStatus === 'analyzing' && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div className="wizard-loading-anim" style={{ margin: "0 auto 20px", width: 80, height: 80 }}>
                  <div className="wizard-loading-ring" />
                  <div className="wizard-loading-ring" />
                  <div className="wizard-loading-ring" />
                  <div className="wizard-loading-star wizard-diamond" style={{ fontSize: 20, inset: 24 }}></div>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)' }}>{t('decision.analyzing', { defaultValue: '分析中...' })}</div>
              </div>
            )}

            {decisionStatus === 'blocked' && decisionResult && (
              <div style={{ marginTop: 16, padding: '16px 18px', background: 'rgba(255,100,100,0.12)', border: '1px solid rgba(255,100,100,0.3)', borderRadius: 10, whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>
                {decisionResult.notes || DECISION_SAFETY_MESSAGE[currentLang] || DECISION_SAFETY_MESSAGE["zh-TW"]}
              </div>
            )}

            {decisionStatus === 'result' && decisionResult && decisionResult.type === 'open' && (
              <div style={{ marginTop: 16, padding: '16px 18px', background: 'rgba(255,200,100,0.1)', border: '1px solid rgba(255,200,100,0.3)', borderRadius: 10, whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>
                {decisionResult.notes || t('decision.openHint', { defaultValue: '請改用是非題或選擇題的方式提問，例如：我該不該接受這個 offer？' })}
              </div>
            )}

            {decisionStatus === 'result' && decisionResult && decisionResult.options?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {decisionResult.time_anchor && (
                  <div style={{ fontSize: 12, color: 'rgba(160,140,255,0.8)', marginBottom: 8 }}>
                    ⏱ {t('decision.timeAnchor', { defaultValue: '時間錨點' })}：{decisionResult.time_anchor}
                  </div>
                )}
                {decisionResult.options.map((opt, i) => {
                  const score = typeof opt.score === 'number' ? opt.score : 0;
                  const isWinner = opt.label === decisionResult.recommendation;
                  const tone = score >= 70 ? '#4caf50' : score >= 50 ? '#90caf9' : '#ff9800';
                  return (
                    <div key={i} style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: isWinner ? '1px solid rgba(255,215,100,0.5)' : '1px solid rgba(255,255,255,0.08)', position: 'relative' }}>
                      {isWinner && <div style={{ position: 'absolute', top: -10, right: 12, background: '#f1c40f', color: '#0f172a', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>⭐ {t('decision.winner', { defaultValue: '推薦' })}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{opt.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: tone }}>{score}<span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>/100</span></div>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 10 }}>
                        <div style={{ width: `${score}%`, height: '100%', background: tone }} />
                      </div>
                      {opt.keyPoints?.length > 0 && (
                        <ul style={{ margin: '0 0 10px 18px', padding: 0, fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.65 }}>
                          {opt.keyPoints.map((kp, j) => <li key={j}>{kp}</li>)}
                        </ul>
                      )}
                      {opt.analysis && (
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          {opt.analysis}
                        </div>
                      )}
                    </div>
                  );
                })}
                {decisionResult.recommendation && (
                  <div style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(160,140,255,0.1)', borderRadius: 10, border: '1px solid rgba(160,140,255,0.3)' }}>
                    <div style={{ fontSize: 13, color: 'rgba(160,140,255,0.9)', fontWeight: 700, marginBottom: 6 }}>
                      {t('decision.summary', { defaultValue: '綜合建議' })}
                    </div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>
                      {t('decision.recommend', { defaultValue: '建議採取' })}：<b>{decisionResult.recommendation}</b>
                      {decisionResult.gap && <span style={{ marginLeft: 10, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                        ({t('decision.gap', { defaultValue: '分差' })}: {decisionResult.gap})
                      </span>}
                    </div>
                    {decisionResult.notes && (
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {decisionResult.notes}
                      </div>
                    )}
                  </div>
                )}
                <button
                  className="wizard-cta"
                  style={{ marginTop: 16, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}
                  onClick={() => { setDecisionStatus('input'); setDecisionResult(null); }}
                >{t('decision.askAnother', { defaultValue: '問另一個決定' })}</button>
              </div>
            )}

            {decisionStatus === 'error' && (
              <div style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(255,100,100,0.1)', borderRadius: 10, color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
                {t('decision.error', { defaultValue: '分析失敗' })}: {decisionError}
                <button
                  className="wizard-cta"
                  style={{ marginTop: 10, background: 'rgba(255,255,255,0.08)' }}
                  onClick={() => setDecisionStatus('input')}
                >{t('decision.retry', { defaultValue: '重試' })}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showUnlockMonthly && (
        <div className="wizard-auth-overlay" onClick={() => setShowUnlockMonthly(false)}>
          <div className="wizard-auth-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="wizard-auth-title">
              {t('calendar.unlockTitle', { defaultValue: `解鎖 ${new Date().getFullYear()} 年每月運勢`, year: new Date().getFullYear() })}
            </div>
            <div className="wizard-auth-subtitle">
              {t('calendar.unlockDesc', { defaultValue: '幫你逐月排出今年的運勢起伏：哪個月是好時機、哪個月要小心、為什麼。' })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                className="wizard-cta"
                style={{ flex: 1 }}
                onClick={() => {
                  trackEvent("unlock_monthly_confirmed", { source: "modal" });
                  setShowUnlockMonthly(false);
                  // TODO(payment): insert billing gate here before dispatching
                  // the analysis. For now the unlock is free — the hook above
                  // is what the billing step will check against.
                  setGoal("goal.general");
                  setGoalPrompt("goal.generalPrompt");
                  setLoveSub("");
                  setStep(birthYear && birthMonth && birthDay ? 4 : 1);
                }}
              >{t('calendar.unlockNow', { defaultValue: '立即解鎖' })}</button>
              <button
                className="wizard-cta"
                style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
                onClick={() => {
                  trackEvent("unlock_monthly_dismissed");
                  setShowUnlockMonthly(false);
                }}
              >{t('calendar.unlockLater', { defaultValue: '稍後再說' })}</button>
            </div>
          </div>
        </div>
      )}

      {showSaveChartModal && pendingSave && (
        <div className="wizard-auth-overlay" onClick={() => {}}>
          <div className="wizard-auth-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="wizard-auth-title">
              {t('charts.saveChartTitle', { defaultValue: '儲存此命盤？' })}
            </div>
            <div className="wizard-auth-subtitle">
              {t('charts.saveChartDesc', { defaultValue: '儲存後可以在我的命盤庫隨時回看、追問、做更多分析。不儲存則這次結果只在本次可見。' })}
            </div>
            <input
              className="wizard-auth-input"
              placeholder={t('charts.nameLabel')}
              value={saveChartName}
              onChange={e => setSaveChartName(e.target.value)}
              style={{ marginTop: 8 }}
            />
            {pendingSave.chart.is_primary && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,215,100,0.9)' }}>
                ⭐ {t('charts.firstChartNatal', { defaultValue: '這是你第一張命盤，會自動設為本命盤。之後可在命盤庫切換。' })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="wizard-cta"
                style={{ flex: 1 }}
                onClick={async () => {
                  const name = saveChartName.trim() || t('charts.untitled', { defaultValue: '未命名' });
                  const reading = { ...pendingSave.reading };
                  const chart = { ...pendingSave.chart, name };
                  saveReading(wizardUser, reading);
                  setServerReadings(prev => [reading, ...prev].slice(0, 50));
                  try {
                    await saveChart(wizardUser, chart);
                    const fresh = await loadCharts(wizardUser);
                    setUserCharts(fresh);
                  } catch {}
                  trackEvent("chart_saved", { is_primary: chart.is_primary });
                  setShowSaveChartModal(false);
                  setPendingSave(null);
                }}
              >{t('charts.save', { defaultValue: '儲存' })}</button>
              <button
                className="wizard-cta"
                style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
                onClick={() => {
                  // Discard: neither chart nor reading is kept in the user-
                  // facing stores. The audit DB already has the full record
                  // from handle_fortune, so admins can still see what they
                  // tried.
                  trackEvent("chart_discarded", { goal });
                  setShowSaveChartModal(false);
                  setPendingSave(null);
                }}
              >{t('charts.dontSave', { defaultValue: '不儲存' })}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
