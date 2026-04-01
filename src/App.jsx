import { useState, useRef, useCallback, useEffect } from "react";
import './App.css';
import { calculateChart, formatChart } from "./ziwei-calc.js";
import { calculateBazi, formatBazi } from "./bazi-calc.js";
import { calculateAstro, formatAstro } from "./astro-calc.js";
import { calculateFinance, formatFinance } from "./finance-calc.js";

// ============================================================
// CONSTANTS
// ============================================================

const CATEGORIES = [
  { id: "bazi", name: "八字命理", icon: "🔥", desc: "四柱、十神、五行、大運、流年等知識" },
  { id: "astro", name: "西洋占星", icon: "♎", desc: "星座、行星、宮位、相位、流運等知識" },
  { id: "ziwei", name: "紫微斗數", icon: "💜", desc: "主星、四化、十二宮、飛星等知識" },
  { id: "general", name: "通用知識", icon: "📚", desc: "跨系統通則、命理哲學、解讀技巧等" },
];

const BASE_SYSTEM_PROMPT = `你是一位精通三大命理系統的高級命理分析師，擅長：
1. **八字命理**（Four Pillars of Destiny）
2. **西洋占星術**（Western Astrology）
3. **紫微斗數**（Zi Wei Dou Shu）

## ⚠️ 圖片判讀最高優先原則

**判讀命盤圖片時，必須極度仔細、逐格逐字辨認。這是最重要的步驟，寧可慢不可錯。**

### 紫微斗數命盤判讀規則：
1. 紫微命盤是 4×3 共12格的方陣，地支位置固定如下：
\`\`\`
巳 | 午 | 未 | 申
辰 |         |         | 酉
卯 | 寅 | 丑 | 子
\`\`\`
2. 十二宮依序為：命宮→兄弟→夫妻→子女→財帛→疾厄→遷移→交友(僕役)→事業(官祿)→田宅→福德→父母，逆時針排列
3. **先讀地支確認宮位**：每格都有地支標記（子丑寅卯辰巳午未申酉戌亥），先認地支再認宮位名稱，不要靠位置猜
4. **兄弟宮 ≠ 交友宮**：這兩宮是對宮關係（相隔6格），仔細看格子裡寫的宮位名稱
5. 每宮必須讀取：宮位名稱、主星（甲級星）、輔星（乙級星）、煞星、四化標記（祿權科忌）
6. **不要猜測**：如果某個字看不清楚，標記為「不確定」，不要亂填
7. 注意區分容易混淆的星曜：廉貞/貪狼、天機/天梁、武曲/破軍等
8. 四化（化祿、化權、化科、化忌）通常標記在星曜旁邊，用小字或符號表示

### 八字命盤判讀規則：
1. 準確讀取年柱、月柱、日柱、時柱的天干地支
2. 辨識十神標記、大運排列
3. 確認陰陽、五行屬性

### 西洋占星星盤判讀規則：
1. 準確讀取每顆行星所在的星座和度數
2. 辨識宮位（House）系統
3. 讀取相位線（合相、六合、四分、三分、對分等）

## 輸出格式

### 第一步：命盤資料提取（必須先完成）
\`\`\`
## 📋 命盤資料提取

### 十二宮判讀結果
| 宮位 | 主星 | 其他星曜 | 四化 |
|------|------|----------|------|
| 命宮 | ... | ... | ... |
| 兄弟宮 | ... | ... | ... |
（逐一列出全部12宮）

### 基本資料
- 命主：...
- 身主：...
- 五行局：...
\`\`\`

**列完表格後，請自我檢查一次：回頭對照原圖，確認每一宮的星曜都正確。**

### 第二步：分析
根據命盤類型進行專業分析：
- 紫微：命宮主星格局、四化影響、身宮、大限流年
- 八字：日主強弱、格局、喜用神、大運
- 占星：上升/太陽/月亮、重要相位、宮位

### 第三步：運勢與建議
- 今年運勢分析（2026丙午年）
- 實際可行的建議

## ⚠️ 流年分析規則（極重要）
- **如果有紫微斗數命盤，流年必須用紫微的方法**：流年斗君定位 → 流年十二宮 → 流年四化 → 逐月分析
- **不要用占星的行星過宮來替代紫微的流年推算**
- 八字流年用大運+流年天干地支與命局的關係
- 占星流年用行運（transit）行星與本命盤的相位
- 每個系統的流年方法獨立運作，不要混用
- 如果用戶問「今年運勢」且有紫微命盤，**優先用紫微斗數的流年推算**，因為紫微的流月分析最具體

注意事項：
- 語氣要專業但易懂，用日常語言解釋術語
- 如有多個系統，進行交叉分析找出共鳴點
- 最後加上免責聲明：僅供參考娛樂`;

const LOADING_MESSAGES = [
  "正在辨識命盤類型...",
  "提取星體位置與四柱資訊...",
  "計算五行分布...",
  "分析宮位配置...",
  "交叉比對三大系統...",
  "尋找共鳴點...",
  "推算流年運勢...",
  "彙整綜合分析報告...",
];

const STORAGE_KEY_KB = "fortune-app-kb";
const STORAGE_KEY_API = "fortune-app-api-key";
const STORAGE_KEY_MODEL = "fortune-app-model";

// ============================================================
// HELPERS
// ============================================================

function loadKB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_KB);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Load default KB on first visit
  fetch("./default-kb.json").then(r => r.json()).then(data => {
    if (data?.length && !localStorage.getItem(STORAGE_KEY_KB)) {
      localStorage.setItem(STORAGE_KEY_KB, JSON.stringify(data));
      window.location.reload();
    }
  }).catch(() => {});
  return [];
}

function saveKB(entries) {
  localStorage.setItem(STORAGE_KEY_KB, JSON.stringify(entries));
}

const API_BACKEND = "https://bot.velopulse.io/api/fortune";

function loadApiKey() {
  return "server"; // API key managed server-side
}

function saveApiKey() {}

function loadModel() {
  return localStorage.getItem(STORAGE_KEY_MODEL) || "claude-sonnet-4-20250514";
}

function saveModel(m) {
  localStorage.setItem(STORAGE_KEY_MODEL, m);
}

function buildSystemPrompt(kbEntries) {
  let prompt = BASE_SYSTEM_PROMPT;
  if (kbEntries.length === 0) return prompt;

  const grouped = {};
  for (const entry of kbEntries) {
    if (!grouped[entry.category]) grouped[entry.category] = [];
    grouped[entry.category].push(entry);
  }

  prompt += "\n\n---\n\n## 補充知識庫（僅供參考）\n";
  prompt += "以下是使用者匯入的命理筆記與觀點，作為額外參考。你仍應以自身的命理專業知識為主進行完整分析，這些筆記僅作為輔助視角，若其中觀點與你的專業判斷有出入，以你的分析為準。\n";

  for (const cat of CATEGORIES) {
    const entries = grouped[cat.id];
    if (!entries || entries.length === 0) continue;
    prompt += `\n### ${cat.icon} ${cat.name}\n`;
    for (const e of entries) {
      prompt += `\n**${e.title}**\n${e.content}\n`;
    }
  }

  prompt += "\n---\n如果上述知識庫中有與命盤分析相關的觀點，可以適度融入你的分析中作為補充，但不需要刻意逐條引用。";
  return prompt;
}

