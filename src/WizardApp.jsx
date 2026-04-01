import { useState, useRef, useEffect } from "react";
import './WizardApp.css';
import { calculateChart, formatChart } from "./ziwei-calc.js";
import { calculateBazi, formatBazi } from "./bazi-calc.js";
import { calculateAstro, formatAstro } from "./astro-calc.js";
import { calculateFinance, formatFinance } from "./finance-calc.js";

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

const SHICHEN = [
  { label: "子時", hours: "23:00–01:00", value: 0 },
  { label: "丑時", hours: "01:00–03:00", value: 1 },
  { label: "寅時", hours: "03:00–05:00", value: 3 },
  { label: "卯時", hours: "05:00–07:00", value: 5 },
  { label: "辰時", hours: "07:00–09:00", value: 7 },
  { label: "巳時", hours: "09:00–11:00", value: 9 },
  { label: "午時", hours: "11:00–13:00", value: 11 },
  { label: "未時", hours: "13:00–15:00", value: 13 },
  { label: "申時", hours: "15:00–17:00", value: 15 },
  { label: "酉時", hours: "17:00–19:00", value: 17 },
  { label: "戌時", hours: "19:00–21:00", value: 19 },
  { label: "亥時", hours: "21:00–23:00", value: 21 },
];

const GOALS = [
  { icon: "💕", text: "感情與姻緣" },
  { icon: "💼", text: "事業與升遷" },
  { icon: "💰", text: "財富與投資" },
  { icon: "🏥", text: "健康與養生" },
  { icon: "✨", text: "全面綜合分析" },
];

const SYSTEMS = [
  { id: "ziwei", icon: "💜", name: "紫微斗數", desc: "最精準的命盤系統" },
  { id: "bazi", icon: "🔥", name: "八字命理", desc: "四柱推命經典" },
  { id: "astro", icon: "♎", name: "西洋占星", desc: "星座行星相位" },
  { id: "finance", icon: "💰", name: "紫微財運", desc: "專項財運分析" },
];

const LOADING_MSGS = [
  "正在排列你的星盤...",
  "計算四柱八字...",
  "推算紫微十二宮...",
  "分析五行分布...",
  "尋找命盤格局...",
  "交叉比對命理系統...",
  "推算今年流年運勢...",
  "彙整你的命運藍圖...",
];

const BASE_SYSTEM_PROMPT = `你是一位精通三大命理系統的高級命理分析師，擅長：
1. **八字命理**（Four Pillars of Destiny）
2. **西洋占星術**（Western Astrology）
3. **紫微斗數**（Zi Wei Dou Shu）

分析要求：
- 格局分析
- 重點宮位/柱位深入分析
- 今年運勢分析（2026丙午年）
- 實際可行的建議

注意事項：
- 語氣要專業但易懂，用日常語言解釋術語
- 如有多個系統，進行交叉分析找出共鳴點
- 最後加上免責聲明：僅供參考娛樂`;

