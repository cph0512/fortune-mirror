import { useState, useRef, useCallback, useEffect } from "react";
import './App.css';

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
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
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
        <div className="setting-title">AI 引擎</div>
        <div className="setting-desc">
          由伺服器端 Claude 引擎驅動，無需設定 API Key。
        </div>
        <div className="status ok">✓ 伺服器端 AI 已連線</div>
      </div>

      <div className="setting-card">
        <div className="setting-title">AI 模型</div>
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
          4. AI 會結合你的知識庫 + 內建知識進行分析<br />
          5. 知識庫越豐富，分析越精準！
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================

export default function App() {
  const [tab, setTab] = useState("analyze"); // analyze | kb | settings
  const [images, setImages] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [loadingMsg, setLoadingMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [kbEntries, setKbEntries] = useState(loadKB);
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [model, setModel] = useState(loadModel);
  const [selectedSystems, setSelectedSystems] = useState([]); // ["bazi", "astro", "ziwei"]
  const [correction, setCorrection] = useState(""); // user correction text
  const [allResults, setAllResults] = useState([]); // [{system, result}] — accumulated analyses
  const [chatHistory, setChatHistory] = useState([]); // [{role, text}]
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const askFollowUp = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput("");
    setChatHistory(prev => [...prev, { role: "user", text: question }]);
    setChatLoading(true);
    try {
      // Build concise context from all analyses
      const allText = allResults.length > 0
        ? allResults.map(r => `【${r.system}】${r.result.slice(0, 800)}`).join("\n\n")
        : result.slice(0, 2000);
      const recentChat = chatHistory.slice(-6).map(m => `${m.role === "user" ? "問" : "答"}：${m.text}`).join("\n");
      const context = `命盤分析摘要：\n${allText}\n\n${recentChat ? `近期對話：\n${recentChat}\n\n` : ""}用戶追問：${question}\n\n簡潔回答，保持專業。`;

      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: "你是命理分析師，根據命盤分析結果回答追問。用繁體中文，簡潔專業。", prompt: context }),
      });
      const { job_id } = await submitRes.json();
      while (true) {
        await new Promise(r => setTimeout(r, 3000));
        const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
        const pollData = await pollRes.json();
        if (pollData.status === "done") {
          setChatHistory(prev => [...prev, { role: "assistant", text: pollData.result }]);
          break;
        }
        if (pollData.error) throw new Error(pollData.error);
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { role: "assistant", text: `錯誤：${err.message}` }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
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
      const systems = selectedSystems.map(s => SYS_NAMES[s]).join("＋");
      let userPrompt = selectedSystems.length > 0
        ? `這些是【${systems}】的命盤圖片，共 ${images.length} 張。不需要辨識命盤類型，直接提取關鍵資訊進行${systems}分析。${selectedSystems.length > 1 ? "並進行交叉分析。" : ""}今年是2026丙午年。`
        : `請分析以上 ${images.length} 張命盤圖片。請辨識每張圖屬於哪個命理系統（八字、西洋占星、紫微斗數），提取所有關鍵資訊，然後進行完整的交叉分析。今年是2026丙午年。`;
      if (correction.trim()) {
        userPrompt += `\n\n⚠️ 用戶補充/修正資訊（以此為準，優先於圖片判讀）：\n${correction.trim()}`;
      }

      // Submit job
      const submitRes = await fetch(API_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: images.map(img => ({ data: img.data, media_type: img.type })),
          system: systemPrompt,
          prompt: userPrompt,
        }),
      });
      if (!submitRes.ok) {
        const errData = await submitRes.json().catch(() => ({}));
        throw new Error(errData.error || `提交失敗 ${submitRes.status}`);
      }
      const { job_id } = await submitRes.json();

      // Poll for result
      while (true) {
        await new Promise(r => setTimeout(r, 3000));
        const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
        const pollData = await pollRes.json();
        if (pollData.status === "done") {
          const SYS_NAMES = { bazi: "八字", astro: "西洋占星", ziwei: "紫微斗數" };
          const sysLabel = selectedSystems.map(s => SYS_NAMES[s]).join("＋") || "自動辨識";
          setAllResults(prev => [...prev, { system: sysLabel, result: pollData.result }]);
          setResult(pollData.result);
          break;
        }
        if (pollData.error) throw new Error(pollData.error);
      }
    } catch (err) {
      setError("分析過程發生錯誤：" + err.message);
    } finally {
      clearInterval(interval);
      setAnalyzing(false);
    }
  };

  return (
    <div className="app">
      <div className="bg-pattern" />

      {/* Header */}
      <div className="header">
        <div className="header-icon">✦</div>
        <h1>命理三鏡</h1>
        <p className="tagline">八字 · 占星 · 紫微｜AI 交叉解盤</p>
      </div>

      {/* Nav */}
      <div className="content">
        <div className="nav-tabs">
          <button className={`nav-tab ${tab === "analyze" ? "active" : ""}`} onClick={() => setTab("analyze")}>
            <span className="tab-icon">⟐</span> 解盤
          </button>
          <button className={`nav-tab ${tab === "kb" ? "active" : ""}`} onClick={() => setTab("kb")}>
            <span className="tab-icon">📚</span> 知識庫
            {kbEntries.length > 0 && <span className="badge">{kbEntries.length}</span>}
          </button>
          <button className={`nav-tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
            <span className="tab-icon">⚙️</span> 設定
          </button>
        </div>

        {/* ===== Analyze Tab ===== */}
        {tab === "analyze" && (
          <>
            {!analyzing && !result && (
              <div className="upload-section">
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
              </div>
            )}

            {analyzing && (
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
                  <span className="result-badge">✓ {allResults.length > 1 ? `已完成 ${allResults.length} 項分析` : "分析完成"}</span>
                  {allResults.length > 1 && (
                    <span className="result-badge" style={{ marginLeft: 8, background: "rgba(76,201,176,0.12)", color: "var(--teal)" }}>
                      {allResults.map(r => r.system).join(" + ")}
                    </span>
                  )}
                </div>

                {/* Show all accumulated results */}
                {allResults.length > 1 ? (
                  allResults.map((r, i) => (
                    <div key={i} className="result-block">
                      <div className="result-block-title">{r.system} 分析</div>
                      <div className="result-content">{renderMarkdown(r.result)}</div>
                    </div>
                  ))
                ) : (
                  <div className="result-content">{renderMarkdown(result)}</div>
                )}

                {/* Add more charts or cross-analyze */}
                <div className="action-row">
                  <button className="add-chart-btn" onClick={() => { setResult(""); setImages([]); setSelectedSystems([]); setCorrection(""); }}>
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
                        while (true) {
                          await new Promise(r => setTimeout(r, 3000));
                          const pollRes = await fetch(`${API_BACKEND}/${job_id}`);
                          const pd = await pollRes.json();
                          if (pd.status === "done") {
                            setAllResults(prev => [...prev, { system: "⟐ 交叉分析", result: pd.result }]);
                            setResult(pd.result);
                            break;
                          }
                        }
                      } finally { setChatLoading(false); }
                    }}>
                      ⟐ 交叉分析
                    </button>
                  )}
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
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); askFollowUp(); } }}
                      disabled={chatLoading}
                    />
                    <button className="chat-send" onClick={askFollowUp} disabled={chatLoading || !chatInput.trim()}>
                      {chatLoading ? "⏳" : "➤"}
                    </button>
                  </div>
                </div>

                <button className="reset-btn" onClick={() => { setResult(""); setImages([]); setChatHistory([]); setAllResults([]); setSelectedSystems([]); setCorrection(""); }}>
                  全部重來
                </button>
              </div>
            )}
          </>
        )}

        {/* ===== Knowledge Base Tab ===== */}
        {tab === "kb" && (
          <KnowledgeBase entries={kbEntries} setEntries={setKbEntries} />
        )}

        {/* ===== Settings Tab ===== */}
        {tab === "settings" && (
          <Settings apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} />
        )}
      </div>

      <div className="footer">
        <p>⚠️ 僅供參考娛樂，不構成人生重大決策依據</p>
      </div>
    </div>
  );
}
