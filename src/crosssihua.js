/**
 * 交叉飛化 (Cross Sihua) — 兩人命盤間的四化飛入計算
 *
 * Layer 定義:
 *   L1 natal   — 生年四化 (chart.siHua)
 *   L2 palace  — 宮干四化 (chart.feiHua)
 *   L3 decadal — 當前大限四化 (chart.horoscope.decadal.sihua)
 *   L4 yearly  — 流年四化 (chart.horoscope.yearly.sihua)
 *   L5 monthly — 流月四化 (monthlyOverlay 傳入, 見 calculateDayHourOverlay)
 *   L6 daily   — 流日四化 (dayHourOverlay 傳入)
 *
 * Input: 兩個 chart object (calculateChart 回傳格式)
 * Output: { aToB: [...], bToA: [...], summary: string }
 *
 * 命理規則:
 *   - 對方的星位於我的某宮 → 判斷飛入點, 不看宮干
 *   - 自化 (A 的 N 宮飛化到 A 自己某宮) 不在此算, 那是 TransitOverlay 範圍
 *   - 所有 flights 都是 structured object + narrative summary, 兩種都餵 AI
 */

const DI_ZHI = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const HUA_ORDER = ["化祿", "化權", "化科", "化忌"];
const DEFAULT_LEVELS = ["natal", "palace", "decadal", "yearly"];

const LAYER_META = {
  L1: { key: "natal",   label: "本命四化 (生年干)" },
  L2: { key: "palace",  label: "宮干飛化" },
  L3: { key: "decadal", label: "當前大限四化" },
  L4: { key: "yearly",  label: "流年四化" },
  L5: { key: "monthly", label: "流月四化" },
  L6: { key: "daily",   label: "流日四化" },
};

// 在 chart 中找出某顆星所在的宮位 (先找 major, 再找 minor)
function findStarPalace(chart, starName) {
  for (const zhi of DI_ZHI) {
    const g = chart.gongs?.[zhi];
    if (!g) continue;
    if ((g.stars || []).includes(starName)) return { zhi, name: g.name, kind: "major" };
  }
  for (const zhi of DI_ZHI) {
    const g = chart.gongs?.[zhi];
    if (!g) continue;
    if ((g.minor || []).includes(starName)) return { zhi, name: g.name, kind: "minor" };
  }
  return null;
}

// "太陽化祿" → { star: "太陽", hua: "化祿" }
function parseSihuaEntry(entry) {
  if (!entry || typeof entry !== "string") return null;
  for (const hua of HUA_ORDER) {
    if (entry.endsWith(hua)) return { star: entry.slice(0, -hua.length), hua };
  }
  return null;
}

// L1: 生年四化飛入對方盤
function layerNatal(srcChart, dstChart, srcName) {
  const out = [];
  const siHua = srcChart.siHua || {};
  for (const [star, hua] of Object.entries(siHua)) {
    const huaFull = hua.startsWith("化") ? hua : `化${hua}`;
    const dst = findStarPalace(dstChart, star);
    if (!dst) continue;
    out.push({
      layer: "L1",
      layerLabel: LAYER_META.L1.label,
      sourceLabel: `${srcName} 生年`,
      fromPalace: null,
      star,
      hua: huaFull,
      toPalace: dst.name,
      toPalaceZhi: dst.zhi,
      starKind: dst.kind,
    });
  }
  return out;
}

// L2: 每宮宮干起四化, 飛入對方盤
function layerPalace(srcChart, dstChart, srcName) {
  const out = [];
  const feiHua = srcChart.feiHua || {};
  for (const zhi of DI_ZHI) {
    const fh = feiHua[zhi];
    const srcGong = srcChart.gongs?.[zhi];
    if (!fh || !srcGong) continue;
    for (let i = 0; i < 4; i++) {
      const parsed = parseSihuaEntry(fh.sihua?.[i]);
      if (!parsed) continue;
      const dst = findStarPalace(dstChart, parsed.star);
      if (!dst) continue;
      out.push({
        layer: "L2",
        layerLabel: LAYER_META.L2.label,
        sourceLabel: `${srcName} ${srcGong.name}(${fh.gan}干)`,
        fromPalace: srcGong.name,
        fromPalaceZhi: zhi,
        fromGan: fh.gan,
        star: parsed.star,
        hua: HUA_ORDER[i],
        toPalace: dst.name,
        toPalaceZhi: dst.zhi,
        starKind: dst.kind,
      });
    }
  }
  return out;
}

// Helper: horoscope.decadal / horoscope.yearly 的 sihua 是 array of full entries
// (already includes "化祿" suffix on the star names, e.g. "太陽")
// Actually ziwei-calc.js line 198: h.decadal.mutagen → toTC gives just star names.
// The HUA_ORDER position implies the transformation, so sihua[0]=祿 star, sihua[1]=權 star, etc.
function layerFromSihuaArray(srcChart, dstChart, srcName, sihuaArr, layerCode, srcLabel) {
  const out = [];
  if (!Array.isArray(sihuaArr)) return out;
  for (let i = 0; i < Math.min(4, sihuaArr.length); i++) {
    const star = sihuaArr[i];
    if (!star) continue;
    const dst = findStarPalace(dstChart, star);
    if (!dst) continue;
    out.push({
      layer: layerCode,
      layerLabel: LAYER_META[layerCode].label,
      sourceLabel: `${srcName} ${srcLabel}`,
      fromPalace: null,
      star,
      hua: HUA_ORDER[i],
      toPalace: dst.name,
      toPalaceZhi: dst.zhi,
      starKind: dst.kind,
    });
  }
  return out;
}

