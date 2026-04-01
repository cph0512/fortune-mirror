import { useState, useRef, useEffect } from "react";
import './WizardApp.css';
import { calculateChart, formatChart } from "./ziwei-calc.js";
import { calculateBazi, formatBazi } from "./bazi-calc.js";
import { calculateAstro, formatAstro } from "./astro-calc.js";

// ============================================================
// CONSTANTS
// ============================================================

const API_BACKEND = "https://bot.velopulse.io/api/fortune";
const STORAGE_KEY_KB = "fortune-app-kb";
const KB_VERSION = "20260401b";

function loadKB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_KB);
    const savedVer = localStorage.getItem("fortune-kb-version");
    if (raw && savedVer === KB_VERSION) return JSON.parse(raw);
  } catch {}
  return [];
}

const GOALS = [
  { icon: "💕", text: "感情與姻緣", prompt: "感情、姻緣、桃花、婚姻、另一半" },
  { icon: "💼", text: "事業與升遷", prompt: "事業、工作、升遷、職涯方向、貴人" },
  { icon: "💰", text: "財富與投資", prompt: "財運、投資、理財、收入、財庫" },
  { icon: "🏥", text: "健康與養生", prompt: "健康、身體、養生、需注意的部位" },
  { icon: "✨", text: "全面綜合分析", prompt: "全面性格、事業、感情、財運、健康、今年運勢" },
];

const RELATIONS = [
  { icon: "💕", text: "情人 / 曖昧對象" },
  { icon: "💼", text: "同事 / 上下屬" },
  { icon: "👫", text: "朋友" },
  { icon: "👨‍👩‍👧", text: "家人" },
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

const WIZARD_SYSTEM_PROMPT = `你是「命理三鏡」的命理分析師。

核心規則（必須嚴格遵守）：

1. 絕對禁止提到任何命理系統名稱：不可出現「紫微斗數」「八字」「四柱」「西洋占星」「星盤」「命盤」「排盤」等詞彙。
2. 不可提到任何系統專有術語：不可出現「化祿」「化忌」「天干地支」「十神」「宮位」「相位」「行星」「星座」「主星」「命宮」「財帛宮」等。
3. 用自然語言表達：把所有命理推論轉化為直覺式、生活化的描述。

格式規則（必須嚴格遵守）：
絕對禁止使用 Markdown 語法。不可出現 #、##、###、**粗體**、*斜體*、- 列表、| 表格 |、代碼塊。
絕對禁止使用 emoji、表情符號、小圖示。不可出現任何 emoji unicode 字元。
用 [SECTION] 標記來分段。格式為：每段開頭獨立一行寫 [SECTION] 標題文字，然後換行寫內容。段落之間空行分隔。
內容用自然的句子和段落書寫，像寫文章一樣，不要用列表或項目符號。

輸出結構：

[SECTION] 你的天賦特質
（性格核心、天生優勢、潛能方向，用 2-3 段自然文字描述）

[SECTION] [用戶關注的主題]深度解析
（針對用戶選擇的方向，深入分析現況與趨勢）

[SECTION] 2026 年運勢預測
（今年整體走向、好的月份、需注意的月份）

[SECTION] 給你的建議
（具體可行的行動建議，避開的陷阱，把握的機會）

[SECTION] 近期關鍵提醒
（最近 1-3 個月特別需要注意的事）

中立原則：
你只知道用戶的出生資料和關注方向，完全不知道用戶的職業、行業、家庭、收入、教育等背景。絕對不可猜測或假設用戶的具體職業或生活狀況。描述特質和建議要保持通用。

語氣：像一位溫暖睿智的顧問在跟朋友聊天。正面為主但風險誠實說。具體有畫面感，避免空泛。不需要加免責聲明。`;

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
  const [step, setStep] = useState(0);
  const [gender, setGender] = useState("");
  const [goal, setGoal] = useState("");
  const [goalPrompt, setGoalPrompt] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthHour, setBirthHour] = useState("");
  const [birthMinute, setBirthMinute] = useState("0");
  const [birthPlace, setBirthPlace] = useState("桃園");

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [finalResult, setFinalResult] = useState("");
  const [rawResults, setRawResults] = useState([]); // internal, not shown
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
  const [hebanResult, setHebanResult] = useState("");

  // Chat state
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const progress = Math.round((step / (TOTAL_STEPS - 1)) * 100);

  // ---- API calls ----
  const autoAnalyze = async (systemName, chartText, systemPrompt, engine = "claude") => {
    try {
      const prompt = engine === "manus" ? chartText
        : `⚠️ 以下排盤資料已確認正確。直接基於此資料分析。\n\n${chartText}\n\n請根據【${systemName}】排盤進行深度分析，特別針對：${goalPrompt}\n\n要深入、專業、具體。`;
      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: systemPrompt, prompt, engine }),
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
- 關注方向：${goal}

