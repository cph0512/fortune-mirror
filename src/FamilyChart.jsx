import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { calculateChart, formatChart } from "./ziwei-calc.js";
import { calculateBazi, formatBazi } from "./bazi-calc.js";
import { calculateAstro, formatAstro } from "./astro-calc.js";
import { calculateTrueSolarTime } from "./true-solar-time.js";
import { findCity } from "./city-coords.js";
import { searchCities } from "./city-search.js";

const LANG_AI = { 'zh-TW': '繁體中文', en: 'English', ja: '日本語' };

const ROLES = [
  { id: "self", zh: "本人", en: "Self", ja: "本人" },
  { id: "father", zh: "父親", en: "Father", ja: "父" },
  { id: "mother", zh: "母親", en: "Mother", ja: "母" },
  { id: "spouse", zh: "配偶", en: "Spouse", ja: "配偶者" },
  { id: "elder_sib", zh: "兄/姊", en: "Elder sibling", ja: "兄/姉" },
  { id: "younger_sib", zh: "弟/妹", en: "Younger sibling", ja: "弟/妹" },
  { id: "son", zh: "兒子", en: "Son", ja: "息子" },
  { id: "daughter", zh: "女兒", en: "Daughter", ja: "娘" },
  { id: "other", zh: "其他", en: "Other", ja: "その他" },
];

const FAMILY_STORAGE_KEY = "fortune-family-data";
const FAMILY_HISTORY_KEY = "fortune-family-history";
const API_SAVE_PATH = "/api/fortune-save";