function layerDecadal(srcChart, dstChart, srcName) {
  const h = srcChart.horoscope?.decadal;
  if (!h) return [];
  return layerFromSihuaArray(srcChart, dstChart, srcName, h.sihua, "L3", `當前大限${h.ganZhi || ""}`);
}

function layerYearly(srcChart, dstChart, srcName) {
  const h = srcChart.horoscope?.yearly;
  if (!h) return [];
  return layerFromSihuaArray(srcChart, dstChart, srcName, h.sihua, "L4", `流年${h.ganZhi || ""}`);
}

function runDirection(srcChart, dstChart, srcName, levels, extras = {}) {
  const want = new Set(levels);
  const flights = [];
  if (want.has("natal"))   flights.push(...layerNatal(srcChart, dstChart, srcName));
  if (want.has("palace"))  flights.push(...layerPalace(srcChart, dstChart, srcName));
  if (want.has("decadal")) flights.push(...layerDecadal(srcChart, dstChart, srcName));
  if (want.has("yearly"))  flights.push(...layerYearly(srcChart, dstChart, srcName));
  if (want.has("monthly") && Array.isArray(extras.monthlySihua?.[srcName === extras.nameA ? "a" : "b"])) {
    flights.push(...layerFromSihuaArray(
      srcChart, dstChart, srcName,
      extras.monthlySihua[srcName === extras.nameA ? "a" : "b"],
      "L5",
      extras.monthlyLabel || "流月",
    ));
  }
  if (want.has("daily") && Array.isArray(extras.dailySihua?.[srcName === extras.nameA ? "a" : "b"])) {
    flights.push(...layerFromSihuaArray(
      srcChart, dstChart, srcName,
      extras.dailySihua[srcName === extras.nameA ? "a" : "b"],
      "L6",
      extras.dailyLabel || "流日",
    ));
  }
  return flights;
}

function buildSummary(flights, { nameA, nameB, levels }) {
  const layerOrder = ["L1", "L2", "L3", "L4", "L5", "L6"];
  let s = `===== 交叉飛化分析（程式精算，非 AI 推測）=====\n`;
  s += `涵蓋層級：${levels.map(l => {
    for (const [k, v] of Object.entries(LAYER_META)) if (v.key === l) return `${k}(${v.label})`;
    return l;
  }).join("、")}\n\n`;

  for (const [dirKey, srcName, dstName] of [["aToB", nameA, nameB], ["bToA", nameB, nameA]]) {
    s += `## ${srcName} → ${dstName}\n`;
    const byLayer = {};
    for (const f of flights[dirKey]) {
      (byLayer[f.layer] ||= []).push(f);
    }
    let wrote = false;
    for (const layer of layerOrder) {
      const list = byLayer[layer] || [];
      if (!list.length) continue;
      wrote = true;
      // Temporal layers carry date context in sourceLabel; surface it so the AI
      // can anchor the narrative to a specific decade/year/month/day.
      const temporalTag = list[0].sourceLabel
        ? list[0].sourceLabel.replace(`${srcName} `, "").trim()
        : "";
      const heading = ["L3", "L4", "L5", "L6"].includes(layer) && temporalTag
        ? `${LAYER_META[layer].label}（${temporalTag}）`
        : LAYER_META[layer].label;
      s += `\n### ${heading}\n`;
      for (const f of list) {
        const origin = f.fromPalace ? `${f.fromPalace}(${f.fromGan || ""}干)起` : "";
        const minorTag = f.starKind === "minor" ? "(輔星)" : "";
        s += `- ${origin}${f.star}${f.hua} → 飛入 ${dstName} 的 ${f.toPalace}${minorTag}\n`;
      }
    }
    if (!wrote) s += "\n（本方向無可對應的飛入點）\n";
    s += "\n";
  }
  return s.trimEnd();
}

/**
 * 主 API
 * @param {object} chartA  第一人盤 (calculateChart 輸出)
 * @param {object} chartB  第二人盤
 * @param {object} opts
 *   levels         string[]  要跑哪些層 ("natal"|"palace"|"decadal"|"yearly"|"monthly"|"daily")
 *                            default L1-L4 全跑
 *   nameA, nameB   string    summary 裡面稱呼 (default "甲方"/"乙方")
 *   monthlySihua   { a: [4 stars], b: [4 stars] }  L5 外部傳入的流月四化
 *   dailySihua     { a: [4 stars], b: [4 stars] }  L6 外部傳入的流日四化
 *   monthlyLabel   string    流月標籤 (e.g. "2026年5月")
 *   dailyLabel     string    流日標籤 (e.g. "2026/5/12")
 * @returns { flights: { aToB, bToA }, summary: string }
 */
export function calculateCrossSihua(chartA, chartB, opts = {}) {
  const {
    levels = DEFAULT_LEVELS,
    nameA = "甲方",
    nameB = "乙方",
  } = opts;

  const extras = {
    nameA,
    nameB,
    monthlySihua: opts.monthlySihua,
    dailySihua: opts.dailySihua,
    monthlyLabel: opts.monthlyLabel,
    dailyLabel: opts.dailyLabel,
  };

  const flights = {
    aToB: runDirection(chartA, chartB, nameA, levels, extras),
    bToA: runDirection(chartB, chartA, nameB, levels, extras),
  };

  return {
    flights,
    summary: buildSummary(flights, { nameA, nameB, levels }),
    meta: { levels, nameA, nameB },
  };
}

// Exported for testing only
export const __internals = {
  findStarPalace,
  parseSihuaEntry,
  layerNatal,
  layerPalace,
  layerDecadal,
  layerYearly,
  DI_ZHI,
  HUA_ORDER,
  LAYER_META,
};