// Simple markdown → React elements
function renderMarkdown(md) {
  const lines = md.split("\n");
  const elements = [];
  let listItems = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`}>
          {listItems.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ul>
      );
      listItems = [];
    }
  };

  const renderInline = (text) => {
    const parts = [];
    let remaining = text;
    let key = 0;
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      if (boldMatch) {
        const idx = remaining.indexOf(boldMatch[0]);
        if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
        parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
        remaining = remaining.slice(idx + boldMatch[0].length);
      } else {
        parts.push(<span key={key++}>{remaining}</span>);
        break;
      }
    }
    return parts;
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(<h2 key={i}>{trimmed.replace("## ", "")}</h2>);
    } else if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(<h3 key={i}>{trimmed.replace("### ", "")}</h3>);
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2));
    } else if (trimmed.startsWith("---")) {
      flushList();
      elements.push(<hr key={i} />);
    } else if (trimmed === "") {
      flushList();
    } else {
      flushList();
      elements.push(<p key={i}>{renderInline(trimmed)}</p>);
    }
  });
  flushList();
  return elements;
}

// ============================================================
// COMPONENTS
// ============================================================

function KnowledgeBase({ entries, setEntries }) {
  const [openCats, setOpenCats] = useState({});
  const [editing, setEditing] = useState(null); // null | { mode: 'new'|'edit', category, entry? }
  const [importMode, setImportMode] = useState(false);
  const fileRef = useRef(null);

  const toggle = (catId) => setOpenCats(prev => ({ ...prev, [catId]: !prev[catId] }));

  const addEntry = (category) => {
    setEditing({ mode: "new", category, entry: { title: "", content: "" } });
  };

  const editEntry = (entry) => {
    setEditing({ mode: "edit", category: entry.category, entry: { ...entry } });
  };

  const deleteEntry = (id) => {
    const next = entries.filter(e => e.id !== id);
    setEntries(next);
    saveKB(next);
  };

  const handleSave = (data) => {
    let next;
    if (editing.mode === "new") {
      next = [...entries, { ...data, id: Date.now().toString(), category: editing.category }];
    } else {
      next = entries.map(e => e.id === data.id ? data : e);
    }
    setEntries(next);
    saveKB(next);
    setEditing(null);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fortune-kb-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (Array.isArray(data)) {
          const merged = [...entries];
          for (const item of data) {
            if (item.title && item.content && item.category) {
              merged.push({ ...item, id: item.id || Date.now().toString() + Math.random() });
            }
          }
          setEntries(merged);
          saveKB(merged);
        }
      } catch { alert("檔案格式錯誤"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const totalChars = entries.reduce((s, e) => s + e.content.length, 0);

  return (
    <div className="kb-section">
      {/* Stats */}
      <div className="kb-stats">
        <div className="kb-stat">
          <div className="num">{entries.length}</div>
          <div className="label">知識條目</div>
        </div>
        <div className="kb-stat">
          <div className="num">{CATEGORIES.filter(c => entries.some(e => e.category === c.id)).length}</div>
          <div className="label">涵蓋系統</div>
        </div>
        <div className="kb-stat">
          <div className="num">{totalChars > 1000 ? (totalChars / 1000).toFixed(1) + "k" : totalChars}</div>
          <div className="label">總字數</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="kb-toolbar">
        <button onClick={handleExport}>📤 匯出知識庫</button>
        <button onClick={() => fileRef.current?.click()}>📥 匯入知識庫</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
      </div>

      {/* Categories */}
      {CATEGORIES.map(cat => {
        const catEntries = entries.filter(e => e.category === cat.id);
        const isOpen = openCats[cat.id];
        return (
          <div className="kb-category" key={cat.id}>
            <div className="kb-category-header" onClick={() => toggle(cat.id)}>
              <div className="left">
                <span className="icon">{cat.icon}</span>
                <span className="title">{cat.name}</span>
                <span className="count">{catEntries.length} 筆</span>
              </div>
              <span className={`arrow ${isOpen ? "open" : ""}`}>▼</span>
            </div>
            {isOpen && (
              <div className="kb-entries">
                {catEntries.map(entry => (
                  <div className="kb-entry" key={entry.id}>
                    <div className="entry-title">{entry.title}</div>
                    <div className="entry-preview">{entry.content}</div>
                    <div className="entry-actions">
                      <button onClick={() => editEntry(entry)} title="編輯">✏️</button>
                      <button className="delete" onClick={() => deleteEntry(entry.id)} title="刪除">🗑️</button>
                    </div>
                  </div>
                ))}
                <button className="kb-add-btn" onClick={() => addEntry(cat.id)}>
                  ＋ 新增{cat.name}知識
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Editor Modal */}
      {editing && (
        <EditorModal
          mode={editing.mode}
          category={editing.category}
          entry={editing.entry}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EditorModal({ mode, category, entry, onSave, onCancel }) {
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const catInfo = CATEGORIES.find(c => c.id === category);

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) return;
    onSave({ ...entry, title: title.trim(), content: content.trim(), category });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{catInfo.icon} {mode === "new" ? "新增" : "編輯"}{catInfo.name}知識</h3>
        <label>標題</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={`例：${category === "bazi" ? "十神解析" : category === "astro" ? "冥王星過境效應" : category === "ziwei" ? "紫微星入命宮" : "命理交叉比對技巧"}`}
        />
        <label>知識內容</label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="貼上命理知識內容，可以是教學文章、口訣、解盤技巧、星體意涵等..."
        />
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
          {content.length} 字
        </div>
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onCancel}>取消</button>
          <button className="save-btn" onClick={handleSubmit} disabled={!title.trim() || !content.trim()}>
            {mode === "new" ? "新增" : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Settings({ apiKey, setApiKey, model, setModel }) {
  return (
    <div className="settings-section">
      <div className="setting-card">
        <div className="setting-title">解盤引擎</div>
        <div className="setting-desc">
          由伺服器端引擎驅動，無需設定。
        </div>
        <div className="status ok">✓ 已連線</div>
      </div>

      <div className="setting-card">
        <div className="setting-title">分析模型</div>
        <div className="setting-desc">伺服器端自動選擇最佳模型進行分析。</div>
        <select
          value={model}
          onChange={e => { setModel(e.target.value); saveModel(e.target.value); }}
        >
          <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (推薦)</option>
          <option value="claude-opus-4-20250514">Claude Opus 4</option>
          <option value="claude-haiku-4-20250514">Claude Haiku 4</option>
        </select>
      </div>

      <div className="setting-card">
        <div className="setting-title">使用說明</div>
        <div className="setting-desc" style={{ lineHeight: 1.8 }}>
          1. 在「設定」頁面填入 Anthropic API Key<br />
          2. 在「知識庫」頁面新增命理知識（可選）<br />
          3. 在「解盤」頁面上傳命盤截圖<br />
          4. 系統會結合你的知識庫 + 內建知識進行分析<br />
          5. 知識庫越豐富，分析越精準！
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================

function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login"); // login | register
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username || !password) return;
    setLoading(true); setErr("");
    try {
      const endpoint = mode === "login" ? "fortune-login" : "fortune-register";
      const body = mode === "login" ? { username, password } : { username, password, name: name || username };
      const res = await fetch(`${API_BACKEND.replace("/api/fortune", "/api/")}${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "失敗"); return; }
      localStorage.setItem("fortune_auth", JSON.stringify(data));
      onLogin(data);
    } catch (e) { setErr("連線失敗"); } finally { setLoading(false); }
  };

  return (
    <div className="app">
      <div className="bg-pattern" />
      <div className="header">
        <div className="header-icon">✦</div>
        <h1>命理三鏡</h1>
        <p className="tagline">八字 · 占星 · 紫微｜交叉解盤</p>
      </div>
      <div className="content">
        <div className="login-card">
          <div className="login-tabs">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>登入</button>
            <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>註冊</button>
          </div>
          {mode === "register" && (
            <input placeholder="顯示名稱" value={name} onChange={e => setName(e.target.value)} />
          )}
          <input placeholder="帳號" value={username} onChange={e => setUsername(e.target.value)} />
          <input placeholder="密碼" type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()} />
          {err && <div className="login-err">{err}</div>}
          <button className="login-btn" onClick={submit} disabled={loading}>
            {loading ? "⏳" : mode === "login" ? "登入" : "註冊"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fortune_auth")); } catch { return null; }
  });
  const isAdmin = auth?.role === "admin";

  if (!auth) return <LoginPage onLogin={setAuth} />;

  return <MainApp auth={auth} isAdmin={isAdmin} onLogout={() => { localStorage.removeItem("fortune_auth"); setAuth(null); }} />;
}