function loadFamilyLocal() {
  try { const d = localStorage.getItem(FAMILY_STORAGE_KEY); return d ? JSON.parse(d) : null; } catch { return null; }
}
function saveFamilyLocal(data) {
  try { localStorage.setItem(FAMILY_STORAGE_KEY, JSON.stringify(data)); } catch {}
}
function loadFamilyHistory() {
  try { const d = localStorage.getItem(FAMILY_HISTORY_KEY); return d ? JSON.parse(d) : []; } catch { return []; }
}
function saveFamilyHistoryEntry(entry) {
  try {
    const history = loadFamilyHistory();
    history.unshift(entry);
    if (history.length > 20) history.length = 20;
    localStorage.setItem(FAMILY_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

// Strip heavy chart strings from members for server save (charts can be recalculated)
function membersForSave(members) {
  if (!members) return [];
  return members.map(m => ({
    id: m.id, role: m.role, name: m.name, gender: m.gender,
    year: m.year, month: m.month, day: m.day, hour: m.hour, minute: m.minute,
    place: m.place, cityData: m.cityData,
    charts: m.charts || {},
  }));
}

// Save family data to server — both the analysis result AND the family structure
async function saveFamilyToServer(apiBackend, user, data, getVisitorId) {
  const userId = user?.email || (typeof getVisitorId === 'function' ? getVisitorId() : 'anonymous');
  const saveUrl = apiBackend.replace("/api/fortune", API_SAVE_PATH);
  const protoBirth = data.protagonist || {};
  const payload = {
    user: userId,
    time: new Date().toISOString(),
    finalResult: data.result || "",
    goal: "family",
    goalPrompt: `家族命盤 — ${data.familyName || ""}（主角：${data.protagonist?.name || ""})`,
    gender: protoBirth.gender || "",
    birth: protoBirth.year ? `${protoBirth.year}/${protoBirth.month}/${protoBirth.day}` : "",
    birthData: { year: protoBirth.year, month: protoBirth.month, day: protoBirth.day, hour: protoBirth.hour, minute: protoBirth.minute, place: protoBirth.place, cityData: protoBirth.cityData },
    rawResults: [],
    chat: data.chat || [],
    monthHighlights: [],
    source: "b2c",
    familyData: {
      familyName: data.familyName,
      members: membersForSave(data.members),
      protagonist: data.protagonist ? { id: data.protagonist.id, role: data.protagonist.role, name: data.protagonist.name, gender: data.protagonist.gender, year: data.protagonist.year, month: data.protagonist.month, day: data.protagonist.day, hour: data.protagonist.hour, minute: data.protagonist.minute, place: data.protagonist.place, cityData: data.protagonist.cityData } : null,
    },
  };
  try {
    const res = await fetch(saveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error("[FamilyChart] save failed:", res.status, await res.text().catch(() => ""));
  } catch (e) { console.error("[FamilyChart] save error:", e); }
}

// Rebuild charts for members loaded from server (server saves don't include chart strings)
function rebuildCharts(members) {
  return members.map(m => m.charts?.ziwei ? m : { ...m, charts: generateCharts(m) });
}

// Load family data from server saves (find ALL family saves for history)
async function loadFamilySavesFromServer(apiBackend, user) {
  if (!user?.email) return [];
  const saveUrl = apiBackend.replace("/api/fortune", API_SAVE_PATH);
  try {
    const res = await fetch(`${saveUrl}?user=${encodeURIComponent(user.email)}`);
    if (!res.ok) return [];
    const saves = await res.json();
    return (Array.isArray(saves) ? saves : []).filter(s => s.goal === "family" && (s.finalResult || s.familyData));
  } catch { return []; }
}

function getRoleLabel(roleId, lang) {
  const r = ROLES.find(r => r.id === roleId);
  if (!r) return roleId;
  if (lang?.startsWith('ja')) return r.ja;
  if (lang?.startsWith('en')) return r.en;
  return r.zh;
}

function generateCharts(member) {
  const y = parseInt(member.year), m = parseInt(member.month), d = parseInt(member.day);
  const h = parseInt(member.hour) || 12, min = parseInt(member.minute) || 0;
  let cityLat = 24.9936, cityLng = 121.3130, cityTz = "Asia/Taipei";
  if (member.cityData) {
    cityLat = member.cityData.lat;
    cityLng = member.cityData.lng;
    cityTz = member.cityData.timezone;
  } else if (member.place) {
    const match = findCity(member.place);
    if (match) { cityLat = match.lat; cityLng = match.lng; }
  }
  const tst = calculateTrueSolarTime(y, m, d, h, min, cityLng, cityTz);
  const tstY = tst.adjustedYear, tstM = tst.adjustedMonth, tstD = tst.adjustedDay;
  const tstH = tst.trueSolarHour, tstMin = tst.trueSolarMinute;
  const ziwei = formatChart(calculateChart(tstY, tstM, tstD, tstH, tstMin, member.gender));
  const bazi = formatBazi(calculateBazi(tstY, tstM, tstD, tstH, member.gender, tstMin));
  const astro = formatAstro(calculateAstro(y, m, d, h, min, cityLat, cityLng));
  return { ziwei, bazi, astro, tst };
}

export default function FamilyChart({ apiBackend, wizardUser, getVisitorId, onClose }) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'zh-TW';

  const local = loadFamilyLocal();
  const [familyName, setFamilyName] = useState(local?.familyName || "");
  const [members, setMembers] = useState(local?.members || []);
  const hasLocalResult = !!(local?.result);
  const [phase, setPhase] = useState(hasLocalResult ? "result" : (local?.members?.length > 0 ? "list" : "name")); // name, list, add, pick, analyzing, result
  const [protagonist, setProtagonist] = useState(local?.protagonist || null);
  const [result, setResult] = useState(local?.result || "");
  const [serverLoaded, setServerLoaded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [familyHistoryList, setFamilyHistoryList] = useState(loadFamilyHistory());
  const [showHistory, setShowHistory] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState(new Set());
  const [pickStep, setPickStep] = useState("protagonist"); // "protagonist" | "members"

  // Add member form
  const [addRole, setAddRole] = useState("");
  const [addName, setAddName] = useState("");
  const [addGender, setAddGender] = useState("");
  const [addYear, setAddYear] = useState("");
  const [addMonth, setAddMonth] = useState("");
  const [addDay, setAddDay] = useState("");
  const [addHour, setAddHour] = useState("");
  const [addMinute, setAddMinute] = useState("0");
  const [addPlace, setAddPlace] = useState("");
  const [addCityData, setAddCityData] = useState(null);
  const [cityResults, setCityResults] = useState([]);

  // Save to localStorage when members change
  useEffect(() => {
    if (familyName || members.length > 0) {
      saveFamilyLocal({ familyName, members, result, protagonist });
    }
  }, [familyName, members, result, protagonist]);

  // Load from server on mount — NEVER overwrite local members with empty server data
  useEffect(() => {
    if (wizardUser?.email && !serverLoaded) {
      loadFamilySavesFromServer(apiBackend, wizardUser)
        .then(familySaves => {
          setServerLoaded(true);
          if (familySaves.length === 0) return;

          // Build history list for display
          const serverHistory = familySaves.map(s => ({
            id: s.time, time: s.time,
            familyName: s.familyData?.familyName || s.goalPrompt || "",
            protagonistName: s.familyData?.protagonist?.name || "",
            protagonistRole: s.familyData?.protagonist?.role || "",
            result: s.finalResult || "",
            members: s.familyData?.members,
            protagonist: s.familyData?.protagonist,
          }));
          setFamilyHistoryList(serverHistory);

          // Re-read local NOW (in case it changed since init)
          const currentLocal = loadFamilyLocal();

          // Case 1: Local has members → keep local, only supplement result if missing
          if (currentLocal?.members?.length > 0) {
            if (!currentLocal.result) {
              const withResult = familySaves.find(s => s.finalResult);
              if (withResult) {
                setResult(withResult.finalResult);
                setPhase("result");
                saveFamilyLocal({ ...currentLocal, result: withResult.finalResult });
              }
            }
            // Upload local members to server if server is empty (backfill)
            const serverHasMembers = familySaves.some(s => s.familyData?.members?.length > 0);
            if (!serverHasMembers) {
              saveFamilyToServer(apiBackend, wizardUser, {
                result: currentLocal.result || "", familyName: currentLocal.familyName,
                members: currentLocal.members, protagonist: currentLocal.protagonist,
              }, getVisitorId);
            }
            return;
          }

          // Case 2: Local is empty, server has members → restore from server
          const withMembers = familySaves.find(s => s.familyData?.members?.length > 0);
          if (withMembers) {
            const restoredMembers = rebuildCharts(withMembers.familyData.members);
            setFamilyName(withMembers.familyData.familyName || "");
            setMembers(restoredMembers);
            setProtagonist(withMembers.familyData.protagonist);
            if (withMembers.finalResult) { setResult(withMembers.finalResult); setPhase("result"); }
            else { setPhase("list"); }
            saveFamilyLocal({ familyName: withMembers.familyData.familyName, members: restoredMembers, result: withMembers.finalResult, protagonist: withMembers.familyData.protagonist });
            return;
          }

          // Case 3: Both empty but server has a result → show result only (no member overwrite)
          const withResult = familySaves.find(s => s.finalResult);
          if (withResult) {
            const fname = withResult.familyData?.familyName || withResult.goalPrompt?.replace(/^家族命盤 — /, '').split('（')[0] || '';
            if (!currentLocal?.familyName) setFamilyName(fname);
            setResult(withResult.finalResult);
            setPhase("result");
            // Do NOT saveFamilyLocal with empty members — preserve whatever local has
          }
        })
        .catch(() => setServerLoaded(true));
    }
  }, [wizardUser]);

  const resetAddForm = () => {
    setAddRole(""); setAddName(""); setAddGender(""); setAddYear(""); setAddMonth("");
    setAddDay(""); setAddHour(""); setAddMinute("0"); setAddPlace(""); setAddCityData(null); setCityResults([]);
  };

  const handleAddMember = () => {
    if (!addRole || !addName || !addGender || !addYear || !addMonth || !addDay) return;
    const member = {
      id: Date.now().toString(36),
      role: addRole, name: addName, gender: addGender,
      year: addYear, month: addMonth, day: addDay,
      hour: addHour || "12", minute: addMinute,
      place: addPlace || "桃園", cityData: addCityData,
    };
    // Generate charts immediately
    member.charts = generateCharts(member);
    setMembers(prev => [...prev, member]);
    resetAddForm();
    setPhase("list");
  };

  const removeMember = (id) => {
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const handleCitySearch = async (query) => {
    setAddPlace(query);
    if (query.length >= 1) {
      const results = await searchCities(query, 6);
      setCityResults(results);
    } else {
      setCityResults([]);
    }
  };

  const startFamilyAnalysis = async (proto, analysisMembers) => {
    const membersToAnalyze = analysisMembers || members;
    setProtagonist(proto);
    setPickStep("protagonist");
    setPhase("analyzing");
    setAnalyzing(true);
    setResult("");

    // Pre-save members to server BEFORE analysis starts (prevents data loss if page crashes)
    saveFamilyToServer(apiBackend, wizardUser, {
      result: "", familyName, members: membersToAnalyze, protagonist: proto,
    }, getVisitorId);

    const msgs = currentLang === 'en'
      ? ["Analyzing family energy field...", "Cross-referencing parent charts...", "Mapping family dynamics...", "Generating family destiny report..."]
      : currentLang === 'ja'
      ? ["家族のエネルギー場を分析中...", "親の命盤を照合中...", "家族関係を推演中...", "家族命盤レポートを生成中..."]
      : ["分析家庭能量場...", "交叉比對父母命盤...", "推演家族互動關係...", "生成家族命盤報告..."];
    let msgIdx = 0;
    setLoadingMsg(msgs[0]);
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % msgs.length;
      setLoadingMsg(msgs[msgIdx]);
    }, 3000);

    try {
      const langName = LANG_AI[currentLang] || '繁體中文';

      // Build charts section for selected members
      let chartsBlock = "";
      for (const m of membersToAnalyze) {
        const roleLabel = getRoleLabel(m.role, 'zh-TW'); // Always Chinese for AI
        chartsBlock += `\n\n### ${roleLabel}（${m.name}）
- 性別：${m.gender}
- 出生：${m.year}年${m.month}月${m.day}日 ${m.hour}時${m.minute}分
- 出生地：${m.place || '未知'}

【紫微斗數排盤】
${m.charts.ziwei}

【八字排盤】
${m.charts.bazi}

【西洋占星排盤】
${m.charts.astro}
`;
      }

      const protoRole = getRoleLabel(proto.role, 'zh-TW');
      const otherMembers = membersToAnalyze.filter(m => m.id !== proto.id);

      // Build relationship context
      const parentMembers = otherMembers.filter(m => m.role === "father" || m.role === "mother");
      const siblingMembers = otherMembers.filter(m => m.role === "elder_sib" || m.role === "younger_sib");
      const spouseMembers = otherMembers.filter(m => m.role === "spouse");
      const childMembers = otherMembers.filter(m => m.role === "son" || m.role === "daughter");

      let verifyBlock = "";
      if (parentMembers.length > 0) {
        verifyBlock += `
### 父母宮驗證
主角命盤中有「父母宮」，現在有父母的真實命盤可以交叉驗證：
- 主角父母宮的星曜描述 vs 父母實際命盤的命宮主星 → 吻合嗎？落差在哪？
- 主角的宮位飛化表中「父母宮」那一行的化祿/化忌飛到哪個宮 → 父母帶來資源/壓力的領域
- 父母的生年四化（四化區塊的四顆星），在主角命盤中落在哪個宮 → 父母能量如何影響主角的各生活領域
- 父母命宮天干的飛化（宮位飛化表中命宮那一行），對應到主角命盤的星曜位置 → 父母核心能量的投射
- 分析哪些特質是「主角本性」vs「父母環境塑造」`;
      }
      if (siblingMembers.length > 0) {
        verifyBlock += `
### 兄弟宮驗證
用手足的真實命盤驗證主角的兄弟宮描述，分析手足間的互動能量。`;
      }
      if (spouseMembers.length > 0) {
        verifyBlock += `
### 夫妻宮驗證
用配偶的真實命盤驗證主角的夫妻宮描述，分析婚姻互動、財務共管、子女教養分工。`;
      }
      if (childMembers.length > 0) {
        verifyBlock += `
### 子女宮驗證
用子女的真實命盤驗證主角的子女宮描述，分析親子關係和教養模式。`;
      }

      const prompt = `## 家族命盤分析

以下是一個家庭的所有成員命盤資料（內部資料，不可對外揭露來源系統）：
${chartsBlock}

## 分析任務

以「${proto.name}」（${protoRole}）為主角，進行家族命盤交叉分析。

${verifyBlock}

## 飛化交叉分析方法

對於每位家庭成員，進行以下三層飛化交叉：

A. 主角自身的對應宮位飛化（從主角的宮位飛化表中找到對應宮位行）
B. 家人的生年四化 → 找這些星在主角命盤十二宮排盤中的位置
C. 家人命宮天干飛化 → 找這些星在主角命盤中的位置

## 輸出結構

[SECTION] 家庭能量場概覽
（所有成員的五行分佈、整個家庭的能量互補或衝突）

[SECTION] ${proto.name} 的核心命盤特質
（先做一段主角本人的簡要分析）

${parentMembers.map(p => `[SECTION] ${p.name}（${getRoleLabel(p.role, 'zh-TW')}）對 ${proto.name} 的影響
（宮位驗證 + 飛化交叉 + 哪些特質被強化/壓抑 + 具體影響領域）`).join('\n\n')}

${siblingMembers.length > 0 ? `[SECTION] 手足關係分析
（兄弟宮驗證 + 互動模式）` : ""}

${spouseMembers.length > 0 ? `[SECTION] 婚姻關係分析
（夫妻宮驗證 + 互動模式 + 財務 + 子女教養分工）` : ""}

${childMembers.length > 0 ? `[SECTION] 親子關係分析
（子女宮驗證 + 教養建議）` : ""}

[SECTION] 「真正的你」vs「環境塑造的你」
（基於家人命盤的交叉分析，區分哪些是天生特質、哪些是環境影響）

[SECTION] 家庭經營建議
（具體可行的互動建議，針對每位家人）

## 規則
⚠️ 不提任何命理系統名稱和專有術語，用自然語言表達。
⚠️ 絕對禁止 Markdown 語法（#、**、*、- 列表、表格）。用 [SECTION] 標記分段。用自然句子書寫。
⚠️ 不可假設家人的職業、行業、生活背景。
⚠️ 你必須用「${langName}」撰寫整份報告。`;

      const systemPrompt = `你是「命理三鏡」的家族命盤分析師。你擅長用多人命盤進行交叉驗證和飛化分析。

核心能力：
1. 用家人的真實命盤驗證主角命盤中的父母宮、兄弟宮、夫妻宮、子女宮
2. 進行跨命盤飛化交叉分析，找出家人能量如何影響主角
3. 區分「先天本性」和「後天環境塑造」
4. 用溫暖但精確的語言描述家庭關係

格式規則：
絕對禁止 Markdown 語法。用 [SECTION] 標記分段。用自然句子書寫。
日期一律使用國曆（西元）。`;

      const submitRes = await fetch(apiBackend, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: [], system: systemPrompt, prompt,
          analysis_type: "family",
          visitor_id: getVisitorId(),
          user: wizardUser?.email || null,
          notify_email: wizardUser?.email || "",
        }),
      });
      if (!submitRes.ok) throw new Error("分析失敗");
      const { job_id } = await submitRes.json();

      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const pollRes = await fetch(`${apiBackend}/${job_id}`);
          if (!pollRes.ok) continue;
          const data = await pollRes.json();
          if (data.status === "done") {
            setResult(data.result);
            setChatHistory([]);
            // Save current state to localStorage
            saveFamilyLocal({ familyName, members, result: data.result, protagonist: proto });
            // Save to history (each analysis is a separate entry)
            const historyEntry = {
              id: job_id,
              time: new Date().toISOString(),
              familyName,
              protagonistName: proto.name,
              protagonistRole: proto.role,
              result: data.result,
            };
            saveFamilyHistoryEntry(historyEntry);
            setFamilyHistoryList(loadFamilyHistory());
            // Save to server
            saveFamilyToServer(apiBackend, wizardUser, {
              result: data.result, familyName, members: membersToAnalyze, protagonist: proto,
            }, getVisitorId);
            // Save each member's chart to chart library
            if (wizardUser?.email) {
              const chartsUrl = "https://bot.velopulse.io/api/fortune-charts";
              for (const m of membersToAnalyze) {
                if (m.charts && Object.keys(m.charts).length > 0) {
                  const chartData = {
                    name: m.name,
                    is_primary: m.role === "self",
                    birthData: { year: m.year, month: m.month, day: m.day, hour: m.hour, minute: m.minute, place: m.place, city: m.cityData },
                    gender: m.gender,
                    charts: { ...(m.charts.ziwei ? { '紫微斗數': m.charts.ziwei } : {}), ...(m.charts.bazi ? { '八字': m.charts.bazi } : {}), ...(m.charts.astro ? { '西洋占星': m.charts.astro } : {}) },
                    source: "family",
                    familyName: familyName,
                  };
                  fetch(chartsUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: wizardUser.email, chart: chartData }) }).catch(() => {});
                }
              }
            }
            break;
          }
        } catch { continue; }
      }
    } catch (err) {
      setResult("分析失敗：" + err.message);
    } finally {
      clearInterval(interval);
      setAnalyzing(false);
      setPhase("result");
    }
  };

  const sendFamilyChat = async (question) => {
    if (!question.trim() || chatLoading) return;
    setChatHistory(prev => [...prev, { role: "user", text: question }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const langName = LANG_AI[currentLang] || '繁體中文';
      const chartBlock = members.map(m => {
        const role = getRoleLabel(m.role, 'zh-TW');
        return `【${role}（${m.name}）排盤】\n${m.charts?.ziwei || ""}\n${m.charts?.bazi || ""}\n${m.charts?.astro || ""}`;
      }).join("\n\n===\n\n");
      const recentChat = chatHistory.slice(-10).map(m => `${m.role === "user" ? "問" : "答"}：${m.text}`).join("\n");
      const prompt = `===== 家族命盤原始排盤資料 =====\n${chartBlock}\n\n===== 之前的家族分析報告 =====\n${result}\n\n${recentChat ? `對話紀錄：\n${recentChat}\n\n` : ""}用戶追問：${question}\n\n⚠️ 回答規則：\n1. 不提命理系統名稱和術語，用自然語言\n2. 根據排盤資料精確回答，不可編造\n3. 家族分析要指出具體是哪位成員的哪個特質影響\n4. 用「${langName}」回覆`;
      const sp = `你是「命理三鏡」的家族命盤分析師。根據已有的家族命盤排盤資料和分析報告回答追問。`;
      const submitRes = await fetch(apiBackend, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [], system: sp, prompt, analysis_type: "general", visitor_id: getVisitorId(), user: wizardUser?.email || null }),
      });
      if (!submitRes.ok) throw new Error("回覆失敗");
      const { job_id } = await submitRes.json();
      for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const pollRes = await fetch(`${apiBackend}/${job_id}`);
        if (!pollRes.ok) continue;
        const data = await pollRes.json();
        if (data.status === "done") {
          const newChat = [...chatHistory, { role: "user", text: question }, { role: "assistant", text: data.result }];
          setChatHistory(prev => [...prev, { role: "assistant", text: data.result }]);
          // Save chat to server
          saveFamilyToServer(apiBackend, wizardUser, {
            result, familyName, members, protagonist, chat: newChat,
          }, getVisitorId);
          break;
        }
      }
    } catch (e) {
      setChatHistory(prev => [...prev, { role: "assistant", text: "回覆失敗: " + e.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Render formatted sections (same logic as WizardApp)
  const renderSections = (text) => {
    if (!text) return null;
    const sections = text.split(/\[?\s*SECTION\s*\]?\s*[:：\-—]?\s*/gi).filter(s => s.trim());
    return sections.map((sec, i) => {
      const lines = sec.trim().split('\n');
      const title = lines[0]?.trim();
      const body = lines.slice(1).join('\n').trim()
        .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#{1,6}\s*/gm, '');
      return (
        <div key={i} className="wizard-section">
          {title && <div className="wizard-section-header"><span className="wizard-section-title">{title}</span></div>}
          {body && <div className="wizard-section-body">{body}</div>}
        </div>
      );
    });
  };

  const years = [];
  for (let y = new Date().getFullYear() + 1; y >= 1940; y--) years.push(y);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  // ===== Phase: Family name =====
  if (phase === "name") {
    return (
      <div className="family-panel">
        <div className="family-header">
          <button className="wizard-back" onClick={onClose}>‹</button>
          <div className="family-title">{currentLang === 'en' ? 'Family Chart' : currentLang === 'ja' ? '家族命盤' : '家族命盤'}</div>
        </div>
        <div className="family-intro">
          {currentLang === 'en'
            ? "Build your family's destiny chart. Add family members to reveal how their energy influences each other."
            : currentLang === 'ja'
            ? "家族の命盤を作成しましょう。家族を追加して、互いのエネルギーの影響を解き明かします。"
            : "建立你的家族命盤。加入家庭成員，揭示每個人的能量如何互相影響。"}
        </div>
        <input className="wizard-auth-input" placeholder={currentLang === 'en' ? "Family name (e.g. Chen family)" : currentLang === 'ja' ? "家族名（例：田中家）" : "家庭名稱（例如：陳家）"}
          value={familyName} onChange={e => setFamilyName(e.target.value)} />
        <button className="wizard-cta" disabled={!familyName.trim()} onClick={() => setPhase("list")}>
          {currentLang === 'en' ? 'Start Building' : currentLang === 'ja' ? '作成開始' : '開始建立'}
        </button>
      </div>
    );
  }

  // ===== Phase: Member list =====
  if (phase === "list") {
    return (
      <div className="family-panel">
        <div className="family-header">
          <button className="wizard-back" onClick={onClose}>‹</button>
          <div className="family-title">{familyName} {currentLang === 'en' ? '— Family Chart' : '— 家族命盤'}</div>
        </div>

        {members.length === 0 ? (
          <div className="family-empty">
            {currentLang === 'en' ? "No members yet. Add at least 2 family members." : currentLang === 'ja' ? "メンバーがいません。2人以上追加してください。" : "尚無成員。請加入至少 2 位家庭成員。"}
          </div>
        ) : (
          <div className="family-members">
            {members.map(m => (
              <div key={m.id} className="family-member-card">
                <div className="family-member-avatar">{m.name[0]}</div>
                <div className="family-member-info">
                  <div className="family-member-name">{m.name}</div>
                  <div className="family-member-role">{getRoleLabel(m.role, currentLang)} | {m.gender} | {m.year}/{m.month}/{m.day}</div>
                </div>
                <button className="family-member-remove" onClick={() => removeMember(m.id)}>✕</button>
              </div>
            ))}
          </div>
        )}

        <button className="wizard-cta-secondary" style={{ marginTop: 16 }} onClick={() => { resetAddForm(); setPhase("add"); }}>
          + {currentLang === 'en' ? 'Add Member' : currentLang === 'ja' ? 'メンバー追加' : '加入成員'}
        </button>

        {members.length >= 2 && (
          <button className="wizard-cta" style={{ marginTop: 12 }} onClick={() => setPhase("pick")}>
            {currentLang === 'en' ? 'Choose Protagonist & Analyze' : currentLang === 'ja' ? '主役を選んで分析' : '選擇主角，開始分析'}
          </button>
        )}
      </div>
    );
  }

  // ===== Phase: Add member =====
  if (phase === "add") {
    const canAdd = addRole && addName && addGender && addYear && addMonth && addDay;
    return (
      <div className="family-panel">
        <div className="family-header">
          <button className="wizard-back" onClick={() => setPhase("list")}>‹</button>
          <div className="family-title">{currentLang === 'en' ? 'Add Family Member' : currentLang === 'ja' ? 'メンバー追加' : '加入家庭成員'}</div>
        </div>

        <div className="family-form-label">{currentLang === 'en' ? 'Role' : currentLang === 'ja' ? '続柄' : '身份'}</div>
        <div className="family-role-grid">
          {ROLES.map(r => (
            <button key={r.id} className={`wizard-twin-btn ${addRole === r.id ? 'selected' : ''}`}
              onClick={() => setAddRole(r.id)}>
              {getRoleLabel(r.id, currentLang)}
            </button>
          ))}
        </div>

        <div className="family-form-label">{currentLang === 'en' ? 'Name' : currentLang === 'ja' ? '名前' : '稱呼'}</div>
        <input className="wizard-auth-input" value={addName} onChange={e => setAddName(e.target.value)}
          placeholder={currentLang === 'en' ? "Name" : currentLang === 'ja' ? "名前" : "稱呼"} />

        <div className="family-form-label">{t('confirm.gender')}</div>
        <div className="family-role-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button className={`wizard-twin-btn ${addGender === "男" ? 'selected' : ''}`} onClick={() => setAddGender("男")}>{t('welcome.male')}</button>
          <button className={`wizard-twin-btn ${addGender === "女" ? 'selected' : ''}`} onClick={() => setAddGender("女")}>{t('welcome.female')}</button>
        </div>

        <div className="family-form-label">{t('confirm.birthDate')}</div>
        <div className="wizard-date-row">
          <div className="wizard-select-wrap">
            <label>{t('birth.year')}</label>
            <select className="wizard-select" value={addYear} onChange={e => setAddYear(e.target.value)}>
              <option value="">--</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="wizard-select-wrap">
            <label>{t('birth.month')}</label>
            <select className="wizard-select" value={addMonth} onChange={e => setAddMonth(e.target.value)}>
              <option value="">--</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="wizard-select-wrap">
            <label>{t('birth.day')}</label>
            <select className="wizard-select" value={addDay} onChange={e => setAddDay(e.target.value)}>
              <option value="">--</option>
              {days.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="family-form-label">{t('confirm.birthTime')}</div>
        <div className="wizard-date-row">
          <div className="wizard-select-wrap">
            <label>{t('birth.hour')}</label>
            <select className="wizard-select" value={addHour} onChange={e => setAddHour(e.target.value)}>
              <option value="">--</option>
              {hours.map(h => <option key={h} value={h}>{String(h).padStart(2,'0')}{t('birth.hourSuffix')}</option>)}
            </select>
          </div>
          <div className="wizard-select-wrap">
            <label>{t('birth.minute')}</label>
            <select className="wizard-select" value={addMinute} onChange={e => setAddMinute(e.target.value)}>
              {minutes.map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}{t('birth.minuteSuffix')}</option>)}
            </select>
          </div>
        </div>

        <div className="family-form-label">{t('place.question')}</div>
        <div style={{ position: "relative" }}>
          <input className="wizard-auth-input" value={addPlace}
            onChange={e => handleCitySearch(e.target.value)}
            placeholder={t('place.search')} autoComplete="off" />
          {cityResults.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
              background: "var(--card-bg, #1a1a2e)", border: "1px solid var(--border, #333)",
              borderRadius: 8, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
            }}>
              {cityResults.map(city => (
                <div key={city.id}
                  onClick={() => {
                    setAddPlace(city.nameZh !== city.name ? `${city.nameZh} (${city.name})` : city.name);
                    setAddCityData({ lat: city.lat, lng: city.lng, timezone: city.timezone });
                    setCityResults([]);
                  }}
                  style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--border, #222)", fontSize: 13 }}
                  onMouseEnter={e => e.target.style.background = "var(--hover-bg, #252545)"}
                  onMouseLeave={e => e.target.style.background = "transparent"}>
                  <strong>{city.nameZh !== city.name ? city.nameZh : city.name}</strong>
                  {city.nameZh !== city.name && <span style={{ opacity: 0.6, marginLeft: 6 }}>{city.name}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="wizard-cta" style={{ marginTop: 24 }} disabled={!canAdd} onClick={handleAddMember}>
          {currentLang === 'en' ? 'Add' : currentLang === 'ja' ? '追加' : '加入'}
        </button>
      </div>
    );
  }

  // ===== Phase: Pick protagonist + select members =====
  if (phase === "pick") {
    if (pickStep === "protagonist") {
      return (
        <div className="family-panel">
          <div className="family-header">
            <button className="wizard-back" onClick={() => setPhase("list")}>‹</button>
            <div className="family-title">{currentLang === 'en' ? 'Who is the protagonist?' : currentLang === 'ja' ? '誰を主役にしますか？' : '以誰為主角？'}</div>
          </div>
          <div className="family-intro">
            {currentLang === 'en'
              ? "Choose a family member as the focus of the analysis."
              : currentLang === 'ja'
              ? "分析の主役を選んでください。"
              : "選擇一位家庭成員為分析焦點。"}
          </div>
          <div className="family-members">
            {members.map(m => (
              <div key={m.id} className="family-member-card family-member-pick" onClick={() => {
                setProtagonist(m);
                // Default: select all other members
                setSelectedMembers(new Set(members.filter(x => x.id !== m.id).map(x => x.id)));
                setPickStep("members");
              }}>
                <div className="family-member-avatar">{m.name[0]}</div>
                <div className="family-member-info">
                  <div className="family-member-name">{m.name}</div>
                  <div className="family-member-role">{getRoleLabel(m.role, currentLang)}</div>
                </div>
                <span style={{ color: '#7c3aed', fontSize: 20 }}>›</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    // pickStep === "members"
    const otherMembers = members.filter(m => m.id !== protagonist?.id);
    return (
      <div className="family-panel">
        <div className="family-header">
          <button className="wizard-back" onClick={() => setPickStep("protagonist")}>‹</button>
          <div className="family-title">
            {currentLang === 'en' ? `Analyze with ${protagonist?.name}` : currentLang === 'ja' ? `${protagonist?.name}の分析` : `${protagonist?.name} 的分析`}
          </div>
        </div>
        <div className="family-intro">
          {currentLang === 'en'
            ? "Select which family members to include in the analysis. You don't have to include everyone."
            : currentLang === 'ja'
            ? "分析に含めるメンバーを選んでください。全員でなくても構いません。"
            : "選擇要納入分析的成員。不一定要全選。"}
        </div>
        <div className="family-members">
          {otherMembers.map(m => {
            const checked = selectedMembers.has(m.id);
            return (
              <div key={m.id} className={`family-member-card ${checked ? 'family-member-selected' : ''}`}
                style={{ cursor: 'pointer', opacity: checked ? 1 : 0.5 }}
                onClick={() => {
                  setSelectedMembers(prev => {
                    const next = new Set(prev);
                    if (next.has(m.id)) next.delete(m.id);
                    else next.add(m.id);
                    return next;
                  });
                }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, border: '2px solid #7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10, background: checked ? '#7c3aed' : 'transparent', flexShrink: 0 }}>
                  {checked && <span style={{ color: '#fff', fontSize: 14 }}>✓</span>}
                </div>
                <div className="family-member-avatar">{m.name[0]}</div>
                <div className="family-member-info">
                  <div className="family-member-name">{m.name}</div>
                  <div className="family-member-role">{getRoleLabel(m.role, currentLang)}</div>
                </div>
              </div>
            );
          })}
        </div>
        <button className="wizard-cta" style={{ marginTop: 20 }}
          disabled={selectedMembers.size === 0}
          onClick={() => {
            // Filter members: protagonist + selected
            const analysisMembers = members.filter(m => m.id === protagonist.id || selectedMembers.has(m.id));
            startFamilyAnalysis(protagonist, analysisMembers);
          }}>
          {currentLang === 'en' ? `Start Analysis (${selectedMembers.size + 1} people)` : currentLang === 'ja' ? `分析開始（${selectedMembers.size + 1}人）` : `開始分析（${selectedMembers.size + 1} 人）`}
        </button>
      </div>
    );
  }

  // ===== Phase: Analyzing =====
  if (phase === "analyzing") {
    return (
      <div className="family-panel" style={{ textAlign: "center", paddingTop: 60 }}>
        <div className="wizard-loading-anim">
          <div className="wizard-loading-ring" />
          <div className="wizard-loading-ring" />
          <div className="wizard-loading-ring" />
          <div className="wizard-loading-star wizard-diamond"></div>
        </div>
        <div className="wizard-loading-text">{loadingMsg}</div>
        <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>
          {currentLang === 'en' ? `Analyzing ${members.length} family members... This may take 5-10 minutes.`
            : currentLang === 'ja' ? `${members.length}人を分析中... 5〜10分かかる場合があります。`
            : `正在分析 ${members.length} 位家庭成員... 可能需要 5-10 分鐘。`}
        </div>
        {wizardUser?.email && (
          <div style={{ marginTop: 24, padding: '16px 20px', background: 'rgba(124,58,237,0.1)', borderRadius: 12 }}>
            <div style={{ fontSize: 13, color: '#c4b5fd', marginBottom: 8 }}>
              {currentLang === 'en' ? "You can close this page. We'll email you when it's done."
                : currentLang === 'ja' ? "ページを閉じても大丈夫。完了したらメールでお知らせします。"
                : "你可以先離開，分析完成後會 email 通知你。"}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {currentLang === 'en' ? `Notification will be sent to: ${wizardUser.email}`
                : currentLang === 'ja' ? `通知先: ${wizardUser.email}`
                : `通知信箱：${wizardUser.email}`}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== Phase: Result =====
  if (phase === "result") {
    return (
      <div className="family-panel">
        <div className="family-header">
          <button className="wizard-back" onClick={() => setPhase("pick")}>‹</button>
          <div className="family-title">
            {familyName} — {protagonist?.name}
          </div>
        </div>
        <div className="wizard-result-sections">
          {renderSections(result)}
        </div>
        {/* Follow-up chat */}
        <div className="wizard-chat" style={{ marginTop: 32 }}>
          <div className="wizard-question" style={{ fontSize: 18, marginBottom: 12 }}>
            {currentLang === 'en' ? 'Ask about your family chart' : currentLang === 'ja' ? '家族命盤について質問' : '針對家族命盤追問'}
          </div>
          {chatHistory.length > 0 && (
            <div className="wizard-chat-messages">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`wizard-chat-msg ${msg.role}`}>{msg.text}</div>
              ))}
              {chatLoading && <div className="wizard-chat-msg assistant" style={{ opacity: 0.5 }}>...</div>}
            </div>
          )}
          <div className="wizard-chat-input">
            <input value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) sendFamilyChat(chatInput); }}
              placeholder={currentLang === 'en' ? 'Ask a follow-up question...' : currentLang === 'ja' ? '追加質問...' : '輸入你的問題...'}
              disabled={chatLoading} />
            <button onClick={() => sendFamilyChat(chatInput)} disabled={chatLoading || !chatInput.trim()}>
              {currentLang === 'en' ? 'Send' : currentLang === 'ja' ? '送信' : '送出'}
            </button>
          </div>
        </div>

        {/* Past family analyses */}
        {familyHistoryList.length > 1 && (
          <div style={{ marginTop: 28 }}>
            <button className="wizard-history-btn" onClick={() => setShowHistory(!showHistory)}>
              {currentLang === 'en' ? `Past Analyses (${familyHistoryList.length})` : currentLang === 'ja' ? `過去の分析 (${familyHistoryList.length})` : `歷史分析 (${familyHistoryList.length})`}
            </button>
            {showHistory && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {familyHistoryList.map((h, i) => (
                  <div key={h.id || i} className="wizard-dashboard-card" onClick={() => {
                    setResult(h.result);
                    if (h.protagonist) setProtagonist(h.protagonist);
                    if (h.members) setMembers(rebuildCharts(h.members));
                    setChatHistory([]);
                    setShowHistory(false);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}>
                    <div className="wizard-dashboard-card-date">{new Date(h.time).toLocaleDateString()}</div>
                    <div className="wizard-dashboard-card-title">
                      {h.familyName} — {getRoleLabel(h.protagonistRole, currentLang)}（{h.protagonistName}）
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          <button className="wizard-cta-secondary" style={{ flex: 1 }} onClick={() => { setPhase("pick"); setChatHistory([]); }}>
            {currentLang === 'en' ? 'Switch Protagonist' : currentLang === 'ja' ? '主役を変更' : '切換主角'}
          </button>
          <button className="wizard-cta-secondary" style={{ flex: 1 }} onClick={() => { setPhase("list"); setChatHistory([]); }}>
            {currentLang === 'en' ? 'Edit Members' : currentLang === 'ja' ? 'メンバー編集' : '編輯成員'}
          </button>
          <button className="wizard-cta-secondary" style={{ flex: 1 }} onClick={() => {
            saveFamilyLocal(null); localStorage.removeItem(FAMILY_STORAGE_KEY);
            setFamilyName(""); setMembers([]); setResult(""); setProtagonist(null); setChatHistory([]);
            setPhase("name");
          }}>
            {currentLang === 'en' ? 'New Chart' : currentLang === 'ja' ? '新規作成' : '重新建立'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