function buildSystemPrompt(kbEntries) {
  let prompt = BASE_SYSTEM_PROMPT;
  if (kbEntries.length > 0) {
    const grouped = {};
    kbEntries.forEach(e => {
      if (!grouped[e.category]) grouped[e.category] = [];
      grouped[e.category].push(e);
    });
    prompt += "\n\n## 知識庫參考\n";
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

const TOTAL_STEPS = 7; // welcome, goal, gender, birthday, time, systems, confirm

export default function WizardApp({ auth, onBack, onLogout }) {
  const [step, setStep] = useState(0);
  const [gender, setGender] = useState("");
  const [goal, setGoal] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthHour, setBirthHour] = useState(null);
  const [birthPlace, setBirthPlace] = useState("桃園");
  const [selectedSystems, setSelectedSystems] = useState(["ziwei", "bazi", "astro"]);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [allResults, setAllResults] = useState([]);
  const [error, setError] = useState("");

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
      let prompt;
      if (engine === "manus") {
        prompt = chartText;
      } else if (systemName === "紫微財運") {
        prompt = `⚠️ 以下是紫微斗數財運專項排盤資料。直接基於此資料進行財運深度分析。\n\n${chartText}\n\n請進行【紫微斗數財運專項分析】：本命財運格局、大限財運、今年流年財運、12個月流月走勢、財運建議。要極度深入、專業、具體。`;
      } else {
        prompt = `⚠️ 以下排盤資料已確認正確。直接基於此資料分析。\n\n${chartText}\n\n請根據【${systemName}】排盤進行分析：\n1. 格局分析\n2. 重點宮位/柱位深入分析\n3. 今年運勢（2026丙午年）\n4. 綜合建議\n\n${goal ? `用戶特別關注：${goal}` : ""}\n\n要深入、專業、具體。嚴格只用【${systemName}】的術語。`;
      }
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
    setStep(TOTAL_STEPS); // go to loading screen
    setAnalyzing(true);
    setError("");
    setAllResults([]);

    let msgIdx = 0;
    setLoadingMsg(LOADING_MSGS[0]);
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MSGS.length;
      setLoadingMsg(LOADING_MSGS[msgIdx]);
    }, 3000);

    try {
      const y = parseInt(birthYear), m = parseInt(birthMonth), d = parseInt(birthDay);
      const h = birthHour ?? 0;
      const kbEntries = loadKB();
      const sp = buildSystemPrompt(kbEntries);

      const calcMap = {
        ziwei: { system: "紫微斗數", calc: () => formatChart(calculateChart(y, m, d, h, 0, gender)) },
        bazi: { system: "八字", calc: () => formatBazi(calculateBazi(y, m, d, h, gender)) },
        astro: { system: "西洋占星", calc: () => formatAstro(calculateAstro(y, m, d, h, 0, 24.9936, 121.3130)) },
        finance: { system: "紫微財運", calc: () => formatFinance(calculateFinance(y, m, d, h, gender)) },
      };
      const engineMap = { "紫微斗數": "claude", "八字": "claude", "西洋占星": "manus", "紫微財運": "claude" };

      // Calculate charts
      setLoadingMsg("正在排盤計算中...");
      await new Promise(r => setTimeout(r, 1500));
      const charts = selectedSystems.map(id => ({
        system: calcMap[id].system,
        text: calcMap[id].calc(),
        engine: engineMap[calcMap[id].system] || "claude",
      }));

      // Show chart results immediately
      setAllResults(charts.map(c => ({ system: c.system, result: c.text })));
      setLoadingMsg("排盤完成！AI 分析進行中...");

      // Parallel AI analysis
      const analyzePromises = charts.map(c =>
        autoAnalyze(c.system, c.text, sp, c.engine).then(r => {
          if (r) {
            setAllResults(prev => prev.map(item =>
              item.system === c.system ? { system: c.system + "（命盤分析）", result: item.result + "\n\n---\n\n" + r } : item
            ));
            setLoadingMsg(`${c.system} 分析完成！`);
          }
          return { system: c.system, result: r, text: c.text };
        })
      );
      const results = await Promise.all(analyzePromises);

      // Cross analysis
      if (charts.length > 1) {
        setLoadingMsg(`交叉比對 ${charts.length} 大系統...`);
        const crossInput = results.filter(r => r.result).map(r => `【${r.system}分析結果】\n${r.result}`).join("\n\n===\n\n");
        const crossResult = await autoAnalyze(`${charts.length}系統交叉`, crossInput, sp, "claude");
        if (crossResult) {
          setAllResults(prev => [...prev, { system: "交叉分析", result: crossResult }]);
        }
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
      const sp = buildSystemPrompt(kbEntries);
      const allText = allResults.map(r => `【${r.system}】\n${r.result.slice(0, 800)}`).join("\n\n");
      const recentChat = chatHistory.slice(-6).map(m => `${m.role === "user" ? "問" : "答"}：${m.text}`).join("\n");
      const prompt = `已有分析：\n${allText}\n\n${recentChat ? `對話紀錄：\n${recentChat}\n\n` : ""}用戶追問：${question}`;
      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: sp, prompt }),
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

  // ---- RENDER STEPS ----

  // Step 0: Welcome
  const renderWelcome = () => (
    <div className="wizard-welcome">
      <div className="wizard-welcome-icon">✦</div>
      <h1>命理三鏡</h1>
      <p className="tagline">八字 · 占星 · 紫微｜AI 交叉解盤</p>
      <div className="wizard-badges">
        <div className="wizard-badge"><span className="wizard-badge-icon">🔒</span> 隱私保護</div>
        <div className="wizard-badge"><span className="wizard-badge-icon">✓</span> AI 專業分析</div>
      </div>
      <div className="wizard-question">我是...</div>
      <div className="wizard-gender-cards">
        <div className={`wizard-gender-card ${gender === "男" ? "selected" : ""}`} onClick={() => { setGender("男"); setTimeout(() => setStep(1), 300); }}>
          <div className="wizard-gender-icon">👨</div>
          <div className="wizard-gender-label"><span>男生</span><span>›</span></div>
        </div>
        <div className={`wizard-gender-card ${gender === "女" ? "selected" : ""}`} onClick={() => { setGender("女"); setTimeout(() => setStep(1), 300); }}>
          <div className="wizard-gender-icon">👩</div>
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
            onClick={() => { setGoal(g.text); setTimeout(() => setStep(2), 300); }}>
            <span className="wizard-option-icon">{g.icon}</span>
            <span className="wizard-option-text">{g.text}</span>
            <span className="wizard-option-arrow">›</span>
          </div>
        ))}
      </div>
    </div>
  );

  // Step 2: Birthday
  const renderBirthday = () => {
    const years = [];
    for (let y = 2010; y >= 1940; y--) years.push(y);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const days = Array.from({ length: 31 }, (_, i) => i + 1);

    return (
      <div className="wizard-content">
        <div className="wizard-question">你的生日是？</div>
        <div className="wizard-hint">
          <span className="wizard-hint-icon">📅</span>
          <span className="wizard-hint-text">出生日期可以幫助我們精準推算你的命盤、星座與八字</span>
        </div>
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
        <div style={{ height: 32 }} />
        <button className="wizard-cta" disabled={!birthYear || !birthMonth || !birthDay} onClick={() => setStep(3)}>
          繼續
        </button>
      </div>
    );
  };

  // Step 3: Birth time (時辰)
  const renderTime = () => (
    <div className="wizard-content">
      <div className="wizard-question">出生時辰</div>
      <div className="wizard-subtitle">影響紫微命盤的關鍵因素</div>
      <div className="wizard-time-grid">
        {SHICHEN.map(s => (
          <button key={s.label}
            className={`wizard-time-btn ${birthHour === s.value ? "selected" : ""}`}
            onClick={() => { setBirthHour(s.value); }}>
            <div className="shichen">{s.label}</div>
            <div className="hours">{s.hours}</div>
          </button>
        ))}
      </div>
      <div style={{ height: 16 }} />
      <button className="wizard-cta" disabled={birthHour === null} onClick={() => setStep(4)}>
        繼續
      </button>
      <button className="wizard-cta-secondary" onClick={() => { setBirthHour(0); setStep(4); }}>
        不確定，跳過
      </button>
    </div>
  );

  // Step 4: Birth place
  const renderPlace = () => (
    <div className="wizard-content">
      <div className="wizard-question">出生地</div>
      <div className="wizard-subtitle">用於占星星盤的經緯度計算</div>
      <input
        className="wizard-input"
        value={birthPlace}
        onChange={e => setBirthPlace(e.target.value)}
        placeholder="例：台北、桃園、高雄..."
      />
      <div style={{ height: 32 }} />
      <button className="wizard-cta" disabled={!birthPlace.trim()} onClick={() => setStep(5)}>
        繼續
      </button>
    </div>
  );

  // Step 5: Select systems
  const renderSystems = () => (
    <div className="wizard-content">
      <div className="wizard-question">選擇分析系統</div>
      <div className="wizard-subtitle">可多選，越多越精準</div>
      <div className="wizard-system-cards">
        {SYSTEMS.map(s => (
          <div key={s.id}
            className={`wizard-system-card ${selectedSystems.includes(s.id) ? "selected" : ""}`}
            onClick={() => setSelectedSystems(prev =>
              prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
            )}>
            <span className="sys-icon">{s.icon}</span>
            <div className="sys-name">{s.name}</div>
            <div className="sys-desc">{s.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 24 }} />
      <button className="wizard-cta" disabled={selectedSystems.length === 0} onClick={() => setStep(6)}>
        繼續
      </button>
    </div>
  );

  // Step 6: Confirm
  const shichenLabel = SHICHEN.find(s => s.value === birthHour)?.label || "未知";
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
            <span className="wizard-confirm-label">出生時辰</span>
            <span className="wizard-confirm-value">{shichenLabel}</span>
          </div>
          <div className="wizard-confirm-row">
            <span className="wizard-confirm-label">出生地</span>
            <span className="wizard-confirm-value">{birthPlace}</span>
          </div>
          <div className="wizard-confirm-row">
            <span className="wizard-confirm-label">分析系統</span>
            <span className="wizard-confirm-value">{selectedSystems.map(id => SYSTEMS.find(s => s.id === id)?.name).join("、")}</span>
          </div>
        </div>
        <button className="wizard-cta" onClick={startAnalysis}>
          開始解盤分析
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
          <div className="wizard-loading-star">✦</div>
        </div>
        <div className="wizard-loading-text">{loadingMsg}</div>
        <div className="wizard-loading-step">
          {allResults.filter(r => r.system.includes("分析")).length > 0
            ? `已完成 ${allResults.filter(r => r.system.includes("分析")).length} 項分析`
            : "請稍候..."}
        </div>
      </div>
      {error && <div style={{ color: "#f87171", marginTop: 24, textAlign: "center" }}>{error}</div>}
    </div>
  );

  // Result screen
  const renderResult = () => (
    <div className="wizard-content">
      <div className="wizard-result">
        <div className="wizard-question" style={{ marginBottom: 24 }}>你的命理分析報告</div>
        {allResults.map((r, i) => (
          <div key={i} className="wizard-result-card">
            <h3>
              {r.system.includes("紫微") ? "💜" : r.system.includes("八字") ? "🔥" : r.system.includes("占星") ? "♎" : r.system.includes("財運") ? "💰" : "✦"}
              {" "}{r.system}
            </h3>
            <div className="wizard-result-text">{r.result}</div>
          </div>
        ))}

        <div className="wizard-result-actions">
          <button className="wizard-result-btn primary" onClick={() => { setStep(0); setAllResults([]); setChatHistory([]); }}>
            重新算一次
          </button>
          <button className="wizard-result-btn secondary" onClick={onBack}>
            回到主頁
          </button>
        </div>

        {/* Chat follow-up */}
        <div style={{ height: 32 }} />
        <div className="wizard-chat">
          <div className="wizard-question" style={{ fontSize: 18, marginBottom: 16 }}>有什麼想問的？</div>
          {chatHistory.length > 0 && (
            <div className="wizard-chat-messages">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`wizard-chat-msg ${msg.role}`}>{msg.text}</div>
              ))}
              {chatLoading && <div className="wizard-chat-msg assistant" style={{ opacity: 0.5 }}>正在思考...</div>}
              <div ref={chatEndRef} />
            </div>
          )}
          <div className="wizard-chat-input">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) sendChat(chatInput); }}
              placeholder="追問命盤問題..."
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

  // ---- MAIN RENDER ----
  const isLoadingScreen = step === TOTAL_STEPS && analyzing;
  const isResultScreen = step === TOTAL_STEPS + 1 || (step === TOTAL_STEPS && !analyzing && allResults.length > 0);

  const stepRenderers = [renderWelcome, renderGoal, renderBirthday, renderTime, renderPlace, renderSystems, renderConfirm];

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

      <div className="wizard-footer">僅供參考娛樂 · 命理三鏡 AI</div>
    </div>
  );
}
