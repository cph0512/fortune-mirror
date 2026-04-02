import { useState, useRef, useEffect } from "react";
import './WizardApp.css';
import { calculateChart, formatChart, formatChartByTianGan } from "./ziwei-calc.js";
import { calculateBazi, formatBazi } from "./bazi-calc.js";
import { calculateAstro, formatAstro } from "./astro-calc.js";

// ============================================================
// CONSTANTS
// ============================================================

const API_BACKEND = "https://bot.velopulse.io/api/fortune";
const STORAGE_KEY_KB = "fortune-app-kb";
const KB_VERSION = "20260401b";
const SESSION_KEY_PREFIX = "wizard-session-";
const SESSION_KEY_GUEST = "wizard-session-guest";
const AUTH_KEY = "wizard-auth";

function sessionKey(user) {
  return user?.email ? `${SESSION_KEY_PREFIX}${user.email}` : SESSION_KEY_GUEST;
}
function saveSession(data, user) {
  try { localStorage.setItem(sessionKey(user), JSON.stringify(data)); } catch {}
}
function loadSession(user) {
  try { const d = localStorage.getItem(sessionKey(user)); return d ? JSON.parse(d) : null; } catch { return null; }
}
function clearSession(user) {
  try { localStorage.removeItem(sessionKey(user)); } catch {}
}
function migrateGuestSession(user) {
  // Move guest session to user session after registration
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

function loadKB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_KB);
    const savedVer = localStorage.getItem("fortune-kb-version");
    if (raw && savedVer === KB_VERSION) return JSON.parse(raw);
  } catch {}
  return [];
}

const GOALS = [
  { text: "感情與姻緣", prompt: "感情、姻緣、桃花、婚姻、另一半", hasSub: true },
  { text: "事業與升遷", prompt: "事業、工作、升遷、職涯方向、貴人" },
  { text: "財富與投資", prompt: "財運、投資、理財、收入、財庫" },
  { text: "健康與養生", prompt: "健康、身體、養生、需注意的部位" },
  { text: "全面綜合分析", prompt: "全面性格、事業、感情、財運、健康、今年運勢" },
];

const LOVE_SUBS = [
  { text: "未婚／單身", prompt: "感情、姻緣、桃花、戀愛、交往對象、何時遇到對的人" },
  { text: "已婚／穩定交往中", prompt: "婚姻、夫妻關係、感情經營、另一半互動、婚後挑戰" },
];

const RELATIONS = [
  { text: "情人 / 曖昧對象" },
  { text: "同事 / 上下屬" },
  { text: "朋友" },
  { text: "家人" },
];

const HEBAN_SYSTEM_PROMPT = `你是「命理三鏡」的關係分析師。

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

[SECTION] 2026 年兩人關係走向
（今年這段關係的趨勢和關鍵時間點）

[SECTION] 相處建議
（具體可行的互動建議）

日期規則：
所有日期一律使用國曆（西元）。提到農曆月份時必須用括號標註國曆對照，例如「農曆三月（國曆4月中旬）」。

一致性原則：
分析必須嚴格基於排盤資料。相同排盤資料的核心結論必須一致。

中立原則：不可假設兩人的職業、行業、生活背景。
語氣：溫暖有洞察力，正面為主但誠實，具體有畫面感。`;

const LOADING_MSGS = [
  "正在解讀你的命運密碼...",
  "分析你的個人能量場...",
  "推算今年的運勢走向...",
  "尋找你的天賦與潛能...",
  "比對多重命理維度...",
  "計算流年能量變化...",
  "描繪你的命運藍圖...",
  "綜合分析即將完成...",
];

const WIZARD_SYSTEM_PROMPT = `你是「命理三鏡」的命運顧問，用溫暖自然的語氣為一般大眾解讀命運。

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
（用 2-3 段生動描述性格亮點和天賦，讓人覺得「對！就是我」）

[SECTION] [用戶關注的主題]——你的現況與趨勢
（直接告訴用戶目前的狀態、即將發生的變化，具體有畫面感）

[SECTION] 2026 年重點月份
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

語氣：溫暖、直接、有洞察力。正面為主但誠實。不需要加免責聲明。`;