## 任務
請綜合以上三套排盤資料，直接產出一份統一的命理報告。
你需要自己解讀排盤資料、找出格局和重點，然後整合成報告。
⚠️ 嚴格遵守系統規則：不提任何命理系統名稱和專有術語，用自然語言表達所有洞見。
⚠️ 按照指定的輸出格式（天賦特質 → 主題深度解析 → 年運勢 → 建議 → 近期提醒）組織內容。
⚠️ 重點針對用戶關注的「${goal}」方向深入分析。
⚠️ 三套排盤的結論要交叉驗證，共鳴點重點強調，矛盾處以多數為準。
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
    setChatHistory(prev => [...prev, { role: "user", text: question }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const kbEntries = loadKB();
      const wizardSP = buildWizardPrompt(kbEntries, goal);
      const recentChat = chatHistory.slice(-6).map(m => `${m.role === "user" ? "問" : "答"}：${m.text}`).join("\n");
      const prompt = `之前的分析報告：\n${finalResult.slice(0, 2000)}\n\n${recentChat ? `對話紀錄：\n${recentChat}\n\n` : ""}用戶追問：${question}\n\n⚠️ 回答時嚴格遵守規則：不提任何命理系統名稱和專有術語，用自然語言回覆。`;
      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: wizardSP, prompt }),
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

      // 用戶自己的排盤（已有 rawResults）
      const myCharts = rawResults.filter(r => r.result).map(r => `【${r.system}】\n${r.text}\n${r.result}`).join("\n\n");

      // 對方排盤
      const partnerGender = hebanGender || (gender === "男" ? "女" : "男");
      let partnerCharts = "";

      if (hasPartnerTime) {
        // 有出生時間：完整排盤 + 飛化
        const pZiwei = formatChart(calculateChart(y2, m2, d2, h2, 0, partnerGender));
        const pBazi = formatBazi(calculateBazi(y2, m2, d2, h2, partnerGender));
        const pAstro = formatAstro(calculateAstro(y2, m2, d2, h2, min2, 24.9936, 121.3130));
        partnerCharts = `【紫微斗數】\n${pZiwei}\n\n【八字】\n${pBazi}\n\n【西洋占星】\n${pAstro}`;
      } else {
        // 沒有出生時間：只用年月日
        const pBazi = formatBazi(calculateBazi(y2, m2, d2, 12, partnerGender));
        const pAstro = formatAstro(calculateAstro(y2, m2, d2, 12, 0, 24.9936, 121.3130));
        partnerCharts = `【八字（無時柱）】\n${pBazi}\n\n【西洋占星（noon chart）】\n${pAstro}`;
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
${hasPartnerTime ? "（有完整出生時間，分析精度高）" : "（無出生時間，以日間能量為主進行分析，精度略低）"}

${partnerCharts}

## 任務
請整合以上所有資料，分析這兩人作為「${hebanRelation}」的關係。
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

    // Split by [SECTION] markers
    const parts = cleaned.split(/\[SECTION\]\s*/i);
    const sections = [];

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // First line is the title, rest is body
      const lines = trimmed.split('\n');
      const title = lines[0].trim();
      const body = lines.slice(1).join('\n').trim();

      if (body) {
        sections.push({ title, body });
      } else if (sections.length === 0) {
        // Intro text before any section
        sections.push({ title: "", body: title });
      } else {
        // Title with no body — append to previous or create with title as body
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

    return sections.map((sec, i) => (
      <div key={i} className="wizard-section">
        {sec.title && (
          <div className="wizard-section-header">
            <span className="wizard-section-title">{sec.title}</span>
          </div>
        )}
        {sec.body && <div className="wizard-section-body">{sec.body}</div>}
      </div>
    ));
  };

  // ---- RENDER STEPS ----

  // Step 0: Welcome + gender
  const renderWelcome = () => (
    <div className="wizard-welcome">
      <div className="wizard-welcome-icon wizard-diamond"></div>
      <h1>命理三鏡</h1>
      <p className="tagline">探索你的命運密碼</p>
      <div className="wizard-badges">
        <div className="wizard-badge"><span className="wizard-badge-icon">&#x1F512;</span> 隱私保護</div>
        <div className="wizard-badge"><span className="wizard-badge-icon">&#10003;</span> 專業深度解讀</div>
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
    </div>
  );

  // Step 1: Goal
  const renderGoal = () => (
    <div className="wizard-content">
      <div className="wizard-question">你想了解什麼？</div>
      <div className="wizard-subtitle">選擇你最關注的方向</div>
      <div className="wizard-options">
        {GOALS.map(g => (
          <div key={g.text} className={`wizard-option ${goal === g.text ? "selected" : ""}`}
            onClick={() => { setGoal(g.text); setGoalPrompt(g.prompt); setTimeout(() => setStep(2), 300); }}>
            <span className="wizard-option-icon">{g.icon}</span>
            <span className="wizard-option-text">{g.text}</span>
            <span className="wizard-option-arrow">›</span>
          </div>
        ))}
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
          <span className="wizard-hint-icon">📅</span>
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
            <span className="wizard-confirm-value">{goal}</span>
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
            <div className="wizard-heban-promo">
              <div className="wizard-heban-promo-header">
                <span className="wizard-heban-promo-icon wizard-diamond"></span>
                <div>
                  <div className="wizard-heban-promo-title">想了解你和他/她的關係嗎？</div>
                  <div className="wizard-heban-promo-desc">提供對方的出生資料，解讀兩人之間的緣分與互動模式</div>
                </div>
              </div>
              {!showHeban ? (
                <button className="wizard-cta" style={{ marginTop: 16 }} onClick={() => setShowHeban(true)}>
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
                        <span>{r.icon}</span> {r.text}
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
              setStep(0); setFinalResult(""); setRawResults([]); setChatHistory([]);
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
            {chatHistory.length === 0 && (
              <div className="wizard-quick-questions">
                {[
                  "我今年的財運怎麼走？",
                  "我的感情什麼時候會有突破？",
                  "現在換工作的時機對嗎？",
                  "我命盤最需要注意什麼？",
                ].map((q, i) => (
                  <button key={i} className="wizard-quick-q-btn" onClick={() => sendChat(q)} disabled={chatLoading}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            {chatHistory.length > 0 && (
              <div className="wizard-chat-messages">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`wizard-chat-msg ${msg.role}`}>{msg.text}</div>
                ))}
                {chatLoading && <div className="wizard-chat-msg assistant" style={{ opacity: 0.5 }}>正在為你解讀...</div>}
                <div ref={chatEndRef} />
              </div>
            )}
            <div className="wizard-chat-input">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) sendChat(chatInput); }}
                placeholder="或直接輸入你的問題..."
                disabled={chatLoading}
              />
              <button onClick={() => sendChat(chatInput)} disabled={chatLoading || !chatInput.trim()}>
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

      {/* Header */}
      <div className="wizard-header">
        <button className="wizard-back" onClick={() => {
          if (step === 0) onBack();
          else if (isResultScreen) { /* stay */ }
          else setStep(s => Math.max(0, s - 1));
        }}>
          {step === 0 ? "✕" : "‹"}
        </button>
        <div className="wizard-logo">命 理 三 鏡</div>
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

      <div className="wizard-footer">僅供參考 · 命理三鏡</div>
    </div>
  );
}