function MainApp({ auth, isAdmin, onLogout }) {
  const [tab, setTab] = useState("analyze"); // analyze | kb | saves | settings | users
  const [images, setImages] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [addingChart, setAddingChart] = useState(false);
  const [inputMode, setInputMode] = useState("upload"); // "upload" | "auto"
  const [birthData, setBirthData] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fortune-birth-data")) || { year: "", month: "", day: "", hour: "0", minute: "0", gender: "男", birthPlace: "桃園", lat: 24.9936, lng: 121.3130 }; }
    catch { return { year: "", month: "", day: "", hour: "0", minute: "0", gender: "男", birthPlace: "桃園", lat: 24.9936, lng: 121.3130 }; }
  });
  const [autoSystems, setAutoSystems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fortune-auto-systems")) || ["ziwei", "bazi", "astro"]; }
    catch { return ["ziwei", "bazi", "astro"]; }
  });
  useEffect(() => { localStorage.setItem("fortune-birth-data", JSON.stringify(birthData)); }, [birthData]);
  useEffect(() => { localStorage.setItem("fortune-auto-systems", JSON.stringify(autoSystems)); }, [autoSystems]);
  const [result, setResult] = useState(() => {
    try { const r = JSON.parse(sessionStorage.getItem("fortune-results")) || []; return r.length ? r[r.length - 1].result : ""; }
    catch { return ""; }
  });
  const [error, setError] = useState("");
  const [loadingMsg, setLoadingMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [kbEntries, setKbEntries] = useState(loadKB);
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [model, setModel] = useState(loadModel);
  const [selectedSystems, setSelectedSystems] = useState([]); // ["bazi", "astro", "ziwei"]
  const [correction, setCorrection] = useState(""); // user correction text
  const [allResults, setAllResults] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("fortune-results")) || []; }
    catch { return []; }
  });
  const [chatHistory, setChatHistory] = useState([]); // [{role, text}]
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [savedList, setSavedList] = useState([]);

  // 自動暫存到 sessionStorage（防頁面跳動遺失）
  useEffect(() => {
    if (allResults.length > 0) sessionStorage.setItem("fortune-results", JSON.stringify(allResults));
  }, [allResults]);

  // 分析完成後自動存檔到後端
  const autoSaveRef = useRef(null);
  autoSaveRef.current = async () => {
    try {
      const results = JSON.parse(sessionStorage.getItem("fortune-results") || "[]");
      if (results.length === 0) return;
      // Try to extract person info from results
      const allText = results.map(r => r.result).join("\n");
      const dateMatch = allText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      const personLabel = dateMatch ? `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}` : "未命名";
      await fetch(`${API_BACKEND}-save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: auth.username, person: personLabel, systems: results.map(r => r.system), results, chat: [], time: new Date().toISOString() }),
      });
    } catch {}
  };
  const [usersList, setUsersList] = useState({});
  const [feedbackList, setFeedbackList] = useState([]);
  const chatEndRef = useRef(null);

  const saveReading = async (personName) => {
    if (allResults.length === 0) return;
    const payload = {
      user: auth.username,
      person: personName || "未命名",
      systems: allResults.map(r => r.system),
      results: allResults,
      chat: chatHistory,
      time: new Date().toISOString(),
    };
    await fetch(`${API_BACKEND}-save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  };

  const loadSaves = async () => {
    try {
      const res = await fetch(`${API_BACKEND}-save?user=${encodeURIComponent(auth.username)}`);
      const data = await res.json();
      setSavedList(data || []);
    } catch { setSavedList([]); }
  };

  const loadReading = (save) => {
    setAllResults(save.results || []);
    setChatHistory(save.chat || []);
    setResult(save.results?.length ? save.results[save.results.length - 1].result : "");
    setTab("analyze");
  };

  const loadUsersList = async () => {
    try {
      const res = await fetch(`${API_BACKEND.replace("/api/fortune", "/api/fortune-users")}`);
      const data = await res.json();
      setUsersList(data || {});
    } catch {}
  };
  const fileInputRef = useRef(null);

  const askFollowUp = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput("");
    setChatHistory(prev => [...prev, { role: "user", text: question }]);
    setChatLoading(true);
    try {
      // Build full context — include ALL chart data as persistent memory
      const chartMemory = allResults.map(r => `【${r.system}】\n${r.result}`).join("\n\n===\n\n");
      const recentChat = chatHistory.slice(-8).map(m => `${m.role === "user" ? "問" : "答"}：${m.text}`).join("\n\n");
      const context = `## ⚠️ 用戶的命盤資料（已確認，不可修改，每次回答必須參照）\n\n${chartMemory}\n\n---\n\n${recentChat ? `## 對話紀錄\n${recentChat}\n\n---\n\n` : ""}## 用戶追問\n${question}\n\n## 回答規則（極重要）\n1. **必須回去查看上方的命盤排盤資料**，引用具體的星曜、宮位、四化作為依據\n2. 不可憑空回答，每個論點都要對應到命盤中的具體資料\n3. 若涉及流年，必須參考排盤中的流年四化和疊宮資料\n4. 若有紫微命盤，流年必須用紫微方法（斗君排月），不可用占星方法替代\n5. 若問財運相關，參考財帛宮、福德宮、田宅宮的星曜和飛化\n6. 回答要具體，例如「你的財帛宮天梁陷+陀羅，代表...」而非泛泛而談`;

      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: "你是命理分析師，根據命盤分析結果回答追問。用繁體中文，簡潔專業。", prompt: context }),
      });
      if (!submitRes.ok) throw new Error(`提交失敗 ${submitRes.status}`);
      const { job_id } = await submitRes.json();
      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
          if (!pollRes.ok) continue;
          const pollData = await pollRes.json();
          if (pollData.status === "done") {
            setChatHistory(prev => [...prev, { role: "assistant", text: pollData.result }]);
            return;
          }
        } catch { continue; }
      }
      throw new Error("回覆逾時");
    } catch (err) {
      setChatHistory(prev => [...prev, { role: "assistant", text: `錯誤：${err.message}` }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  // 共用：排盤後自動送 AI 分析（engine: "claude" or "manus"）
  const autoAnalyze = async (systemName, chartText, systemPrompt, engine = "claude") => {
    try {
      let prompt;
      if (engine === "manus") {
        prompt = chartText;
      } else if (systemName === "紫微財運") {
        prompt = `⚠️ 以下是紫微斗數財運專項排盤資料，已經確認正確。直接基於此資料進行財運深度分析。

${chartText}

請按照以下框架進行【紫微斗數財運專項分析】：

## 一、本命財運格局
1. 財帛宮主星特質與財運基本面（參考知識庫中的星曜財運特質）
2. 三方四正鐵三角分析（命宮→官祿→財帛→遷移的連動）
3. 福德宮分析（財運真正源頭：豐盛思維 or 匱乏思維）
4. 田宅宮財庫分析（守財能力、不動產運）
5. 生年四化對財運的影響
6. 重點宮位飛化因果推導（用飛化表分析：哪個宮位的天干導致哪顆星化忌/化祿→財務因果鏈）

## 二、大限財運（當前十年）
1. 大限財帛宮疊本命哪宮→十年財運主題
2. 大限四化引動分析
3. 大限福德宮、田宅宮狀態

## 三、今年流年財運
1. 流年財帛宮疊本命哪宮→今年財運主題
2. 流年四化引動本命/大限宮位
3. 高風險區標記（化忌/陀羅/擎羊位置）

## 四、12個月流月財運走勢
逐月分析流月財帛宮的變化，標出：
- 財運最好的月份（化祿/祿存進入）
- 需要注意的月份（化忌/煞星進入）
- 投資/簽約/求職的最佳時機

## 五、財運建議
1. 適合的投資類型（穩定型/獲利型/天王型）
2. 賺錢方式建議（根據命宮+財帛宮主星特質）
3. 需要避免的財務陷阱
4. 貴人方向（僕役宮飛化分析）
5. 財運方位建議

要極度深入、專業、具體。每個分析都要引用具體的星曜和宮位資料作為依據。`;
      } else {
        prompt = `⚠️ 以下排盤資料已經過確認，是正確的。不要重新排盤，不要修改任何宮位或星曜。直接基於此資料分析。\n\n${chartText}\n\n請根據以上【${systemName}】排盤進行分析：\n1. 格局分析\n2. 重點宮位/柱位深入分析\n3. 今年運勢（2026丙午年）\n4. 綜合建議\n\n要深入、專業、具體。\n⚠️ 嚴格只用【${systemName}】的術語。`;
      }
      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: [],
          system: systemPrompt,
          prompt,
          engine,
        }),
      });
      if (!submitRes.ok) return null;
      const { job_id } = await submitRes.json();
      for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
          if (!pollRes.ok) continue;
          const pd = await pollRes.json();
          if (pd.status === "done") return pd.result;
        } catch { continue; }
      }
    } catch (err) { console.error(`${systemName} 分析失敗:`, err); }
    return null;
  };

  const toggleSystem = (sys) => setSelectedSystems(prev =>
    prev.includes(sys) ? prev.filter(s => s !== sys) : [...prev, sys]
  );

  const handleFiles = useCallback((files) => {
    const incoming = Array.from(files).filter(
      f => f.type.startsWith("image/") || f.type === "application/pdf"
    );
    if (incoming.length === 0) return;

    const newImages = [];
    let loaded = 0;
    incoming.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newImages.push({
          id: Date.now() + Math.random(),
          name: file.name,
          type: file.type.startsWith("image/") ? file.type : "image/png",
          data: e.target.result.split(",")[1],
          preview: e.target.result,
          chartType: "auto",
        });
        loaded++;
        if (loaded === incoming.length) {
          setImages(prev => [...prev, ...newImages].slice(0, 5));
        }
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const removeImage = (id) => setImages(prev => prev.filter(img => img.id !== id));

  const analyze = async () => {
    if (images.length === 0) return;
    setAnalyzing(true);
    setError("");
    setResult("");

    let msgIdx = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIdx]);
    }, 3000);

    try {
      const systemPrompt = buildSystemPrompt(kbEntries);
      const SYS_NAMES = { bazi: "八字", astro: "西洋占星", ziwei: "紫微斗數" };

      // Helper: submit one image and poll for result
      const submitAndPoll = async (img, sysName, extraPrompt) => {
        const submitRes = await fetch(API_BACKEND, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images: [{ data: img.data, media_type: img.type }],
            system: systemPrompt,
            prompt: extraPrompt,
          }),
        });
        if (!submitRes.ok) throw new Error(`提交失敗 ${submitRes.status}`);
        const { job_id } = await submitRes.json();
        for (let i = 0; i < 300; i++) {
          await new Promise(r => setTimeout(r, 3000));
          try {
            const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
            if (!pollRes.ok) continue;
            const pollData = await pollRes.json();
            if (pollData.status === "done") {
              setAllResults(prev => [...prev, { system: sysName, result: pollData.result }]);
              setResult(pollData.result);
              return pollData.result;
            }
          } catch { continue; }
        }
        throw new Error(`${sysName} 分析逾時`);
      };

      // Submit each image one by one, show result as each completes
      if (selectedSystems.length > 0 && selectedSystems.length === images.length) {
        // Each image maps to a system
        for (let i = 0; i < images.length; i++) {
          const sys = SYS_NAMES[selectedSystems[i]] || "自動辨識";
          const prompt = `這是【${sys}】的命盤圖片。\n辨識並排盤 + 初步分析（格局、重點宮位）。\n⚠️ 嚴格只用【${sys}】的術語。${correction.trim() ? `\n用戶補充：${correction}` : ""}`;
          setLoadingMsg(`正在分析第 ${i + 1} 張命盤（${sys}）...`);
          await submitAndPoll(images[i], sys, prompt);
        }
      } else {
        // All images as one batch or single system for all
        const systems = selectedSystems.map(s => SYS_NAMES[s]).join("＋") || "";
        for (let i = 0; i < images.length; i++) {
          const sysLabel = systems || `命盤 ${i + 1}`;
          const prompt = systems
            ? `這是【${systems}】的命盤圖片（第 ${i + 1}/${images.length} 張）。\n辨識並排盤 + 初步分析。\n⚠️ 嚴格只用該系統的術語。${correction.trim() ? `\n用戶補充：${correction}` : ""}`
            : `請辨識這張命盤圖片的類型，排盤 + 初步分析。${correction.trim() ? `\n用戶補充：${correction}` : ""}`;
          setLoadingMsg(`正在分析第 ${i + 1}/${images.length} 張命盤...`);
          await submitAndPoll(images[i], sysLabel, prompt);
        }
      }
    } catch (err) {
      setError("分析過程發生錯誤：" + err.message);
    } finally {
      clearInterval(interval);
      setAnalyzing(false);
      setAddingChart(false);
      autoSaveRef.current?.();
    }
  };

  return (
    <div className="app">
      <div className="bg-pattern" />

      {/* Header */}
      <div className="header">
        <div className="header-icon">✦</div>
        <h1>命理三鏡</h1>
        <p className="tagline">八字 · 占星 · 紫微｜交叉解盤</p>
      </div>

      {/* Nav */}
      <div className="content">
        <div className="nav-tabs">
          <button className={`nav-tab ${tab === "analyze" ? "active" : ""}`} onClick={() => setTab("analyze")}>
            <span className="tab-icon">⟐</span> 解盤
          </button>
          <button className={`nav-tab ${tab === "saves" ? "active" : ""}`} onClick={() => { setTab("saves"); loadSaves(); }}>
            <span className="tab-icon">💾</span> 存檔
          </button>
          {isAdmin && (
            <button className={`nav-tab ${tab === "kb" ? "active" : ""}`} onClick={() => setTab("kb")}>
              <span className="tab-icon">📚</span> 知識庫
              {kbEntries.length > 0 && <span className="badge">{kbEntries.length}</span>}
            </button>
          )}
          {isAdmin && (
            <button className={`nav-tab ${tab === "users" ? "active" : ""}`} onClick={() => { setTab("users"); loadUsersList(); }}>
              <span className="tab-icon">👥</span> 用戶
            </button>
          )}
          {isAdmin && (
            <button className={`nav-tab ${tab === "feedback" ? "active" : ""}`} onClick={() => {
              setTab("feedback");
              fetch(`${API_BACKEND}-feedback`).then(r => r.json()).then(d => setFeedbackList(d)).catch(() => {});
            }}>
              <span className="tab-icon">⚠️</span> 反饋
            </button>
          )}
          <button className="nav-tab logout-tab" onClick={() => { if (confirm("確定登出？")) onLogout(); }}>
            👤 {auth.name || auth.username} ✕
          </button>
        </div>

        {/* ===== Analyze Tab ===== */}
        {tab === "analyze" && (
          <>
            {!analyzing && (!result || addingChart) && (
              <div className="upload-section">
                {/* Mode toggle */}
                <div className="mode-toggle">
                  <button className={`mode-btn ${inputMode === "auto" ? "active" : ""}`} onClick={() => setInputMode("auto")}>
                    🔮 自動排盤
                  </button>
                  <button className={`mode-btn ${inputMode === "upload" ? "active" : ""}`} onClick={() => setInputMode("upload")}>
                    📷 上傳命盤圖
                  </button>
                </div>

                {/* Auto calc mode */}
                {inputMode === "auto" && (
                  <div className="auto-calc-section">
                    <p className="instruction">輸入出生資料，自動排盤</p>
                    <div className="birth-form">
                      <div className="birth-row">
                        <label>年</label>
                        <input type="number" placeholder="1990" value={birthData.year}
                          onChange={e => setBirthData(p => ({...p, year: e.target.value}))} />
                      </div>
                      <div className="birth-row">
                        <label>月</label>
                        <input type="number" placeholder="1" min="1" max="12" value={birthData.month}
                          onChange={e => setBirthData(p => ({...p, month: e.target.value}))} />
                      </div>
                      <div className="birth-row">
                        <label>日</label>
                        <input type="number" placeholder="15" min="1" max="31" value={birthData.day}
                          onChange={e => setBirthData(p => ({...p, day: e.target.value}))} />
                      </div>
                      <div className="birth-row">
                        <label>時</label>
                        <input type="number" placeholder="15" min="0" max="23" value={birthData.hour}
                          onChange={e => setBirthData(p => ({...p, hour: e.target.value}))} />
                      </div>
                      <div className="birth-row">
                        <label>分</label>
                        <input type="number" placeholder="00" min="0" max="59" value={birthData.minute}
                          onChange={e => setBirthData(p => ({...p, minute: e.target.value}))} />
                      </div>
                      <div className="birth-row">
                        <label>性別</label>
                        <select value={birthData.gender} onChange={e => setBirthData(p => ({...p, gender: e.target.value}))}>
                          <option value="男">男</option>
                          <option value="女">女</option>
                        </select>
                      </div>
                      {autoSystems.includes("astro") && (
                        <div className="birth-row birth-full-row">
                          <label>出生地</label>
                          <select value={birthData.birthPlace} onChange={e => {
                            const places = {
                              "桃園": [24.9936, 121.3130], "台北": [25.0330, 121.5654], "新北": [25.0169, 121.4628],
                              "基隆": [25.1283, 121.7419], "新竹": [24.8015, 120.9718], "苗栗": [24.5602, 120.8214],
                              "台中": [24.1477, 120.6736], "彰化": [24.0518, 120.5161], "南投": [23.7609, 120.6833],
                              "雲林": [23.7092, 120.4313], "嘉義": [23.4801, 120.4491], "台南": [22.9999, 120.2269],
                              "高雄": [22.6273, 120.3014], "屏東": [22.6762, 120.4929], "宜蘭": [24.7570, 121.7533],
                              "花蓮": [23.9910, 121.6115], "台東": [22.7583, 121.1444], "澎湖": [23.5711, 119.5793],
                              "金門": [24.4493, 118.3767], "馬祖": [26.1608, 119.9491],
                              "香港": [22.3193, 114.1694], "上海": [31.2304, 121.4737], "北京": [39.9042, 116.4074],
                              "東京": [35.6762, 139.6503], "首爾": [37.5665, 126.9780],
                              "紐約": [40.7128, -74.0060], "洛杉磯": [34.0522, -118.2437], "倫敦": [51.5074, -0.1278],
                            };
                            const [lat, lng] = places[e.target.value] || [24.9936, 121.3130];
                            setBirthData(p => ({...p, birthPlace: e.target.value, lat, lng}));
                          }}>
                            <optgroup label="台灣">
                              {["桃園","台北","新北","基隆","新竹","苗栗","台中","彰化","南投","雲林","嘉義","台南","高雄","屏東","宜蘭","花蓮","台東","澎湖","金門","馬祖"].map(c => <option key={c} value={c}>{c}</option>)}
                            </optgroup>
                            <optgroup label="海外">
                              {["香港","上海","北京","東京","首爾","紐約","洛杉磯","倫敦"].map(c => <option key={c} value={c}>{c}</option>)}
                            </optgroup>
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="auto-system-selector">
                      {[
                        { id: "ziwei", label: "紫微斗數", icon: "💜" },
                        { id: "bazi", label: "八字", icon: "🔥" },
                        { id: "astro", label: "西洋占星", icon: "♎" },
                        { id: "finance", label: "財運分析", icon: "💰" },
                      ].map(sys => (
                        <button key={sys.id}
                          className={`system-btn ${autoSystems.includes(sys.id) ? "active" : ""}`}
                          onClick={() => setAutoSystems(prev => prev.includes(sys.id) ? prev.filter(s => s !== sys.id) : [...prev, sys.id])}
                        >
                          <span>{sys.icon}</span> {sys.label}
                        </button>
                      ))}
                    </div>
                    <button className="analyze-btn" disabled={autoSystems.length === 0 || analyzing} onClick={async () => {
                      try {
                        const y = parseInt(birthData.year), m = parseInt(birthData.month), d = parseInt(birthData.day);
                        const h = parseInt(birthData.hour);
                        if (!y || !m || !d) { setError("請填寫完整出生資料"); return; }

                        const min = parseInt(birthData.minute) || 0;
                        const calcMap = {
                          ziwei: { system: "紫微斗數", calc: () => formatChart(calculateChart(y, m, d, h, 0, birthData.gender)) },
                          bazi: { system: "八字", calc: () => formatBazi(calculateBazi(y, m, d, h, birthData.gender)) },
                          astro: { system: "西洋占星", calc: () => formatAstro(calculateAstro(y, m, d, h, min, birthData.lat, birthData.lng)) },
                          finance: { system: "紫微財運", calc: () => formatFinance(calculateFinance(y, m, d, h, birthData.gender)) },
                        };

                        const engineMap = { "紫微斗數": "claude", "八字": "claude", "西洋占星": "manus", "紫微財運": "claude" };

                        // Show loading animation during chart calculation
                        setAnalyzing(true);
                        setLoadingMsg("正在排盤計算中...");
                        await new Promise(r => setTimeout(r, 2000));

                        const charts = autoSystems.map(id => ({ system: calcMap[id].system, text: calcMap[id].calc(), engine: engineMap[calcMap[id].system] || "claude" }));
                        setAllResults(prev => [...prev, ...charts.map(c => ({ system: c.system, result: c.text }))]);
                        setResult(charts.map(c => c.text).join("\n\n---\n\n"));
                        setAddingChart(false);
                        setLoadingMsg("排盤完成！命盤分析進行中...");
                        const sp = buildSystemPrompt(kbEntries);
                        setLoadingMsg(`正在並行分析 ${charts.length} 盤...`);

                        // 並行送出所有分析
                        const analyzePromises = charts.map(c =>
                          autoAnalyze(c.system, c.text, sp, c.engine)
                            .then(r => {
                              if (r) {
                                // 用分析結果替換排盤條目（排盤+分析合併為一條）
                                setAllResults(prev => prev.map(item =>
                                  item.system === c.system ? { system: c.system + "（命盤分析）", result: item.result + "\n\n---\n\n" + r } : item
                                ));
                                setResult(r);
                                setLoadingMsg(`${c.system} 分析完成！`);
                              }
                              return { system: c.system, result: r, text: c.text };
                            })
                        );
                        const results = await Promise.all(analyzePromises);

                        // 交叉分析（2盤以上，由 Claude 做）
                        if (charts.length > 1) {
                          setLoadingMsg(`交叉比對 ${charts.length} 大系統...`);
                          const crossInput = results.filter(r => r.result).map(r => `【${r.system}分析結果】\n${r.result}`).join("\n\n===\n\n");
                          const crossResult = await autoAnalyze(`${charts.length}系統交叉`, crossInput, sp, "claude");
                          if (crossResult) { setAllResults(prev => [...prev, { system: "交叉分析", result: crossResult }]); setResult(crossResult); }
                        }

                        setAnalyzing(false); setLoadingMsg("");
                        autoSaveRef.current?.();
                      } catch (err) { setError("排盤錯誤：" + err.message); setAnalyzing(false); }
                    }}>
                      <span style={{ fontSize: 18 }}>⟐</span>
                      {autoSystems.length > 1 ? `排盤 + 命運分析（${autoSystems.length} 盤）` : "排盤 + 命運分析"}
                    </button>
                  </div>
                )}

                {/* Upload mode */}
                {inputMode === "upload" && (
                  <>
                <p className="instruction">選擇命盤類型</p>
                <div className="system-selector">
                  {[
                    { id: "ziwei", label: "紫微斗數", icon: "💜" },
                    { id: "bazi", label: "八字", icon: "🔥" },
                    { id: "astro", label: "西洋占星", icon: "♎" },
                  ].map(sys => (
                    <button
                      key={sys.id}
                      className={`system-btn ${selectedSystems.includes(sys.id) ? "active" : ""}`}
                      onClick={() => toggleSystem(sys.id)}
                    >
                      <span>{sys.icon}</span> {sys.label}
                    </button>
                  ))}
                </div>
                <p className="sub-instruction">
                  {selectedSystems.length === 0 ? "未選擇＝自動辨識（較慢）" : `已選：${selectedSystems.map(s => ({bazi:"八字",astro:"占星",ziwei:"紫微"})[s]).join("＋")}｜上傳對應命盤截圖`}
                  {kbEntries.length > 0 && (
                    <span style={{ color: "var(--teal)" }}>
                      {" "}· 已載入 {kbEntries.length} 筆知識
                    </span>
                  )}
                </p>

                {/* API 由伺服器端處理，無需設定 Key */}

                <div
                  className={`drop-zone ${dragOver ? "active" : ""}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="drop-icon">{images.length > 0 ? "➕" : "📷"}</div>
                  <p className="drop-text">
                    {images.length > 0 ? "點擊或拖曳添加更多命盤" : "點擊或拖曳命盤圖片到這裡"}
                  </p>
                  <p className="drop-hint">支援 JPG、PNG</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={e => handleFiles(e.target.files)}
                  />
                </div>

                {images.length > 0 && (
                  <div className="previews">
                    {images.map(img => (
                      <div className="preview-card" key={img.id}>
                        <img src={img.preview} alt={img.name} />
                        <button className="remove-btn" onClick={e => { e.stopPropagation(); removeImage(img.id); }}>✕</button>
                        <div className="name">{img.name.length > 12 ? img.name.slice(0, 12) + "…" : img.name}</div>
                      </div>
                    ))}
                  </div>
                )}

                {images.length > 0 && (
                  <>
                    <div className="correction-section">
                      <textarea
                        className="correction-input"
                        placeholder="（選填）補充或修正命盤資訊，例如：&#10;兄弟宮：廉貞、天相&#10;交友宮：貪狼&#10;命主出生：1990年3月15日 午時"
                        value={correction}
                        onChange={e => setCorrection(e.target.value)}
                        rows={3}
                      />
                    </div>
                    <button className="analyze-btn" onClick={analyze}>
                      <span style={{ fontSize: 18 }}>⟐</span>
                      開始解盤（{images.length} 張命盤）
                    </button>
                  </>
                )}
                  </>
                )}
              </div>
            )}

            {analyzing && !result && (
              <div className="loading-section">
                <div className="spinner" />
                <p className="loading-text">{loadingMsg}</p>
                <div className="loading-bar"><div className="loading-bar-inner" /></div>
              </div>
            )}

            {error && (
              <div className="error-card">
                <p>{error}</p>
                <button className="retry-btn" onClick={() => { setError(""); setResult(""); }}>重新上傳</button>
              </div>
            )}

            {result && (
              <div className="result-section">
                <div style={{ textAlign: "center" }}>
                  <span className="result-badge">{analyzing ? `⏳ 分析中（${allResults.length} 項完成）` : `✓ ${allResults.length > 1 ? `已完成 ${allResults.length} 項分析` : "分析完成"}`}</span>
                  {allResults.length > 1 && (
                    <span className="result-badge" style={{ marginLeft: 8, background: "rgba(76,201,176,0.12)", color: "var(--teal)" }}>
                      {allResults.map(r => r.system).join(" + ")}
                    </span>
                  )}
                </div>

                {/* Show all accumulated results — collapsible */}
                {allResults.length > 1 ? (
                  allResults.map((r, i) => (
                    <details key={i} className="result-block" open={i === allResults.length - 1}>
                      <summary className="result-block-title">{r.system} 分析 <span className="toggle-hint">{i === allResults.length - 1 ? "▼" : "▶"}</span></summary>
                      <div className="result-content">{renderMarkdown(r.result)}</div>
                    </details>
                  ))
                ) : (
                  <details className="result-block" open>
                    <summary className="result-block-title">{allResults[0]?.system || "分析結果"} <span className="toggle-hint">▼</span></summary>
                    <div className="result-content">{renderMarkdown(result)}</div>
                  </details>
                )}

                {/* Inline loading while AI analysis in progress */}
                {analyzing && (
                  <div className="inline-loading">
                    <div className="spinner-small" />
                    <span className="loading-text-small">{loadingMsg}</span>
                  </div>
                )}

                {/* Detail analysis button */}
                <div className="action-row">
                  <button className="detail-btn" disabled={detailLoading} onClick={async () => {
                    setDetailLoading(true);
                    try {
                      const lastResult = allResults[allResults.length - 1];
                      const submitRes = await fetch(API_BACKEND, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          images: [],
                          system: buildSystemPrompt(kbEntries),
                          prompt: `⚠️ 以下排盤資料已經過確認，是正確的。不要重新排盤，不要修改任何宮位或星曜。直接基於此資料分析。\n\n${lastResult.result}\n\n請根據以上【已確認的排盤資料】進行完整詳細分析：\n1. 格局分析（命格、主星特質）\n2. 各宮位詳解（重點宮位深入分析）\n3. 四化影響\n4. 今年流年運勢（2026丙午年）——若有紫微命盤，必須用流年斗君定位排月，不可用占星方法替代\n5. 大限走勢\n6. 綜合建議\n\n要深入、專業、具體，不要泛泛而談。\n⚠️ 嚴格只用該系統的術語，不要混入其他命理系統概念。`,
                        }),
                      });
                      const { job_id } = await submitRes.json();
                      for (let i = 0; i < 300; i++) {
                        await new Promise(r => setTimeout(r, 3000));
                        try {
                          const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
                          if (!pollRes.ok) continue;
                          const pd = await pollRes.json();
                          if (pd.status === "done") {
                            const sys = lastResult.system + "（詳細）";
                            setAllResults(prev => [...prev, { system: sys, result: pd.result }]);
                            setResult(pd.result);
                            break;
                          }
                        } catch { continue; }
                      }
                    } finally { setDetailLoading(false); }
                  }}>
                    {detailLoading ? "⏳ 分析中..." : "🔍 詳細分析"}
                  </button>
                  <button className="detail-btn" disabled={detailLoading || analyzing} onClick={async () => {
                    // Try birthData first, then extract from existing chart results
                    let y = parseInt(birthData.year), m = parseInt(birthData.month), d = parseInt(birthData.day);
                    let h = parseInt(birthData.hour), gender = birthData.gender;
                    if (!y || !m || !d) {
                      // Extract from allResults text
                      const allText = allResults.map(r => r.result).join("\n");
                      const dateMatch = allText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
                      const hourMatch = allText.match(/(\d{1,2})[：:](\d{2})/);
                      const shiMatch = allText.match(/時辰[：:]?\s*([\u5b50\u4e11\u5bc5\u536f\u8fb0\u5df3\u5348\u672a\u7533\u9149\u620c\u4ea5])/);
                      const genderMatch = allText.match(/(男|女)/);
                      if (dateMatch) { y = parseInt(dateMatch[1]); m = parseInt(dateMatch[2]); d = parseInt(dateMatch[3]); }
                      if (hourMatch) { h = parseInt(hourMatch[1]); }
                      else if (shiMatch) {
                        const shiMap = {"子":0,"丑":1,"寅":3,"卯":5,"辰":7,"巳":9,"午":11,"未":13,"申":15,"酉":17,"戌":19,"亥":21};
                        h = shiMap[shiMatch[1]] ?? 12;
                      }
                      if (genderMatch) gender = genderMatch[1];
                    }
                    if (!y || !m || !d) {
                      setError("無法從現有資料中提取出生資料，請在表單中填寫出生資料後再試");
                      return;
                    }
                    setAnalyzing(true);
                    setLoadingMsg("正在計算財運排盤...");
                    try {
                      const finText = formatFinance(calculateFinance(y, m, d, h, gender));
                      setAllResults(prev => [...prev, { system: "紫微財運", result: finText }]);
                      setResult(finText);
                      setLoadingMsg("正在進行財運深度分析...");
                      const sp = buildSystemPrompt(kbEntries);
                      const r = await autoAnalyze("紫微財運", finText, sp, "claude");
                      if (r) {
                        setAllResults(prev => [...prev, { system: "紫微財運（命盤分析）", result: r }]);
                        setResult(r);
                      }
                    } catch (err) { setError("財運分析錯誤：" + err.message); }
                    finally { setAnalyzing(false); setLoadingMsg(""); autoSaveRef.current?.(); }
                  }}>
                    {analyzing ? "⏳ 分析中..." : "💰 財運分析"}
                  </button>
                </div>

                {/* Follow-up chat */}
                <div className="chat-section">
                  <div className="chat-divider">💬 追問命盤問題</div>
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`chat-msg ${msg.role}`}>
                      <div className="chat-label">{msg.role === "user" ? "你" : "命理師"}</div>
                      <div className="chat-bubble">
                        {msg.role === "assistant" ? renderMarkdown(msg.text) : msg.text}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="chat-msg assistant">
                      <div className="chat-label">命理師</div>
                      <div className="chat-bubble typing">思考中...</div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                  <div className="chat-input-row">
                    <input
                      className="chat-input"
                      placeholder="針對這個命盤提問，例如：今年感情運如何？"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onCompositionStart={() => setComposing(true)}
                      onCompositionEnd={() => setComposing(false)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !composing) { e.preventDefault(); askFollowUp(); } }}
                      disabled={chatLoading}
                    />
                    <button className="chat-send" onClick={askFollowUp} disabled={chatLoading || !chatInput.trim()}>
                      {chatLoading ? "⏳" : "➤"}
                    </button>
                  </div>
                  {/* Report issue */}
                  <button className="report-btn" onClick={() => {
                    const issue = prompt("描述分析錯誤的地方（例如：兄弟宮應該是廉貞不是貪狼、流年計算方式錯誤等）：");
                    if (!issue) return;
                    fetch(`${API_BACKEND}-feedback`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        user: auth.username,
                        issue,
                        context: allResults.map(r => r.system).join("+"),
                        result_preview: result.slice(0, 500),
                        chat: chatHistory.slice(-4),
                        time: new Date().toISOString(),
                      }),
                    }).then(() => alert("已回報，感謝反饋！")).catch(() => alert("回報失敗"));
                  }}>
                    ⚠️ 回報分析錯誤
                  </button>
                </div>

                {/* Add more charts / cross-analyze — always at bottom */}
                <div className="action-row bottom-actions">
                  <button className="add-chart-btn" onClick={() => { setAddingChart(true); setImages([]); setSelectedSystems([]); setCorrection(""); }}>
                    ➕ 追加其他命盤
                  </button>
                  {allResults.length > 1 && (
                    <button className="cross-btn" onClick={async () => {
                      setChatLoading(true);
                      try {
                        const allText = allResults.map(r => `【${r.system}】\n${r.result}`).join("\n\n---\n\n");
                        const submitRes = await fetch(API_BACKEND, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            images: [],
                            system: "你是命理交叉分析專家。用繁體中文回答。",
                            prompt: `以下是同一個人的多個命盤分析結果，請進行交叉比對，找出共鳴點和矛盾點，給出綜合結論。\n\n${allText}`,
                          }),
                        });
                        const { job_id } = await submitRes.json();
                        for (let i = 0; i < 300; i++) {
                          await new Promise(r => setTimeout(r, 3000));
                          try {
                            const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
                            if (!pollRes.ok) continue;
                            const pd = await pollRes.json();
                            if (pd.status === "done") {
                              setAllResults(prev => [...prev, { system: "⟐ 交叉分析", result: pd.result }]);
                              setResult(pd.result);
                              break;
                            }
                          } catch { continue; }
                        }
                      } finally { setChatLoading(false); }
                    }}>
                      ⟐ 交叉分析
                    </button>
                  )}
                </div>

                <div className="action-row">
                  <button className="save-btn" onClick={saveReading}>
                    💾 存檔
                  </button>
                  <button className="reset-btn" style={{ flex: 1 }} onClick={() => { setResult(""); setImages([]); setChatHistory([]); setAllResults([]); setSelectedSystems([]); setCorrection(""); sessionStorage.removeItem("fortune-results"); }}>
                    全部重來
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== Knowledge Base Tab ===== */}
        {tab === "kb" && (
          <KnowledgeBase entries={kbEntries} setEntries={setKbEntries} />
        )}

        {/* ===== Saves Tab ===== */}
        {tab === "saves" && (
          <div className="saves-section">
            <div className="setting-card">
              <div className="setting-title">📂 {auth.name || auth.username} 的命盤紀錄</div>
            </div>
            {savedList.length > 0 ? (
              <div className="save-list">
                {savedList.map((s, i) => (
                  <div key={i} className="save-card" onClick={() => loadReading(s)}>
                    <div className="save-card-title">{s.person || "未命名"}</div>
                    <div className="save-card-time">{s.systems?.filter(x => !x.includes("命盤分析")).join(" + ") || "命盤"} · {new Date(s.time).toLocaleString("zh-TW")}</div>
                    <div className="save-card-preview">{s.results?.[0]?.result?.slice(0, 80)}...</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="save-empty">尚無存檔紀錄，解盤後按「💾 存檔」即可保存</div>
            )}
          </div>
        )}

        {/* ===== Users Tab (admin) ===== */}
        {tab === "users" && isAdmin && (
          <div className="saves-section">
            <div className="setting-card">
              <div className="setting-title">👥 用戶管理</div>
            </div>
            <div className="save-list">
              {Object.entries(usersList).map(([uname, u]) => (
                <div key={uname} className="save-card user-card">
                  <div className="save-card-title">
                    {u.name || uname}
                    <span className={`role-badge ${u.role}`}>{u.role === "admin" ? "管理員" : "用戶"}</span>
                  </div>
                  <div className="save-card-time">帳號：{uname}</div>
                  {uname !== "admin" && (
                    <div className="user-actions">
                      <button onClick={async () => {
                        await fetch(`${API_BACKEND.replace("/api/fortune", "/api/fortune-users")}`, {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "set_role", username: uname, role: u.role === "admin" ? "user" : "admin" }),
                        });
                        loadUsersList();
                      }}>{u.role === "admin" ? "降為用戶" : "升為管理員"}</button>
                      <button onClick={async () => {
                        await fetch(`${API_BACKEND.replace("/api/fortune", "/api/fortune-users")}`, {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "reset_password", username: uname, password: "123456" }),
                        });
                        alert(`已重設 ${uname} 密碼為 123456`);
                      }}>重設密碼</button>
                      <button className="danger" onClick={async () => {
                        if (!confirm(`確定刪除 ${uname}？`)) return;
                        await fetch(`${API_BACKEND.replace("/api/fortune", "/api/fortune-users")}`, {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "delete", username: uname }),
                        });
                        loadUsersList();
                      }}>刪除</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== Feedback Tab (admin) ===== */}
        {tab === "feedback" && isAdmin && (
          <div className="saves-section">
            <div className="setting-card">
              <div className="setting-title">⚠️ 用戶反饋（{feedbackList.length} 筆）</div>
            </div>
            {feedbackList.length > 0 ? (
              <div className="save-list">
                {feedbackList.map((f, i) => (
                  <div key={i} className="save-card feedback-card">
                    <div className="save-card-title">
                      👤 {f.user || "匿名"} — {f.context || ""}
                    </div>
                    <div className="save-card-time">{f.time ? new Date(f.time).toLocaleString("zh-TW") : ""}</div>
                    <div className="feedback-issue">❌ {f.issue}</div>
                    {f.result_preview && (
                      <details>
                        <summary style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>查看分析摘要</summary>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{f.result_preview}</div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="save-empty">尚無反饋</div>
            )}
          </div>
        )}
      </div>

      <div className="footer">
        <p>⚠️ 僅供參考娛樂，不構成人生重大決策依據</p>
      </div>
    </div>
  );
}