function buildWizardPrompt(kbEntries, goalObj) {
  let prompt = WIZARD_SYSTEM_PROMPT;
  if (kbEntries.length > 0) {
    const grouped = {};
    kbEntries.forEach(e => {
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

const TOTAL_STEPS = 5; // welcome, goal, birthday+time, place, confirm

export default function WizardApp({ auth, onBack, onLogout }) {
  // Load auth first, then restore the correct user's session
  const savedAuth = loadAuth();
  const saved = loadSession(savedAuth);

  const [step, setStep] = useState(saved?.step ?? 0);
  const [gender, setGender] = useState(saved?.gender ?? "");
  const [goal, setGoal] = useState(saved?.goal ?? "");
  const [goalPrompt, setGoalPrompt] = useState(saved?.goalPrompt ?? "");
  const [loveSub, setLoveSub] = useState(saved?.loveSub ?? "");
  const [birthYear, setBirthYear] = useState(saved?.birthYear ?? "");
  const [birthMonth, setBirthMonth] = useState(saved?.birthMonth ?? "");
  const [birthDay, setBirthDay] = useState(saved?.birthDay ?? "");
  const [birthHour, setBirthHour] = useState(saved?.birthHour ?? "");
  const [birthMinute, setBirthMinute] = useState(saved?.birthMinute ?? "0");
  const [birthPlace, setBirthPlace] = useState(saved?.birthPlace ?? "桃園");

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [finalResult, setFinalResult] = useState(saved?.finalResult ?? "");
  const [rawResults, setRawResults] = useState(saved?.rawResults ?? []);
  const [error, setError] = useState("");

  // 合盤 state
  const [showHeban, setShowHeban] = useState(false);
  const [hebanRelation, setHebanRelation] = useState("");
  const [hebanName, setHebanName] = useState("");
  const [hebanYear, setHebanYear] = useState("");
  const [hebanMonth, setHebanMonth] = useState("");
  const [hebanDay, setHebanDay] = useState("");
  const [hebanHour, setHebanHour] = useState("");
  const [hebanMinute, setHebanMinute] = useState("0");
  const [hebanGender, setHebanGender] = useState("");
  const [hebanAnalyzing, setHebanAnalyzing] = useState(false);
  const [hebanResult, setHebanResult] = useState(saved?.hebanResult ?? "");

  // Chat state
  const [chatHistory, setChatHistory] = useState(saved?.chatHistory ?? []);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showQuickQ, setShowQuickQ] = useState(true);
  const chatEndRef = useRef(null);
  const hebanRef = useRef(null);

  // Auth state (local registration)
  const [wizardUser, setWizardUser] = useState(savedAuth);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // "login" or "register"
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const pendingActionRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Save session to localStorage whenever key state changes (per-user)
  useEffect(() => {
    // Don't save while analyzing (transient state)
    if (analyzing || hebanAnalyzing) return;
    const sessionData = {
      step, gender, goal, goalPrompt, loveSub,
      birthYear, birthMonth, birthDay, birthHour, birthMinute, birthPlace,
      finalResult, rawResults, hebanResult, chatHistory,
    };
    saveSession(sessionData, wizardUser);
  }, [step, gender, goal, goalPrompt, loveSub, birthYear, birthMonth, birthDay, birthHour, birthMinute, birthPlace, finalResult, rawResults, hebanResult, chatHistory, analyzing, hebanAnalyzing, wizardUser]);

  // If session had a result, jump to result screen on mount
  useEffect(() => {
    if (saved?.finalResult && saved.step >= TOTAL_STEPS) {
      setStep(TOTAL_STEPS + 1);
    }
  }, []);

  // Auth gate: if not logged in, show modal; if logged in, run callback
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

  // Helper: restore state from a session object
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
    if (s.hebanResult) setHebanResult(s.hebanResult);
    if (s.chatHistory) setChatHistory(s.chatHistory);
  };

  const handleAuthSubmit = () => {
    let user;
    if (authMode === "register") {
      if (!authName.trim() || !authEmail.trim() || !authPassword.trim()) {
        setAuthError("請填寫所有欄位");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail)) {
        setAuthError("Email 格式不正確");
        return;
      }
      if (authPassword.length < 6) {
        setAuthError("密碼至少 6 個字元");
        return;
      }
      // Check if email already registered
      const existingUsers = JSON.parse(localStorage.getItem("wizard-users") || "{}");
      if (existingUsers[authEmail.trim()]) {
        setAuthError("此 Email 已註冊，請登入");
        setAuthMode("login");
        return;
      }
      user = { name: authName.trim(), email: authEmail.trim() };
      // Save user credentials
      existingUsers[authEmail.trim()] = { name: authName.trim(), passwordHash: btoa(authPassword) };
      localStorage.setItem("wizard-users", JSON.stringify(existingUsers));
      // Migrate current guest session to this user
      migrateGuestSession(user);
    } else {
      // Login — verify email + password
      if (!authEmail.trim() || !authPassword.trim()) {
        setAuthError("請填寫 Email 和密碼");
        return;
      }
      const existingUsers = JSON.parse(localStorage.getItem("wizard-users") || "{}");
      const stored = existingUsers[authEmail.trim()];
      if (!stored) {
        setAuthError("找不到此帳號，請先註冊");
        return;
      }
      if (stored.passwordHash !== btoa(authPassword)) {
        setAuthError("密碼不正確");
        return;
      }
      user = { name: stored.name, email: authEmail.trim() };
      // Restore user's session if exists
      const existingSession = loadSession(user);
      if (existingSession?.finalResult) {
        restoreFromSession(existingSession);
      }
    }

    setWizardUser(user);
    saveAuth(user);
    setAuthPassword("");
    setShowAuthModal(false);
    setAuthError("");

    // Run pending action
    if (pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      setTimeout(() => action(), 100);
    }
  };

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
    setStep(TOTAL_STEPS); // loading screen
    setAnalyzing(true);
    setError("");
    setFinalResult("");
    setRawResults([]);

    let msgIdx = 0;
    setLoadingMsg(LOADING_MSGS[0]);
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MSGS.length;
      setLoadingMsg(LOADING_MSGS[msgIdx]);
    }, 3000);

    try {
      const y = parseInt(birthYear), m = parseInt(birthMonth), d = parseInt(birthDay);
      const h = parseInt(birthHour) || 0;
      const min = parseInt(birthMinute) || 0;
      const kbEntries = loadKB();

      // Step 1: 本地排盤（瞬間完成，不需 API）
      setLoadingMsg("正在解讀你的命運密碼...");
      const ziweiChart = formatChart(calculateChart(y, m, d, h, 0, gender));
      const baziChart = formatBazi(calculateBazi(y, m, d, h, gender));
      const astroChart = formatAstro(calculateAstro(y, m, d, h, min, 24.9936, 121.3130));

      // 保存排盤資料供合盤用
      setRawResults([
        { system: "紫微斗數", text: ziweiChart, result: "" },
        { system: "八字", text: baziChart, result: "" },
        { system: "西洋占星", text: astroChart, result: "" },
      ]);

      // Step 2: 一次 API call — 直接送三套排盤 + 統一輸出
      setLoadingMsg("深度分析你的個人能量...");
      const wizardSP = buildWizardPrompt(kbEntries, goal);
      const oneCallPrompt = `以下是一位用戶的三套命理排盤資料（內部資料，不可對外揭露來源系統）：

【紫微斗數排盤】
${ziweiChart}

===

【八字排盤】
${baziChart}

===

【西洋占星排盤】
${astroChart}

## 用戶資料
- 性別：${gender}
- 出生：${birthYear}年${birthMonth}月${birthDay}日 ${h}時${min}分
- 出生地：${birthPlace}
- 關注方向：${goal}${loveSub ? `（${loveSub}）` : ""}

## 任務
請綜合以上三套排盤資料，直接產出一份統一的命理報告。
你需要自己解讀排盤資料、找出格局和重點，然後整合成報告。

## 三系統權重
以紫微斗數為主軸（佔50%），八字為輔證（佔30%），西洋占星為補充（佔20%）。
具體做法：先從紫微斗數的命盤格局、四化飛化、大限流年建立核心結論，再用八字的四柱十神大運來驗證和補充紫微的判斷，最後用占星的行星相位宮位提供額外維度。
三套排盤的結論必須交叉驗證：共鳴點重點強調，矛盾處以紫微為準、八字為輔判。這是我們的核心分析方法。

⚠️ 嚴格遵守系統規則：不提任何命理系統名稱和專有術語，用自然語言表達所有洞見。
⚠️ 按照指定的輸出格式（天賦特質 → 主題深度解析 → 年運勢 → 建議 → 近期提醒）組織內容。
⚠️ 重點針對用戶關注的「${goal}${loveSub ? `（${loveSub}）` : ""}」方向深入分析。
⚠️ 絕對不可假設或猜測用戶的職業、行業、家庭狀況、生活背景。你只知道用戶提供的出生資料，不知道其他任何事。描述特質和建議時要保持中立通用，例如說「你適合需要統籌協調的領域」而不是「你適合供應鏈管理」。`;

      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: wizardSP, prompt: oneCallPrompt }),
      });
      if (!submitRes.ok) throw new Error("分析失敗");
      const { job_id } = await submitRes.json();

      setLoadingMsg("描繪你的命運藍圖...");
      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
          if (!pollRes.ok) continue;
          const data = await pollRes.json();
          if (data.status === "done") {
            setFinalResult(data.result);
            break;
          }
        } catch { continue; }
      }

      setAnalyzing(false);
      setLoadingMsg("");
      setStep(TOTAL_STEPS + 1); // result screen
    } catch (err) {
      setError("分析過程發生錯誤：" + err.message);
      setAnalyzing(false);
    } finally {
      clearInterval(interval);
    }
  };

  const sendChat = async (question) => {
    if (!question.trim() || chatLoading) return;
    setShowQuickQ(false);
    setChatHistory(prev => [...prev, { role: "user", text: question }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const kbEntries = loadKB();
      const wizardSP = buildWizardPrompt(kbEntries, goal);
      const recentChat = chatHistory.slice(-6).map(m => `${m.role === "user" ? "問" : "答"}：${m.text}`).join("\n");
      const prompt = `之前的分析報告：\n${finalResult.slice(0, 2000)}\n\n${recentChat ? `對話紀錄：\n${recentChat}\n\n` : ""}用戶追問：${question}\n\n⚠️ 回答時嚴格遵守規則：不提任何命理系統名稱和專有術語，用自然語言回覆。`;
      // Deep analysis for 大運/流年 questions → Opus; others → Sonnet
      const isDeep = /大運|流年|逐月|十年|運勢走向/.test(question);
      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: wizardSP, prompt, analysis_type: isDeep ? "deep" : "general" }),
      });
      if (!submitRes.ok) throw new Error("送出失敗");
      const { job_id } = await submitRes.json();
      for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
        if (!pollRes.ok) continue;
        const data = await pollRes.json();
        if (data.status === "done") {
          setChatHistory(prev => [...prev, { role: "assistant", text: data.result }]);
          break;
        }
      }
    } catch (e) {
      setChatHistory(prev => [...prev, { role: "assistant", text: "抱歉，回覆失敗：" + e.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ---- 合盤分析 ----
  const startHeban = async () => {
    setHebanAnalyzing(true);
    setHebanResult("");
    setError("");

    let msgIdx = 0;
    setLoadingMsg("正在解讀兩人的緣分密碼...");
    const interval = setInterval(() => {
      const msgs = ["分析兩人的能量互動...", "比對命運交會點...", "推算關係走向...", "描繪你們的緣分藍圖..."];
      msgIdx = (msgIdx + 1) % msgs.length;
      setLoadingMsg(msgs[msgIdx]);
    }, 3000);

    try {
      const y1 = parseInt(birthYear), m1 = parseInt(birthMonth), d1 = parseInt(birthDay);
      const h1 = parseInt(birthHour) || 0, min1 = parseInt(birthMinute) || 0;
      const y2 = parseInt(hebanYear), m2 = parseInt(hebanMonth), d2 = parseInt(hebanDay);
      const h2 = parseInt(hebanHour) || 12, min2 = parseInt(hebanMinute) || 0;
      const hasPartnerTime = hebanHour !== "";
      const kbEntries = loadKB();

      // 用戶自己的紫微排盤（合盤只用紫微）
      const myZiwei = rawResults.find(r => r.system === "紫微斗數");
      const myCharts = myZiwei ? `【紫微斗數】\n${myZiwei.text}` : "";

      // 對方紫微排盤
      const partnerGender = hebanGender || (gender === "男" ? "女" : "男");
      let partnerCharts = "";

      if (hasPartnerTime) {
        // 有出生時間：完整紫微排盤
        const pZiwei = formatChart(calculateChart(y2, m2, d2, h2, 0, partnerGender));
        partnerCharts = `【紫微斗數】\n${pZiwei}`;
      } else {
        // 沒有出生時間：用天干推算宮位影響（不硬套時辰）
        const tianGanChart = formatChartByTianGan(y2, m2, d2, partnerGender);
        partnerCharts = tianGanChart;
      }

      const hebanPrompt = `以下是兩個人的命理資料（內部資料，不可對外揭露來源系統）：

## 本人
- 性別：${gender}
- 出生：${birthYear}年${birthMonth}月${birthDay}日 ${h1}時${min1}分
- 出生地：${birthPlace}

${myCharts}

## 對方（${hebanName || "對方"}）
- 關係：${hebanRelation}
- 性別：${partnerGender}
- 出生：${hebanYear}年${hebanMonth}月${hebanDay}日${hasPartnerTime ? ` ${h2}時${min2}分` : "（未知出生時間）"}
${hasPartnerTime ? "（有完整出生時間，可做完整飛化交叉分析）" : "（無出生時間，以生年天干四化和主星分佈推算宮位影響，命宮位置不確定）"}

${partnerCharts}

## 任務
請根據兩人的紫微斗數命盤分析這兩人作為「${hebanRelation}」的關係。
${hasPartnerTime
  ? "重點分析：雙方命盤的宮位飛化互動、四化交叉影響、主星搭配的互補或衝突。"
  : "對方無出生時間，請以對方的生年天干四化為核心，分析其四化星落入哪些宮位的主星、這些能量如何與本人的命盤產生互動。重點看生年四化的祿忌落宮與本人的對應宮位關係。"}

⚠️ 嚴格遵守規則：不提任何命理系統名稱和專有術語。
⚠️ 用自然語言描述兩人的互動與緣分。
⚠️ 按照指定輸出格式。`;

      let sp = HEBAN_SYSTEM_PROMPT;
      if (kbEntries.length > 0) {
        sp += "\n\n## 內部知識庫（推理用，不可對外提及）\n";
        kbEntries.forEach(e => { sp += `- ${e.title}: ${e.content.slice(0, 200)}\n`; });
      }

      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: sp, prompt: hebanPrompt }),
      });
      if (!submitRes.ok) throw new Error("合盤分析送出失敗");
      const { job_id } = await submitRes.json();

      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
          if (!pollRes.ok) continue;
          const data = await pollRes.json();
          if (data.status === "done") {
            setHebanResult(data.result);
            break;
          }
        } catch { continue; }
      }
    } catch (err) {
      setError("合盤分析錯誤：" + err.message);
    } finally {
      setHebanAnalyzing(false);
      setLoadingMsg("");
      clearInterval(interval);
    }
  };

  // ---- RESULT RENDERER ----
  const renderFormattedResult = (text) => {
    if (!text) return null;

    // Aggressively clean markdown and emoji
    let cleaned = text
      .replace(/^#{1,6}\s*/gm, '')           // # headers
      .replace(/\*\*([^*]+)\*\*/g, '$1')     // **bold** → text
      .replace(/\*([^*]+)\*/g, '$1')         // *italic* → text
      .replace(/__([^_]+)__/g, '$1')         // __bold__
      .replace(/_([^_]+)_/g, '$1')           // _italic_
      .replace(/```[\s\S]*?```/g, '')        // code blocks
      .replace(/`([^`]+)`/g, '$1')           // inline code
      .replace(/^\|.*\|$/gm, '')             // table rows
      .replace(/^[-|:]+$/gm, '')             // table separators
      .replace(/^>\s*/gm, '')                // blockquotes
      .replace(/^[-*+]\s+/gm, '')            // list bullets
      .replace(/^\d+\.\s+/gm, '')            // numbered lists
      // Remove all emoji/emoticons
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{2702}-\u{27B0}\u{200D}\u{20E3}\u{FE0F}\u{E0020}-\u{E007F}✦✧★☆♠♣♥♦⚡❌✅✓✔❤️‍♀️♂️☀️☁️⭐️❄️☯️⚠️]/gu, '')
      .replace(/\n{3,}/g, '\n\n')            // collapse multiple blank lines
      .trim();

    // Normalize all [SECTION] variants before splitting
    cleaned = cleaned
      .replace(/【\s*SECTION\s*】/gi, '[SECTION]')           // 【SECTION】
      .replace(/\[\s*SECTION\s*\]\s*[:：\-—]/gi, '[SECTION]') // [SECTION]: or [SECTION]—
      .replace(/\[\s*SECTION\s*\]/gi, '[SECTION]')           // [ SECTION ] with extra spaces

    // Split by [SECTION] markers
    const parts = cleaned.split(/\[SECTION\]\s*/);
    const sections = [];

    // Helper: strip any leftover [SECTION]-like text from content
    const cleanSectionTags = (s) => s
      .replace(/\[?\s*SECTION\s*\]?\s*[:：\-—]?\s*/gi, '')
      .replace(/【\s*SECTION\s*】\s*/gi, '')
      .trim();

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // First line is the title, rest is body
      const lines = trimmed.split('\n');
      const title = cleanSectionTags(lines[0].trim());
      const body = cleanSectionTags(lines.slice(1).join('\n').trim());

      if (body) {
        sections.push({ title, body });
      } else if (sections.length === 0) {
        // Intro text before any section
        sections.push({ title: "", body: title });
      } else {
        // Title with no body
        sections.push({ title, body: "" });
      }
    }

    // Fallback: if no [SECTION] tags found, try splitting by blank-line-separated paragraphs with a leading title-like line
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
      // Auto-detect summary: last sentence of each section body
      let mainBody = sec.body || "";
      let summary = "";
      // Check for explicit markers first
      const explicitMatch = mainBody.match(/[【\[](?:總結|小結|結論|重點)[】\]]\s*[:：]?\s*([\s\S]*?)$/);
      if (explicitMatch) {
        summary = explicitMatch[1].trim();
        mainBody = mainBody.slice(0, explicitMatch.index).trim();
      } else if (mainBody.length > 100) {
        // Auto-extract: last line as summary if body is long enough
        const lines = mainBody.trim().split('\n').filter(l => l.trim());
        if (lines.length >= 3) {
          const lastLine = lines[lines.length - 1].trim();
          // Only use as summary if it looks like a concluding sentence (short, not a question)
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

  // Step 0: Welcome + gender
  const renderWelcome = () => (
    <div className="wizard-welcome">
      <div className="wizard-welcome-icon wizard-diamond"></div>
      <h1>命理三鏡</h1>
      <p className="tagline">探索你的命運密碼</p>

      {wizardUser ? (
        <>
          <div className="wizard-user-greeting">
            {wizardUser.name}，歡迎回來
            <button className="wizard-logout-link" onClick={() => {
              setWizardUser(null);
              localStorage.removeItem(AUTH_KEY);
              // Reset to clean state
              setStep(0); setGender(""); setGoal(""); setGoalPrompt("");
              setBirthYear(""); setBirthMonth(""); setBirthDay(""); setBirthHour(""); setBirthMinute("0");
              setBirthPlace("桃園"); setFinalResult(""); setRawResults([]); setHebanResult("");
              setChatHistory([]); setShowHeban(false);
            }}>登出</button>
          </div>
          <div className="wizard-question">我是...</div>
          <div className="wizard-gender-cards">
            <div className={`wizard-gender-card ${gender === "男" ? "selected" : ""}`} onClick={() => { setGender("男"); setTimeout(() => setStep(1), 300); }}>
              <div className="wizard-gender-icon">M</div>
              <div className="wizard-gender-label"><span>男生</span><span>›</span></div>
            </div>
            <div className={`wizard-gender-card ${gender === "女" ? "selected" : ""}`} onClick={() => { setGender("女"); setTimeout(() => setStep(1), 300); }}>
              <div className="wizard-gender-icon">F</div>
              <div className="wizard-gender-label"><span>女生</span><span>›</span></div>
            </div>
          </div>
        </>
      ) : (
        <div className="wizard-welcome-auth">
          {/* Guest try-first section */}
          <div className="wizard-question" style={{ fontSize: 20, marginBottom: 16 }}>直接開始體驗</div>
          <div className="wizard-gender-cards">
            <div className={`wizard-gender-card ${gender === "男" ? "selected" : ""}`} onClick={() => { setGender("男"); setTimeout(() => setStep(1), 300); }}>
              <div className="wizard-gender-icon">M</div>
              <div className="wizard-gender-label"><span>男生</span><span>›</span></div>
            </div>
            <div className={`wizard-gender-card ${gender === "女" ? "selected" : ""}`} onClick={() => { setGender("女"); setTimeout(() => setStep(1), 300); }}>
              <div className="wizard-gender-icon">F</div>
              <div className="wizard-gender-label"><span>女生</span><span>›</span></div>
            </div>
          </div>
          <div className="wizard-guest-note">免費排盤一次，進階功能需註冊</div>

          <div className="wizard-welcome-divider">
            <span>已有帳號？</span>
          </div>

          {/* Login/Register form */}
          <div className="wizard-welcome-auth-card">
            <div className="wizard-welcome-auth-tabs">
              <button className={`wizard-welcome-auth-tab ${authMode === "login" ? "active" : ""}`}
                onClick={() => { setAuthMode("login"); setAuthError(""); }}>登入</button>
              <button className={`wizard-welcome-auth-tab ${authMode === "register" ? "active" : ""}`}
                onClick={() => { setAuthMode("register"); setAuthError(""); }}>註冊</button>
            </div>

            {authMode === "register" && (
              <input className="wizard-auth-input" placeholder="你的稱呼" value={authName}
                onChange={e => setAuthName(e.target.value)} />
            )}
            <input className="wizard-auth-input" placeholder="Email" type="email" value={authEmail}
              onChange={e => setAuthEmail(e.target.value)} />
            <input className="wizard-auth-input" placeholder="密碼" type="password" value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAuthSubmit(); }} />

            {authError && <div className="wizard-auth-error">{authError}</div>}

            <button className="wizard-cta" onClick={handleAuthSubmit}>
              {authMode === "login" ? "登入" : "免費註冊"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Step 1: Goal
  const renderGoal = () => (
    <div className="wizard-content">
      <div className="wizard-question">{goal === "感情與姻緣" && loveSub === "" ? "你目前的感情狀態？" : "你想了解什麼？"}</div>
      <div className="wizard-subtitle">{goal === "感情與姻緣" && loveSub === "" ? "不同階段，解讀重點不同" : "選擇你最關注的方向"}</div>
      <div className="wizard-options">
        {goal === "感情與姻緣" && loveSub === "" ? (
          <>
            {LOVE_SUBS.map(s => (
              <div key={s.text} className="wizard-option"
                onClick={() => { setLoveSub(s.text); setGoalPrompt(s.prompt); setTimeout(() => setStep(2), 300); }}>
                <span className="wizard-option-text">{s.text}</span>
                <span className="wizard-option-arrow">›</span>
              </div>
            ))}
            <div className="wizard-option" style={{ opacity: 0.6 }}
              onClick={() => { setGoal(""); setLoveSub(""); }}>
              <span className="wizard-option-text">‹ 返回</span>
            </div>
          </>
        ) : (
          GOALS.map(g => (
            <div key={g.text} className={`wizard-option ${goal === g.text ? "selected" : ""}`}
              onClick={() => {
                setGoal(g.text);
                if (g.hasSub) {
                  setLoveSub("");
                } else {
                  setGoalPrompt(g.prompt);
                  setTimeout(() => setStep(2), 300);
                }
              }}>
              <span className="wizard-option-text">{g.text}</span>
              <span className="wizard-option-arrow">›</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  // Step 2: Birthday + Time (merged)
  const renderBirthday = () => {
    const years = [];
    for (let y = 2010; y >= 1940; y--) years.push(y);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

    const canProceed = birthYear && birthMonth && birthDay && birthHour !== "";

    return (
      <div className="wizard-content">
        <div className="wizard-question">你的出生時間？</div>
        <div className="wizard-hint">
          <span className="wizard-hint-text">出生日期與時間可以幫助我們精準解讀你的命運密碼</span>
        </div>

        {/* Date row */}
        <div className="wizard-date-row">
          <div className="wizard-select-wrap">
            <label>年</label>
            <select className="wizard-select" value={birthYear} onChange={e => setBirthYear(e.target.value)}>
              <option value="">--</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="wizard-select-wrap">
            <label>月</label>
            <select className="wizard-select" value={birthMonth} onChange={e => setBirthMonth(e.target.value)}>
              <option value="">--</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="wizard-select-wrap">
            <label>日</label>
            <select className="wizard-select" value={birthDay} onChange={e => setBirthDay(e.target.value)}>
              <option value="">--</option>
              {days.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div style={{ height: 20 }} />

        {/* Time row */}
        <div className="wizard-date-row">
          <div className="wizard-select-wrap">
            <label>時</label>
            <select className="wizard-select" value={birthHour} onChange={e => setBirthHour(e.target.value)}>
              <option value="">--</option>
              {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}時</option>)}
            </select>
          </div>
          <div className="wizard-select-wrap">
            <label>分</label>
            <select className="wizard-select" value={birthMinute} onChange={e => setBirthMinute(e.target.value)}>
              {minutes.map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}分</option>)}
            </select>
          </div>
        </div>

        <div style={{ height: 32 }} />
        <button className="wizard-cta" disabled={!canProceed} onClick={() => setStep(3)}>
          繼續
        </button>
        <button className="wizard-cta-secondary" onClick={() => { setBirthHour("12"); setBirthMinute("0"); setStep(3); }}>
          不確定時間，使用預設
        </button>
      </div>
    );
  };

  // Step 3: Birth place
  const renderPlace = () => (
    <div className="wizard-content">
      <div className="wizard-question">出生地</div>
      <div className="wizard-subtitle">用於更精確的命運解讀</div>
      <input
        className="wizard-input"
        value={birthPlace}
        onChange={e => setBirthPlace(e.target.value)}
        placeholder="例：台北、桃園、高雄..."
      />
      <div style={{ height: 32 }} />
      <button className="wizard-cta" disabled={!birthPlace.trim()} onClick={() => setStep(4)}>
        繼續
      </button>
    </div>
  );

  // Step 4: Confirm
  const renderConfirm = () => (
    <div className="wizard-content">
      <div className="wizard-question">確認你的資料</div>
      <div className="wizard-confirm">
        <div className="wizard-confirm-card">
          <div className="wizard-confirm-row">
            <span className="wizard-confirm-label">性別</span>
            <span className="wizard-confirm-value">{gender}</span>
          </div>
          <div className="wizard-confirm-row">
            <span className="wizard-confirm-label">關注方向</span>
            <span className="wizard-confirm-value">{goal}{loveSub ? `（${loveSub}）` : ""}</span>
          </div>
          <div className="wizard-confirm-row">
            <span className="wizard-confirm-label">出生日期</span>
            <span className="wizard-confirm-value">{birthYear}年{birthMonth}月{birthDay}日</span>
          </div>
          <div className="wizard-confirm-row">
            <span className="wizard-confirm-label">出生時間</span>
            <span className="wizard-confirm-value">{String(birthHour).padStart(2, '0')}:{String(birthMinute).padStart(2, '0')}</span>
          </div>
          <div className="wizard-confirm-row">
            <span className="wizard-confirm-label">出生地</span>
            <span className="wizard-confirm-value">{birthPlace}</span>
          </div>
        </div>
        <button className="wizard-cta" onClick={startAnalysis}>
          開始解讀命運
        </button>
        <button className="wizard-cta-secondary" onClick={() => setStep(0)}>
          重新填寫
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
        <div className="wizard-loading-step">請稍候，正在為你深度解讀...</div>
      </div>
      {error && <div style={{ color: "#f87171", marginTop: 24, textAlign: "center" }}>{error}</div>}
    </div>
  );

  // Result screen — unified, no system names
  const renderResult = () => {
    const years = [];
    for (let y = 2010; y >= 1940; y--) years.push(y);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

    const hebanReady = hebanRelation && hebanYear && hebanMonth && hebanDay && hebanGender;

    return (
      <div className="wizard-content">
        <div className="wizard-result">
          <div className="wizard-question" style={{ marginBottom: 24 }}>你的命運解讀報告</div>
          <div className="wizard-result-sections">
            {renderFormattedResult(finalResult)}
          </div>

          {/* ===== 合盤引導區塊 ===== */}
          {!hebanResult && !hebanAnalyzing && (
            <div className="wizard-heban-promo" ref={hebanRef}>
              <div className="wizard-heban-promo-header">
                <span className="wizard-heban-promo-icon wizard-diamond"></span>
                <div>
                  <div className="wizard-heban-promo-title">想了解你和他/她的關係嗎？</div>
                  <div className="wizard-heban-promo-desc">輸入對方生日，立即揭開你們之間的緣分密碼</div>
                </div>
              </div>
              {!showHeban ? (
                <button className="wizard-cta" style={{ marginTop: 16 }} onClick={() => requireAuth(() => setShowHeban(true))}>
                  開始合盤解讀
                </button>
              ) : (
                <div className="wizard-heban-form">
                  {/* Relation */}
                  <div className="wizard-heban-label">你們的關係</div>
                  <div className="wizard-heban-relations">
                    {RELATIONS.map(r => (
                      <button key={r.text}
                        className={`wizard-heban-rel-btn ${hebanRelation === r.text ? "selected" : ""}`}
                        onClick={() => setHebanRelation(r.text)}>
                        {r.text}
                      </button>
                    ))}
                  </div>

                  {/* Gender */}
                  <div className="wizard-heban-label">對方性別</div>
                  <div className="wizard-heban-relations">
                    <button className={`wizard-heban-rel-btn ${hebanGender === "男" ? "selected" : ""}`}
                      onClick={() => setHebanGender("男")}>男生</button>
                    <button className={`wizard-heban-rel-btn ${hebanGender === "女" ? "selected" : ""}`}
                      onClick={() => setHebanGender("女")}>女生</button>
                  </div>

                  {/* Name (optional) */}
                  <div className="wizard-heban-label">對方稱呼（選填）</div>
                  <input className="wizard-input" value={hebanName} onChange={e => setHebanName(e.target.value)}
                    placeholder="例：小明、Amy..." style={{ maxWidth: 300, marginBottom: 16 }} />

                  {/* Birthday */}
                  <div className="wizard-heban-label">對方出生日期</div>
                  <div className="wizard-date-row" style={{ marginBottom: 16 }}>
                    <div className="wizard-select-wrap">
                      <label>年</label>
                      <select className="wizard-select" value={hebanYear} onChange={e => setHebanYear(e.target.value)}>
                        <option value="">--</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div className="wizard-select-wrap">
                      <label>月</label>
                      <select className="wizard-select" value={hebanMonth} onChange={e => setHebanMonth(e.target.value)}>
                        <option value="">--</option>
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="wizard-select-wrap">
                      <label>日</label>
                      <select className="wizard-select" value={hebanDay} onChange={e => setHebanDay(e.target.value)}>
                        <option value="">--</option>
                        {days.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Time (optional) */}
                  <div className="wizard-heban-label">出生時間（選填，有的話更準）</div>
                  <div className="wizard-date-row" style={{ maxWidth: 250, marginBottom: 24 }}>
                    <div className="wizard-select-wrap">
                      <label>時</label>
                      <select className="wizard-select" value={hebanHour} onChange={e => setHebanHour(e.target.value)}>
                        <option value="">不確定</option>
                        {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}時</option>)}
                      </select>
                    </div>
                    <div className="wizard-select-wrap">
                      <label>分</label>
                      <select className="wizard-select" value={hebanMinute} onChange={e => setHebanMinute(e.target.value)}>
                        {minutes.map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}分</option>)}
                      </select>
                    </div>
                  </div>

                  <button className="wizard-cta" disabled={!hebanReady} onClick={startHeban}>
                    開始解讀兩人關係
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 合盤 Loading */}
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

          {/* 合盤結果 */}
          {hebanResult && (
            <div className="wizard-heban-result">
              <div className="wizard-question" style={{ fontSize: 20, marginBottom: 16 }}>
                你與{hebanName || "對方"}的關係解讀
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
              重新算一次
            </button>
            <button className="wizard-result-btn secondary" onClick={onBack}>
              回到主頁
            </button>
          </div>

          {/* Chat follow-up */}
          <div style={{ height: 32 }} />
          <div className="wizard-chat">
            <div className="wizard-question" style={{ fontSize: 18, marginBottom: 8 }}>你的命盤還藏著這些沒說完</div>
            <div className="wizard-subtitle" style={{ marginTop: 0, marginBottom: 20 }}>點選下方問題，或輸入你想問的</div>

            {/* Quick question buttons */}
            {showQuickQ && (
              <div className="wizard-quick-questions">
                {/* 深度分析選項 */}
                <div className="wizard-quick-q-divider">深度分析</div>
                {[
                  "幫我分析目前的 10 年大運走向，現在處於什麼階段？",
                  "幫我做 2026 年的流年分析，逐月解讀重點和注意事項",
                ].map((q, i) => (
                  <button key={`deep-${i}`} className="wizard-quick-q-btn wizard-quick-q-deep" onClick={() => requireAuth(() => sendChat(q))} disabled={chatLoading}>
                    {q}
                  </button>
                ))}

                <div className="wizard-quick-q-divider">追問</div>
                {[
                  "我今年的財運怎麼走？",
                  "我的感情什麼時候會有突破？",
                  "現在換工作的時機對嗎？",
                  "我命盤最需要注意什麼？",
                ].map((q, i) => (
                  <button key={i} className="wizard-quick-q-btn" onClick={() => requireAuth(() => sendChat(q))} disabled={chatLoading}>
                    {q}
                  </button>
                ))}

                {/* Heban-trigger buttons */}
                {!hebanResult && !hebanAnalyzing && (
                  <>
                    <div className="wizard-quick-q-divider">或解讀你和身邊的人</div>
                    {[
                      { label: "和主管/同事的相處，誰是你的貴人？", relation: "同事 / 上下屬" },
                      { label: "和家人之間的隱形牽絆，如何化解？", relation: "家人" },
                      { label: "和曖昧對象的緣分，現在該前進嗎？", relation: "情人 / 曖昧對象" },
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

            {/* Toggle button to re-show quick questions */}
            {!showQuickQ && chatHistory.length > 0 && (
              <button className="wizard-quick-q-toggle" onClick={() => setShowQuickQ(true)}>
                更多問題建議
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
                {chatLoading && <div className="wizard-chat-msg assistant" style={{ opacity: 0.5 }}>正在為你解讀...</div>}
                <div ref={chatEndRef} />
              </div>
            )}
            <div className="wizard-chat-input">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) requireAuth(() => sendChat(chatInput)); }}
                placeholder="或直接輸入你的問題..."
                disabled={chatLoading}
              />
              <button onClick={() => requireAuth(() => sendChat(chatInput))} disabled={chatLoading || !chatInput.trim()}>
                送出
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

      {/* Header — hide logo on welcome page to avoid duplication */}
      <div className="wizard-header">
        <button className="wizard-back" onClick={() => {
          if (step === 0) onBack();
          else if (isResultScreen) { /* stay */ }
          else setStep(s => Math.max(0, s - 1));
        }}>
          {step === 0 ? "✕" : "‹"}
        </button>
        {step > 0 && <div className="wizard-logo">命 理 三 鏡</div>}
        <div className="wizard-menu" />
      </div>

      {/* Progress — only show during questions */}
      {step > 0 && step < TOTAL_STEPS && (
        <div className="wizard-progress">
          <div className="wizard-progress-track">
            <div className="wizard-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="wizard-step-counter">{step}/{TOTAL_STEPS - 1}</div>
        </div>
      )}

      {/* Content */}
      {isLoadingScreen ? renderLoading()
        : isResultScreen ? renderResult()
        : stepRenderers[step] ? stepRenderers[step]()
        : renderLoading()}

      <div className="wizard-footer">論命僅供參考</div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="wizard-auth-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="wizard-auth-modal" onClick={e => e.stopPropagation()}>
            <button className="wizard-auth-close" onClick={() => setShowAuthModal(false)}>✕</button>
            <div className="wizard-auth-title">
              {authMode === "register" ? "免費註冊，解鎖下一步" : "歡迎回來"}
            </div>
            <div className="wizard-auth-subtitle">
              {authMode === "register" ? "註冊後可使用大運分析、合盤解讀、追問等完整功能" : "輸入你的帳號密碼登入"}
            </div>

            {authMode === "register" && (
              <input className="wizard-auth-input" placeholder="你的稱呼" value={authName}
                onChange={e => setAuthName(e.target.value)} />
            )}
            <input className="wizard-auth-input" placeholder="Email" type="email" value={authEmail}
              onChange={e => setAuthEmail(e.target.value)} />
            <input className="wizard-auth-input" placeholder="密碼" type="password" value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAuthSubmit(); }} />

            {authError && <div className="wizard-auth-error">{authError}</div>}

            <button className="wizard-cta" style={{ marginTop: 8 }} onClick={handleAuthSubmit}>
              {authMode === "register" ? "註冊" : "登入"}
            </button>

            <button className="wizard-auth-switch" onClick={() => {
              setAuthMode(authMode === "register" ? "login" : "register");
              setAuthError("");
            }}>
              {authMode === "register" ? "已有帳號？登入" : "還沒有帳號？免費註冊"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
