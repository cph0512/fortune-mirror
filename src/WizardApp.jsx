import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import './i18n.js';
import './WizardApp.css';
import { calculateChart, formatChart, formatChartByTianGan } from "./ziwei-calc.js";
import { calculateBazi, formatBazi } from "./bazi-calc.js";
import { calculateAstro, formatAstro } from "./astro-calc.js";
import CITY_COORDS, { findCity, getCityGroups } from "./city-coords.js";
import { calculateTrueSolarTime, formatCorrectionDetails } from "./true-solar-time.js";
import { searchCities } from "./city-search.js";
import FamilyChart from "./FamilyChart.jsx";

const LANG_NAMES = { 'zh-TW': '繁中', en: 'EN', ja: '日本語' };
const LANG_AI = { 'zh-TW': '繁體中文', en: 'English', ja: '日本語' };

// ============================================================
// CONSTANTS
// ============================================================

const IS_TEST = typeof window !== 'undefined' && window.location.hostname === 'test.destinytelling.life';
const API_BACKEND = IS_TEST
  ? "https://fortune-sandbox-352618635098.asia-east1.run.app/api/fortune"
  : "https://fortune-api-64kdjyxhpq-de.a.run.app/api/fortune";
const API_SANDBOX = "https://fortune-sandbox-352618635098.asia-east1.run.app/api";
const API_TRACK = IS_TEST
  ? "https://fortune-sandbox-352618635098.asia-east1.run.app/api/fortune-track"
  : "https://fortune-api-64kdjyxhpq-de.a.run.app/api/fortune-track";
const API_BASE = IS_TEST
  ? "https://fortune-sandbox-352618635098.asia-east1.run.app"
  : "https://fortune-api-64kdjyxhpq-de.a.run.app";
const API_HOROSCOPE = IS_TEST
  ? "https://fortune-sandbox-352618635098.asia-east1.run.app/api/horoscope"
  : "https://bot.velopulse.io/api/horoscope";
const ZODIAC_KEYS = ["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"];
const ZODIAC_ZH = ["牡羊座","金牛座","雙子座","巨蟹座","獅子座","處女座","天秤座","天蠍座","射手座","摩羯座","水瓶座","雙魚座"];
const STORAGE_KEY_KB = "fortune-app-kb";
const KB_VERSION = "20260402d";
const SESSION_KEY_PREFIX = "wizard-session-";
const SESSION_KEY_GUEST = "wizard-session-guest";
const AUTH_KEY = "wizard-auth";
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: user.email, session: data }),
    }).catch(() => {});
  }, 5000);
}

async function loadSessionFromServer(user) {
  if (!user?.email) return null;
  try {
    const res = await fetch(`${API_BASE}/api/fortune-session?user=${encodeURIComponent(user.email)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data && Object.keys(data).length > 1 ? data : null;
  } catch { return null; }
}

function loadSession(user) {
  return loadSessionLocal(user);
}

// Save chat history to server (as part of latest reading)
async function saveChatToServer(user, chatHistory, finalResult, goal, goalPrompt, birthData) {
  if (chatHistory.length === 0) return;
  const userId = user?.email || getVisitorId();
  try {
    const res = await fetch(API_SAVE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: userId,
        time: new Date().toISOString(),
        finalResult: finalResult || "",
        goal: goal || "",
        goalPrompt: goalPrompt ? `${goalPrompt} (chat)` : "chat",
        birthData: birthData || {},
        chat: chatHistory,
        source: "b2c",
      }),
    });
    if (!res.ok) console.error("[saveChatToServer] failed:", res.status);
  } catch (e) { console.error("[saveChatToServer] error:", e); }
}

// ============================================================
// READING HISTORY (server-first, localStorage fallback)
// ============================================================
const API_SAVE = API_BACKEND.replace("/api/fortune", "/api/fortune-save");
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
      const res = await fetch(`${API_SAVE}?user=${encodeURIComponent(user.email)}`);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: userId,
        time: reading.date || new Date().toISOString(),
        finalResult: reading.result || "",
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

const WIZARD_SYSTEM_PROMPT_ZH = `你是「命理三鏡」的命運顧問，用溫暖自然的語氣為一般大眾解讀命運。

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

輸出結構：

[SECTION] 你是這樣的人
（用 3-4 段深入描述核心性格、天賦才華、思維方式和行為模式。要具體到讓人覺得「對！就是我」。不是籠統的「你很聰明」，而是描述具體的性格特質、做事風格、與人相處的方式。包含優勢和需要注意的盲點。）

[SECTION] 你走過的路——過去十年的人生階段
（根據上一個大運的格局，回顧過去這段時間的人生主調。這段時期的重心在哪裡？經歷了什麼樣的成長或挑戰？讓用戶感覺「確實是這樣」，建立信任感。要具體描述這段時期的生活重心、情感狀態、事業走向。）

[SECTION] 你正在經歷的——現在這個人生階段
（根據目前大運的格局，描述現階段的主題和能量走向。跟上一個階段有什麼不同？重心轉移到哪裡？目前的機會和挑戰是什麼？讓用戶理解「為什麼最近感覺不一樣了」。）

[SECTION] [用戶關注的主題]——你的現況與趨勢
（直接告訴用戶目前的狀態、即將發生的變化，具體有畫面感）

[SECTION] ${new Date().getFullYear()} 年重點月份
（哪幾個月是好時機、哪幾個月要小心，直接講結論）

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
今天是 ${new Date().getFullYear()} 年 ${new Date().getMonth()+1} 月 ${new Date().getDate()} 日。用戶說「今年」指 ${new Date().getFullYear()} 年，「明年」指 ${new Date().getFullYear()+1} 年，「後年」指 ${new Date().getFullYear()+2} 年，「去年」指 ${new Date().getFullYear()-1} 年。所有時間相關的分析都必須以此為基準。

語氣：溫暖、直接、有洞察力。正面為主但誠實。不需要加免責聲明。`;

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
  // Safety: if filtering removed too much, send all (quality first)
  if (filtered.length < 20) return kbEntries;
  return filtered;
}

function buildWizardPrompt(kbEntries, goalKey) {
  let prompt = WIZARD_SYSTEM_PROMPT_ZH;
  const filtered = filterKBByGoal(kbEntries, goalKey);

  if (filtered.length > 0) {
    const grouped = {};
    filtered.forEach(e => {
      if (!grouped[e.category]) grouped[e.category] = [];
      grouped[e.category].push(e);
    });
    prompt += "\n\n## 內部知識庫（用於推理，但輸出時不可提及來源）\n";
    for (const [cat, entries] of Object.entries(grouped)) {
      prompt += `\n### ${cat}\n`;
      entries.forEach(e => { prompt += `- **${e.title}**: ${e.content.slice(0, 300)}\n`; });
    }
  }
  return prompt;
}

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

  const [step, setStep] = useState(saved?.finalResult ? (saved.step ?? 0) : 0);
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
  const [rawResults, setRawResults] = useState(saved?.rawResults ?? []);
  const [error, setError] = useState("");

  // 合盤 state (restore from session)
  const [showHeban, setShowHeban] = useState(saved?.showHeban ?? false);
  const [hebanRelation, setHebanRelation] = useState(saved?.hebanRelation ?? "");
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

  // Horoscope state
  const [horoscopeData, setHoroscopeData] = useState(null);
  const [horoscopeLoading, setHoroscopeLoading] = useState(false);
  const [selectedZodiac, setSelectedZodiac] = useState("");
  const [showHoroscopeDetail, setShowHoroscopeDetail] = useState(false);

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
    if (reading.rawResults) setRawResults(reading.rawResults);
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
    }
    setChatHistory(Array.isArray(reading.chat) && reading.chat.length > 0 ? reading.chat : []);
    setHebanResult("");
    setShowHeban(false);
    setDisplayLang(null);
    setTranslatedResults({});
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Fetch KB from server on mount
  useEffect(() => { fetchKB(); }, []);

  // Load readings from server when user changes
  useEffect(() => {
    if (wizardUser?.email) {
      loadReadings(wizardUser).then(readings => setServerReadings(readings));
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
      // 追問
      chatHistory,
    };
    saveSession(sessionData, wizardUser);
  }, [step, gender, goal, goalPrompt, loveSub, birthYear, birthMonth, birthDay, birthHour, birthMinute, birthPlace, birthCity, isTwin, twinOrder, twinType, finalResult, rawResults, hebanResult, hebanRelation, hebanName, hebanGender, hebanYear, hebanMonth, hebanDay, hebanHour, hebanMinute, showHeban, chatHistory, analyzing, hebanAnalyzing, wizardUser]);

  useEffect(() => {
    if (saved?.finalResult && saved.step >= TOTAL_STEPS) {
      setStep(TOTAL_STEPS + 1);
    }
  }, []);

  // Translate horoscope text fields to target language
  const translateHoroscope = async (horoscope, targetLang) => {
    if (!horoscope || targetLang === 'zh-TW') return horoscope;
    const langName = LANG_AI[targetLang] || targetLang;
    const textToTranslate = JSON.stringify({
      summary: horoscope.summary,
      love: horoscope.love?.text,
      career: horoscope.career?.text,
      wealth: horoscope.wealth?.text,
      health: horoscope.health?.text,
      advice: horoscope.advice,
      lucky_color: horoscope.lucky_color,
      lucky_item: horoscope.lucky_item,
    });
    try {
      const res = await fetch(API_BACKEND, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: `Translate the following JSON values to ${langName}. Keep JSON keys unchanged. Only output JSON.`, prompt: textToTranslate, user: wizardUser?.email || "guest" }),
      });
      if (!res.ok) return horoscope;
      const { job_id } = await res.json();
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const poll = await fetch(`${API_BACKEND}/${job_id}`);
        if (!poll.ok) continue;
        const pd = await poll.json();
        if (pd.status === "done") {
          const match = pd.result.match(/\{[\s\S]*\}/);
          if (match) {
            const tr = JSON.parse(match[0]);
            return { ...horoscope, summary: tr.summary || horoscope.summary, love: { ...horoscope.love, text: tr.love || horoscope.love?.text }, career: { ...horoscope.career, text: tr.career || horoscope.career?.text }, wealth: { ...horoscope.wealth, text: tr.wealth || horoscope.wealth?.text }, health: { ...horoscope.health, text: tr.health || horoscope.health?.text }, advice: tr.advice || horoscope.advice, lucky_color: tr.lucky_color || horoscope.lucky_color, lucky_item: tr.lucky_item || horoscope.lucky_item, _lang: targetLang };
          }
        }
      }
    } catch {}
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
    if (s.step !== undefined) setStep(s.step);
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
    if (s.finalResult) { setFinalResult(s.finalResult); setStep(TOTAL_STEPS + 1); }
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
      } catch { setAuthError(t('auth.emailExists')); return; }
      // Also save locally for offline fallback
      const existingUsers = JSON.parse(localStorage.getItem("wizard-users") || "{}");
      existingUsers[authEmail.trim()] = { name: authName.trim(), passwordHash: btoa(authPassword) };
      localStorage.setItem("wizard-users", JSON.stringify(existingUsers));
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
          user = { name: data.name || authEmail.trim(), email: authEmail.trim(), role: data.role };
          // Cache locally
          const existingUsers = JSON.parse(localStorage.getItem("wizard-users") || "{}");
          existingUsers[authEmail.trim()] = { name: data.name, passwordHash: btoa(authPassword) };
          localStorage.setItem("wizard-users", JSON.stringify(existingUsers));
        } else {
          // Fallback to localStorage
          const existingUsers = JSON.parse(localStorage.getItem("wizard-users") || "{}");
          const stored = existingUsers[authEmail.trim()];
          if (!stored) {
            setAuthError(t('auth.notFound'));
            return;
          }
          if (stored.passwordHash !== btoa(authPassword)) {
            setAuthError(t('auth.wrongPassword'));
            return;
          }
          user = { name: stored.name, email: authEmail.trim() };
        }
      } catch {
        // Offline fallback
        const existingUsers = JSON.parse(localStorage.getItem("wizard-users") || "{}");
        const stored = existingUsers[authEmail.trim()];
        if (!stored) { setAuthError(t('auth.notFound')); return; }
        if (stored.passwordHash !== btoa(authPassword)) { setAuthError(t('auth.wrongPassword')); return; }
        user = { name: stored.name, email: authEmail.trim() };
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

      const ziweiChart = formatChart(calculateChart(tstY, tstM, tstD, tstH, tstMin, gender));
      const baziChart = formatBazi(calculateBazi(tstY, tstM, tstD, tstH, gender, tstMin));
      const astroChart = formatAstro(calculateAstro(y, m, d, h, min, cityLat, cityLng));

      // Twin: calculate sibling charts
      let twinZiweiChart = "", twinBaziChart = "", twinAstroChart = "";
      if (isTwin) {
        const sibGender = twinType === "mixed" ? (gender === "男" ? "女" : "男") : gender;
        twinZiweiChart = formatChart(calculateChart(tstY, tstM, tstD, tstH, tstMin, sibGender));
        twinBaziChart = formatBazi(calculateBazi(tstY, tstM, tstD, tstH, sibGender, tstMin));
        twinAstroChart = formatAstro(calculateAstro(y, m, d, h, min, cityLat, cityLng));
      }

      const tstInfo = formatCorrectionDetails(tst);

      const results = [
        { system: "紫微斗數", text: ziweiChart, result: "" },
        { system: "八字", text: baziChart, result: "" },
        { system: "西洋占星", text: astroChart, result: "" },
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

      const oneCallPrompt = `以下是一位用戶的三套命理排盤資料（內部資料，不可對外揭露來源系統）：

【紫微斗數排盤】
${ziweiChart}

===

【八字排盤】
${baziChart}

===

【西洋占星排盤】
${astroChart}${twinChartBlock}

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

⚠️ 嚴格遵守系統規則：不提任何命理系統名稱和專有術語，用自然語言表達所有洞見。
⚠️ 按照指定的輸出格式（天賦特質 → 主題深度解析 → 年運勢 → 建議 → 近期提醒）組織內容。
⚠️ 重點針對用戶關注的「${goalTextZh}${loveSubTextZh ? `（${loveSubTextZh}）` : ""}」方向深入分析。
⚠️ 絕對不可假設或猜測用戶的職業、行業、家庭狀況、生活背景。你只知道用戶提供的出生資料，不知道其他任何事。描述特質和建議時要保持中立通用，例如說「你適合需要統籌協調的領域」而不是「你適合供應鏈管理」。${twinTaskBlock}
⚠️ 你必須用「${LANG_AI[currentLang] || '繁體中文'}」撰寫整份報告。所有標題、內容、建議都必須使用「${LANG_AI[currentLang] || '繁體中文'}」。`;

      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: wizardSP, prompt: oneCallPrompt, visitor_id: getVisitorId(), user: wizardUser?.email || null, notify_email: wizardUser?.email || "" }),
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
            saveReading(wizardUser, newReading);
            setServerReadings(prev => [newReading, ...prev].slice(0, 50));
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
    setChatHistory(prev => [...prev, { role: "user", text: question }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const kbEntries = loadKB();
      const wizardSP = buildWizardPrompt(kbEntries, goal);
      const recentChat = chatHistory.slice(-10).map(m => `${m.role === "user" ? "問" : "答"}：${m.text}`).join("\n");
      // Build raw chart data block for accurate follow-up
      const chartBlock = rawResults.filter(r => r.text).map(r => `【${r.system}排盤資料】\n${r.text}`).join("\n\n===\n\n");
      const hebanBlock = hebanResult ? `\n\n===== 合盤分析報告（${hebanName || '對方'}，${t(hebanRelation) || ''}）=====\n${hebanResult}` : "";
      const prompt = `${chartBlock ? `===== 原始排盤資料（精確數據，以此為準）=====\n${chartBlock}\n\n===== 分析報告 =====\n` : ""}之前的完整分析報告：\n${finalResult}${hebanBlock}\n\n${recentChat ? `對話紀錄：\n${recentChat}\n\n` : ""}用戶追問：${question}\n\n⚠️ 回答規則：\n1. 不提任何命理系統名稱和專有術語，用自然語言回覆\n2. 追問細節時，優先根據原始排盤資料中的宮位、飛化、星曜組合、四柱十神、行星相位進行深度推論，給出具體而非籠統的回答\n3. 排盤資料是精確計算的結果，必須以此為依據，不可編造或猜測命盤中不存在的星曜、宮位、相位\n4. 如果問題涉及時間點，要具體到年份或時期\n5. 如果問題涉及兩人關係，必須參考合盤分析報告的內容\n6. 你必須用「${LANG_AI[currentLang] || '繁體中文'}」回覆`;
      const isDeep = /大運|流年|逐月|十年|運勢走向|life phase|month.by.month/i.test(question);
      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: wizardSP, prompt, analysis_type: isDeep ? "deep" : "general", visitor_id: getVisitorId(), user: wizardUser?.email || null }),
      });
      if (!submitRes.ok) throw new Error(t('result.chatError'));
      const { job_id } = await submitRes.json();
      for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
        if (!pollRes.ok) continue;
        const data = await pollRes.json();
        if (data.status === "done") {
          const newChat = [...chatHistory, { role: "user", text: question }, { role: "assistant", text: data.result }];
          setChatHistory(prev => [...prev, { role: "assistant", text: data.result }]);
          // Save chat to server
          saveChatToServer(wizardUser, newChat, finalResult, goal, goalPrompt,
            { year: birthYear, month: birthMonth, day: birthDay, hour: birthHour, minute: birthMinute, place: birthPlace });
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
      const kbEntries = loadKB();

      const myZiwei = rawResults.find(r => r.system === "紫微斗數");
      const myCharts = myZiwei ? `【紫微斗數】\n${myZiwei.text}` : "";

      const partnerGender = hebanGender || (gender === "男" ? "女" : "男");
      let partnerCharts = "";

      if (hasPartnerTime) {
        const pZiwei = formatChart(calculateChart(y2, m2, d2, h2, 0, partnerGender));
        partnerCharts = `【紫微斗數】\n${pZiwei}`;
      } else {
        const tianGanChart = formatChartByTianGan(y2, m2, d2, partnerGender);
        partnerCharts = tianGanChart;
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

## 任務
請根據兩人的紫微斗數命盤分析這兩人作為「${hebanRelationZh}」的關係。
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
        body: JSON.stringify({ images: [], system: sp, prompt: hebanPrompt, visitor_id: getVisitorId(), user: wizardUser?.email || null }),
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
        <div key={i} className="wizard-section">
          {sec.title && (
            <div className="wizard-section-header">
              <span className="wizard-section-title">{sec.title}</span>
            </div>
          )}
          {mainBody && <div className="wizard-section-body">{mainBody}</div>}
          {summary && <div className="wizard-section-summary">{summary}</div>}
        </div>
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
                fetch(`${API_BASE}/api/fortune-session?user=${encodeURIComponent(wizardUser.email)}`, { method: "DELETE" }).catch(() => {});
              }
              setWizardUser(null);
              localStorage.removeItem(AUTH_KEY);
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
          </div>

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
                        <div key={fname} className="wizard-dashboard-card" onClick={() => setShowFamily(true)} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{fname}</div>
                          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                            {memberCount > 0 ? `${memberCount} ${t('family.members', { defaultValue: '位成員' })}` : ''}
                            {protoName ? ` · ${t('family.protagonist', { defaultValue: '主角' })}：${protoName}` : ''}
                          </div>
                          {saves.length > 1 && (
                            <div style={{ fontSize: 12, color: 'rgba(160,140,255,0.6)', marginTop: 4 }}>{saves.length} {t('family.analyses', { defaultValue: '次分析' })}</div>
                          )}
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

          {/* Dashboard — past readings */}
          {(() => {
            const readings = serverReadings;
            if (readings.length === 0) return null;
            return (
              <div className="wizard-dashboard">
                <div className="wizard-dashboard-title">{t('history.pastReadings', { count: readings.length })}</div>
                <div className="wizard-dashboard-list">
                  {readings.map((r, i) => (
                    <div key={r.id || r.time || i} className="wizard-dashboard-card" onClick={() => restoreReading(r)}>
                      <div className="wizard-dashboard-card-date">{new Date(r.date || r.time).toLocaleDateString()}</div>
                      <div className="wizard-dashboard-card-title">{(() => {
                        const raw = r.goalPrompt || r.goal || '';
                        if (!raw) return t('history.analysis');
                        if (raw.startsWith('goal.')) return t(raw);
                        if (raw === 'family') return t('family.chartTitle');
                        return raw;
                      })()}</div>
                      <div className="wizard-dashboard-card-birth">{typeof r.birth === 'string' ? r.birth : (r.birthData ? `${r.birthData.year}/${r.birthData.month}/${r.birthData.day}` : '')}</div>
                      {r.monthHighlights?.length > 0 && (
                        <div className="wizard-history-months">
                          {Array.from({ length: 12 }, (_, mi) => {
                            const found = r.monthHighlights.find(h => h.month === mi + 1);
                            return <div key={mi} className={`wizard-history-month-dot ${found?.tone || ""}`} />;
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
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
  const renderGoal = () => (
    <div className="wizard-content">
      <div className="wizard-question">{goal === "goal.love" && loveSub === "" ? t('goal.loveStatus') : t('goal.question')}</div>
      <div className="wizard-subtitle">{goal === "goal.love" && loveSub === "" ? t('goal.loveStatusSub') : t('goal.subtitle')}</div>
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
        ) : (
          GOALS.map(g => (
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
        )}
      </div>
    </div>
  );

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
          <div className="wizard-question" style={{ marginBottom: 12 }}>{t('result.title')}</div>

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

          {/* Month Quick Reference — only for 流年/monthly analysis */}
          {(() => {
            const isMonthlyAnalysis = /流年|逐月|月份|每月|month.by.month|monthly|year.*forecast|月別/i.test(displayResult);
            if (!isMonthlyAnalysis) return null;
            const highlights = parseMonthHighlights(displayResult);
            if (highlights.length === 0) return null;
            const year = new Date().getFullYear();
            const allMonths = Array.from({ length: 12 }, (_, i) => {
              const found = highlights.find(h => h.month === i + 1);
              return { month: i + 1, tone: found?.tone || "default", description: found?.description || "" };
            });
            const toneColors = { positive: "#4caf50", caution: "#ff9800", neutral: "#90caf9", default: "rgba(255,255,255,0.1)" };
            const toneLabels = { positive: t('calendar.good'), caution: "!", neutral: "", default: "" };
            const monthNames = t('calendar.months', { returnObjects: true });
            return (
              <div className="wizard-month-overview">
                <div className="wizard-month-overview-title">{t('calendar.title', { year })}</div>
                <div className="wizard-month-grid">
                  {allMonths.map(m => (
                    <div key={m.month}
                      className={`wizard-month-cell ${m.tone}`}
                      title={m.description}
                      style={{ borderBottom: `3px solid ${toneColors[m.tone]}` }}>
                      <span className="wizard-month-num">{monthNames[m.month - 1]}</span>
                      {toneLabels[m.tone] && <span className="wizard-month-badge">{toneLabels[m.tone]}</span>}
                    </div>
                  ))}
                </div>
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
              setStep(0); setFinalResult(""); setRawResults([]); setChatHistory([]); setLoveSub("");
              setShowHeban(false); setHebanResult(""); setHebanRelation(""); setHebanName("");
              setHebanYear(""); setHebanMonth(""); setHebanDay(""); setHebanHour(""); setHebanGender("");
            }}>
              {t('result.newReading')}
            </button>
            <button className="wizard-result-btn secondary" onClick={onBack}>
              {t('result.backHome')}
            </button>
          </div>

          {/* Past Readings History */}
          {(() => {
            const readings = serverReadings;
            if (readings.length <= 1) return null;
            return (
              <>
                <button className="wizard-history-btn" onClick={() => {
                  const panel = document.getElementById("wizard-history-panel");
                  if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
                }}>
                  {t('history.pastReadings', { count: readings.length })}
                </button>
                <div id="wizard-history-panel" className="wizard-history-panel" style={{ display: "none" }}>
                  {readings.map((r, i) => (
                    <div key={r.id || r.time || i} className="wizard-history-card" onClick={() => restoreReading(r)}>
                      <div className="wizard-history-card-date">{new Date(r.date || r.time).toLocaleDateString()}</div>
                      <div className="wizard-history-card-title">{r.goalPrompt || r.goal || t('history.analysis')} — {typeof r.birth === 'string' ? r.birth : ''}</div>
                      {r.monthHighlights?.length > 0 && (
                        <div className="wizard-history-months">
                          {Array.from({ length: 12 }, (_, mi) => {
                            const found = r.monthHighlights.find(h => h.month === mi + 1);
                            return <div key={mi} className={`wizard-history-month-dot ${found?.tone || ""}`} />;
                          })}
                        </div>
                      )}
                    </div>
                  ))}
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

          {/* Chat follow-up */}
          <div style={{ height: 32 }} />
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
              <div className="wizard-chat-messages">
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
                  const res = await fetch(API_BACKEND.replace("/api/fortune", "/api/fortune-users"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "reset_password", username: email, password: "fortune2026" }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setAuthError(t('auth.resetSent'));
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
    </div>
  );
}
