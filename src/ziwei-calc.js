/**
 * 紫微斗數排盤引擎（基於 iztro 套件）
 */

import { astro } from 'iztro';

// 設定庚干四化為北派：太陽祿、武曲權、天同科、天相忌
astro.config({
  mutagens: {
    '庚': ['太阳', '武曲', '天同', '天相']
  }
});

const SHI_CHEN_RANGE = [
  "子 (23:00-01:00)","丑 (01:00-03:00)","寅 (03:00-05:00)","卯 (05:00-07:00)",
  "辰 (07:00-09:00)","巳 (09:00-11:00)","午 (11:00-13:00)","未 (13:00-15:00)",
  "申 (15:00-17:00)","酉 (17:00-19:00)","戌 (19:00-21:00)","亥 (21:00-23:00)"
];

const DI_ZHI = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const TIAN_GAN = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];

const SHI_CHEN_NAMES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];

// 小時(0-23) → 時辰 index(0-11)
function hourToShiChenIdx(hour) {
  if (hour >= 23 || hour < 1) return 0;   // 子
  return Math.floor((hour + 1) / 2);
}

// 繁體化 iztro 輸出的簡體字
const SC2TC = {
  "贪狼":"貪狼","巨门":"巨門","禄存":"祿存","文曲":"文曲","廉贞":"廉貞",
  "武曲":"武曲","破军":"破軍","天机":"天機","太阳":"太陽","天同":"天同",
  "天梁":"天梁","紫微":"紫微","太阴":"太陰","七杀":"七殺","天相":"天相",
  "天府":"天府","左辅":"左輔","右弼":"右弼","文昌":"文昌",
  "火星":"火星","铃星":"鈴星","擎羊":"擎羊","陀罗":"陀羅",
  "天魁":"天魁","天钺":"天鉞","地空":"地空","地劫":"地劫",
  "天马":"天馬","天姚":"天姚","天刑":"天刑","化禄":"化祿",
  "化权":"化權","化科":"化科","化忌":"化忌",
  "命宫":"命宮","兄弟":"兄弟宮","夫妻":"夫妻宮","子女":"子女宮",
  "财帛":"財帛宮","疾厄":"疾厄宮","迁移":"遷移宮","仆役":"交友宮",
  "官禄":"官祿宮","田宅":"田宅宮","福德":"福德宮","父母":"父母宮",
  "庙":"廟","旺":"旺","得":"得","利":"利","平":"平","不":"不","陷":"陷",
  "禄":"祿","权":"權","科":"科","忌":"忌",
  "水二局":"水二局","木三局":"木三局","金四局":"金四局","土五局":"土五局","火六局":"火六局",
  "长生":"長生","沐浴":"沐浴","冠带":"冠帶","临官":"臨官","帝旺":"帝旺",
  "衰":"衰","病":"病","死":"死","墓":"墓","绝":"絕","胎":"胎","养":"養",
};

function toTC(str) {
  if (!str) return str;
  let result = str;
  // Sort by length desc to replace longer matches first
  const keys = Object.keys(SC2TC).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    result = result.replaceAll(k, SC2TC[k]);
  }
  return result;
}

// 宮名對照（iztro 用的名稱 → 標準名）
const PALACE_NAME_MAP = {
  "命宫":"命宮","命宮":"命宮",
  "兄弟":"兄弟宮","兄弟宮":"兄弟宮",
  "夫妻":"夫妻宮","夫妻宮":"夫妻宮",
  "子女":"子女宮","子女宮":"子女宮",
  "财帛":"財帛宮","財帛宮":"財帛宮","财帛宮":"財帛宮",
  "疾厄":"疾厄宮","疾厄宮":"疾厄宮",
  "迁移":"遷移宮","遷移宮":"遷移宮","迁移宮":"遷移宮",
  "仆役":"交友宮","交友宮":"交友宮","仆役宮":"交友宮",
  "官禄":"官祿宮","官祿宮":"官祿宮","官禄宮":"官祿宮",
  "田宅":"田宅宮","田宅宮":"田宅宮",
  "福德":"福德宮","福德宮":"福德宮",
  "父母":"父母宮","父母宮":"父母宮",
};

function normalizePalaceName(name) {
  return PALACE_NAME_MAP[name] || toTC(name);
}

export function calculateChart(solarYear, solarMonth, solarDay, hour, minute, gender) {
  const shiChenIdx = hourToShiChenIdx(hour);
  const dateStr = `${solarYear}-${solarMonth}-${solarDay}`;

  const result = astro.bySolar(dateStr, shiChenIdx, gender === '男' ? '男' : '女');

  // 組裝為前端需要的格式
  const gongs = {};
  const gongGan = {};
  const daXian = [];
  const siHua = {};

  // 找命宮
  let mingGongZhi = '';
  let mingGongGan = '';
  let juName = toTC(result.fiveElementsClass);

  for (const p of result.palaces) {
    const zhi = toTC(p.earthlyBranch);
    const gan = toTC(p.heavenlyStem);
    const palaceName = normalizePalaceName(p.name);

    gongGan[zhi] = gan;

    const stars = [];
    const minor = [];
    const sihuaList = [];

    for (const s of (p.majorStars || [])) {
      const name = toTC(s.name);
      stars.push(name);
      if (s.mutagen) {
        const hua = toTC(s.mutagen);
        sihuaList.push(`${name}${hua}`);
        siHua[name] = hua;
      }
    }

    for (const s of (p.minorStars || [])) {
      const name = toTC(s.name);
      minor.push(name);
      if (s.mutagen) {
        const hua = toTC(s.mutagen);
        sihuaList.push(`${name}${hua}`);
        siHua[name] = hua;
      }
    }

    // 長生十二神
    const changSheng = p.changsheng12 ? toTC(p.changsheng12) : '';

    gongs[zhi] = { name: palaceName, stars, minor, sihua: sihuaList, changSheng };

    if (palaceName === '命宮') {
      mingGongZhi = zhi;
      mingGongGan = gan;
    }

    if (p.decadal) {
      daXian.push({
        zhi,
        startAge: p.decadal.range[0],
        endAge: p.decadal.range[1],
      });
    }
  }

  // 身宮（isBodyPalace）、命主、身主
  let shenGongName = '';
  for (const p of result.palaces) {
    if (p.isBodyPalace) {
      shenGongName = normalizePalaceName(p.name);
    }
  }
  const commandStar = result.soul ? toTC(result.soul) : '';
  const bodyStar = result.body ? toTC(result.body) : '';

  const chineseDate = result.chineseDate || '';
  const parts = chineseDate.split(' ');
  const yearGanZhi = parts[0] || '';

  // 本命宮位飛化表
  const SI_HUA_TABLE = {
    "甲":["廉貞化祿","破軍化權","武曲化科","太陽化忌"],
    "乙":["天機化祿","天梁化權","紫微化科","太陰化忌"],
    "丙":["天同化祿","天機化權","文昌化科","廉貞化忌"],
    "丁":["太陰化祿","天同化權","天機化科","巨門化忌"],
    "戊":["貪狼化祿","太陰化權","右弼化科","天機化忌"],
    "己":["武曲化祿","貪狼化權","天梁化科","文曲化忌"],
    "庚":["太陽化祿","武曲化權","天同化科","天相化忌"],
    "辛":["巨門化祿","太陽化權","文曲化科","文昌化忌"],
    "壬":["天梁化祿","紫微化權","左輔化科","武曲化忌"],
    "癸":["破軍化祿","巨門化權","太陰化科","貪狼化忌"],
  };
  const feiHua = {};
  for (const zhi of DI_ZHI) {
    const gan = gongGan[zhi];
    if (gan && SI_HUA_TABLE[gan]) {
      feiHua[zhi] = { gan, sihua: SI_HUA_TABLE[gan] };
    }
  }

  // 流年/大限資料（用今年）
  const now = new Date();
  const horoDate = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
  let horoscope = null;
  try {
    const h = result.horoscope(horoDate);
    const benPalaceMap = {};
    for (const p of result.palaces) {
      benPalaceMap[toTC(p.earthlyBranch)] = normalizePalaceName(p.name);
    }

    horoscope = {
      decadal: {
        ganZhi: toTC(h.decadal.heavenlyStem) + toTC(h.decadal.earthlyBranch),
        sihua: (h.decadal.mutagen || []).map(toTC),
        mingGongZhi: toTC(h.decadal.earthlyBranch),
        dieBenGong: benPalaceMap[toTC(h.decadal.earthlyBranch)] || '',
        palaceNames: (h.decadal.palaceNames || []).map(n => normalizePalaceName(n)),
      },
      yearly: {
        ganZhi: toTC(h.yearly.heavenlyStem) + toTC(h.yearly.earthlyBranch),
        sihua: (h.yearly.mutagen || []).map(toTC),
        mingGongZhi: toTC(h.yearly.earthlyBranch),
        dieBenGong: benPalaceMap[toTC(h.yearly.earthlyBranch)] || '',
        palaceNames: (h.yearly.palaceNames || []).map(n => normalizePalaceName(n)),
      },
      age: {
        nominalAge: h.age?.nominalAge || 0,
        ganZhi: toTC((h.age?.heavenlyStem || '') + (h.age?.earthlyBranch || '')),
        sihua: (h.age?.mutagen || []).map(toTC),
        dieBenGong: benPalaceMap[toTC(h.age?.earthlyBranch || '')] || '',
      },
    };
  } catch(e) { /* horoscope not available */ }

  return {
    basic: {
      solarDate: `${solarYear}年${solarMonth}月${solarDay}日`,
      lunarDate: `農曆${result.lunarDate}`,
      yearGanZhi,
      shiChen: SHI_CHEN_NAMES[shiChenIdx],
      gender,
      yinYang: TIAN_GAN.indexOf(yearGanZhi[0]) % 2 === 0 ? "陽" : "陰",
      mingGong: `${mingGongGan}${mingGongZhi}`,
      mingGongZhi,
      shenGong: shenGongName,
      commandStar,
      bodyStar,
      wuXingJu: juName,
      lunarMonth: result.rawDates?.lunarDate?.lunarMonth || 0,
      shiChenIdx,
    },
    gongs,
    gongGan,
    daXian,
    siHua,
    feiHua,
    horoscope,
  };
}

export function formatChart(chart) {
  const b = chart.basic;
  let text = `## 紫微斗數命盤\n\n`;
  text += `### 基本資料\n`;
  text += `- 陽曆：${b.solarDate}\n`;
  text += `- 農曆：${b.lunarDate}\n`;
  text += `- 年柱：${b.yearGanZhi}年\n`;
  text += `- 時辰：${b.shiChen}時\n`;
  text += `- 性別：${b.gender}（${b.yinYang}${b.gender}）\n`;
  text += `- 命宮：${b.mingGong}（${b.mingGongZhi}宮）\n`;
  text += `- 身宮：${b.shenGong}\n`;
  text += `- 命主：${b.commandStar}\n`;
  text += `- 身主：${b.bodyStar}\n`;
  text += `- 五行局：${b.wuXingJu}\n\n`;

  text += `### 十二宮排盤\n`;
  text += `| 地支 | 宮干 | 宮位 | 主星 | 輔星 | 四化 | 長生 |\n`;
  text += `|------|------|------|------|------|------|------|\n`;
  for (const zhi of DI_ZHI) {
    const g = chart.gongs[zhi];
    if (!g) continue;
    text += `| ${zhi} | ${chart.gongGan[zhi]} | ${g.name} | ${g.stars.join("、") || "-"} | ${g.minor.join("、") || "-"} | ${g.sihua.join("、") || "-"} | ${g.changSheng || "-"} |\n`;
  }

  text += `\n### 四化\n`;
  for (const [star, hua] of Object.entries(chart.siHua)) {
    text += `- ${star}${hua}\n`;
  }

  text += `\n### 大限\n`;
  for (const dx of chart.daXian) {
    text += `- ${dx.zhi}宮：${dx.startAge}-${dx.endAge}歲\n`;
  }

  // 宮位飛化表
  if (chart.feiHua) {
    text += `\n### 宮位飛化表\n`;
    text += `| 宮位 | 宮干 | 化祿 | 化權 | 化科 | 化忌 |\n`;
    text += `|------|------|------|------|------|------|\n`;
    for (const zhi of DI_ZHI) {
      const g = chart.gongs[zhi];
      const fh = chart.feiHua[zhi];
      if (g && fh) {
        text += `| ${g.name} | ${fh.gan} | ${fh.sihua[0]} | ${fh.sihua[1]} | ${fh.sihua[2]} | ${fh.sihua[3]} |\n`;
      }
    }
  }

  // 流年/大限分析資料
  if (chart.horoscope) {
    const h = chart.horoscope;
    text += `\n### 當前大限\n`;
    text += `- 大限干支：${h.decadal.ganZhi}\n`;
    text += `- 大限命宮位置：${h.decadal.mingGongZhi}（疊本命${h.decadal.dieBenGong}）\n`;
    text += `- 大限四化：${h.decadal.sihua[0]}化祿、${h.decadal.sihua[1]}化權、${h.decadal.sihua[2]}化科、${h.decadal.sihua[3]}化忌\n`;

    text += `\n### 今年流年\n`;
    text += `- 流年干支：${h.yearly.ganZhi}\n`;
    text += `- 流年命宮位置：${h.yearly.mingGongZhi}（疊本命${h.yearly.dieBenGong}）\n`;
    text += `- 流年四化：${h.yearly.sihua[0]}化祿、${h.yearly.sihua[1]}化權、${h.yearly.sihua[2]}化科、${h.yearly.sihua[3]}化忌\n`;

    if (h.age && h.age.nominalAge) {
      text += `\n### 小限\n`;
      text += `- 虛歲：${h.age.nominalAge}\n`;
      text += `- 小限干支：${h.age.ganZhi}\n`;
      text += `- 小限命宮疊本命：${h.age.dieBenGong}\n`;
      text += `- 小限四化：${h.age.sihua[0]}化祿、${h.age.sihua[1]}化權、${h.age.sihua[2]}化科、${h.age.sihua[3]}化忌\n`;
    }

    // 疊宮對照表
    if (h.decadal.palaceNames?.length === 12 && h.yearly.palaceNames?.length === 12) {
      text += `\n### 疊宮對照（大限/流年宮位 vs 本命宮位）\n`;
      text += `| 地支 | 本命宮位 | 大限宮位 | 流年宮位 |\n`;
      text += `|------|----------|----------|----------|\n`;
      for (const zhi of DI_ZHI) {
        const benName = chart.gongs[zhi]?.name || '-';
        // Find this zhi's index to map decadal/yearly palace names
        const zhiIdx = DI_ZHI.indexOf(zhi);
        // 大限命宮地支
        const dxMingIdx = DI_ZHI.indexOf(h.decadal.mingGongZhi);
        const dxOffset = (zhiIdx - dxMingIdx + 12) % 12;
        const dxName = h.decadal.palaceNames[dxOffset] || '-';
        // 流年命宮地支
        const ynMingIdx = DI_ZHI.indexOf(h.yearly.mingGongZhi);
        const ynOffset = (zhiIdx - ynMingIdx + 12) % 12;
        const ynName = h.yearly.palaceNames[ynOffset] || '-';
        text += `| ${zhi} | ${benName} | ${dxName} | ${ynName} |\n`;
      }
    }
  }

  return text;
}

/**
 * 壓縮版紫微排盤格式 — 去 markdown table，用簡寫
 * 給 AI 一樣能讀懂，token 省 ~40%
 */
export function formatChartCompact(chart) {
  const b = chart.basic;
  let t = `[紫微] ${b.solarDate} ${b.lunarDate} ${b.yearGanZhi}年 ${b.shiChen}時 ${b.gender}(${b.yinYang}) `;
  t += `命宮:${b.mingGong}(${b.mingGongZhi}) 身宮:${b.shenGong} 命主:${b.commandStar} 身主:${b.bodyStar} ${b.wuXingJu}\n`;

  // 十二宮：一行一宮
  t += `[宮盤]\n`;
  for (const zhi of DI_ZHI) {
    const g = chart.gongs[zhi];
    if (!g) continue;
    const stars = g.stars.join(",") || "";
    const minor = g.minor.length ? ` +${g.minor.join(",")}` : "";
    const sh = g.sihua.length ? ` 化:${g.sihua.join(",")}` : "";
    const cs = g.changSheng ? ` ${g.changSheng}` : "";
    t += `${zhi}(${chart.gongGan[zhi]})${g.name}: ${stars}${minor}${sh}${cs}\n`;
  }

  // 四化
  t += `[四化] ${Object.entries(chart.siHua).map(([s,h]) => `${s}${h}`).join(" ")}\n`;

  // 大限
  t += `[大限] ${chart.daXian.map(d => `${d.zhi}:${d.startAge}-${d.endAge}`).join(" ")}\n`;

  // 飛化表
  if (chart.feiHua) {
    t += `[飛化]\n`;
    for (const zhi of DI_ZHI) {
      const g = chart.gongs[zhi];
      const fh = chart.feiHua[zhi];
      if (g && fh) {
        t += `${g.name}(${fh.gan}): 祿${fh.sihua[0]} 權${fh.sihua[1]} 科${fh.sihua[2]} 忌${fh.sihua[3]}\n`;
      }
    }
  }

  // 大限/流年/小限
  if (chart.horoscope) {
    const h = chart.horoscope;
    t += `[大限] ${h.decadal.ganZhi} 命宮:${h.decadal.mingGongZhi}(疊${h.decadal.dieBenGong}) 四化:${h.decadal.sihua.join(",")}\n`;
    t += `[流年] ${h.yearly.ganZhi} 命宮:${h.yearly.mingGongZhi}(疊${h.yearly.dieBenGong}) 四化:${h.yearly.sihua.join(",")}\n`;
    if (h.age && h.age.nominalAge) {
      t += `[小限] 虛歲${h.age.nominalAge} ${h.age.ganZhi} 疊${h.age.dieBenGong} 四化:${h.age.sihua.join(",")}\n`;
    }

    // 疊宮對照：一行搞定
    if (h.decadal.palaceNames?.length === 12 && h.yearly.palaceNames?.length === 12) {
      t += `[疊宮] `;
      for (const zhi of DI_ZHI) {
        const ben = chart.gongs[zhi]?.name || '-';
        const zhiIdx = DI_ZHI.indexOf(zhi);
        const dxMingIdx = DI_ZHI.indexOf(h.decadal.mingGongZhi);
        const dxName = h.decadal.palaceNames[(zhiIdx - dxMingIdx + 12) % 12] || '-';
        const ynMingIdx = DI_ZHI.indexOf(h.yearly.mingGongZhi);
        const ynName = h.yearly.palaceNames[(zhiIdx - ynMingIdx + 12) % 12] || '-';
        if (ben === dxName && ben === ynName) {
          t += `${zhi}=${ben} `;
        } else {
          t += `${zhi}=${ben}/${dxName}/${ynName} `;
        }
      }
      t += `\n`;
    }
  }

  return t;
}

/**
 * 無出生時間時，用天干推算宮位影響（不依賴時辰）
 * 年干四化、生年天干飛化入十二宮 — 這些不受出生時辰影響
 */
export function formatChartByTianGan(solarYear, solarMonth, solarDay, gender) {
  // 用 lunar-javascript 取得年干支（不需要時辰）
  // 先用 iztro 起一個參考盤（子時），只取天干相關資料
  const dateStr = `${solarYear}-${solarMonth}-${solarDay}`;
  const refChart = astro.bySolar(dateStr, 0, gender === '男' ? '男' : '女');

  const chineseDate = refChart.chineseDate || '';
  const parts = chineseDate.split(' ');
  const yearGanZhi = parts[0] || '';
  const yearGan = yearGanZhi ? yearGanZhi[0] : '';

  // 天干四化表
  const SI_HUA_TABLE = {
    "甲":["廉貞化祿","破軍化權","武曲化科","太陽化忌"],
    "乙":["天機化祿","天梁化權","紫微化科","太陰化忌"],
    "丙":["天同化祿","天機化權","文昌化科","廉貞化忌"],
    "丁":["太陰化祿","天同化權","天機化科","巨門化忌"],
    "戊":["貪狼化祿","太陰化權","右弼化科","天機化忌"],
    "己":["武曲化祿","貪狼化權","天梁化科","文曲化忌"],
    "庚":["太陽化祿","武曲化權","天同化科","天相化忌"],
    "辛":["巨門化祿","太陽化權","文曲化科","文昌化忌"],
    "壬":["天梁化祿","紫微化權","左輔化科","武曲化忌"],
    "癸":["破軍化祿","巨門化權","太陰化科","貪狼化忌"],
  };

  const yearSiHua = SI_HUA_TABLE[toTC(yearGan)] || [];

  // 農曆日期
  const lunarDate = refChart.lunarDate || '';

  // 遍歷十二宮，收集主星分佈（主星位置不隨時辰改變的有：紫微系和天府系星曜位置由農曆日決定）
  // 但命宮位置受時辰影響，所以我們只列出星曜在哪個地支宮
  const starMap = {};
  for (const p of refChart.palaces) {
    const zhi = toTC(p.earthlyBranch);
    const gan = toTC(p.heavenlyStem);
    const stars = [];
    for (const s of (p.majorStars || [])) {
      stars.push(toTC(s.name));
    }
    starMap[zhi] = { gan, stars };
  }

  let text = `## 紫微斗數天干分析（無出生時間）\n\n`;
  text += `### 基本資料\n`;
  text += `- 陽曆：${solarYear}年${solarMonth}月${solarDay}日\n`;
  text += `- 農曆：農曆${lunarDate}\n`;
  text += `- 年柱：${yearGanZhi}年\n`;
  text += `- 性別：${gender}\n`;
  text += `- 出生時間：未知\n\n`;

  text += `### 生年四化（年干「${toTC(yearGan)}」）\n`;
  text += `⚠️ 以下四化不受出生時辰影響，是此人命格的核心能量：\n`;
  yearSiHua.forEach(h => { text += `- ${h}\n`; });

  text += `\n### 十二宮主星分佈\n`;
  text += `⚠️ 注意：因無出生時間，命宮位置不確定，以下僅列出主星在各地支宮的分佈，供交叉比對用。\n`;
  text += `| 地支 | 宮干 | 主星 |\n`;
  text += `|------|------|------|\n`;
  for (const zhi of DI_ZHI) {
    const info = starMap[zhi];
    if (info) {
      text += `| ${zhi} | ${info.gan} | ${info.stars.join("、") || "-"} |\n`;
    }
  }

  text += `\n### 天干飛化對照\n`;
  text += `⚠️ 用生年天干看此人的四化星落入哪些宮位的主星，可推斷此人的天賦能量方向：\n`;
  for (const zhi of DI_ZHI) {
    const info = starMap[zhi];
    if (!info) continue;
    const gan = info.gan;
    const ganHua = SI_HUA_TABLE[toTC(gan)];
    if (ganHua) {
      text += `- ${zhi}宮（宮干${gan}）→ ${ganHua.join("、")}\n`;
    }
  }

  return text;
}

/**
 * 疊宮分析引擎 — 將本命+大限+流年+流月的四化疊合結果預先計算好
 * 回傳結構化摘要，供 AI 直接讀取，不需 AI 自己推算
 */
export function calculateTransitOverlay(chart, targetYear = null, targetMonths = null) {
  if (!chart || !chart.horoscope) return null;

  const SI_HUA_TABLE = {
    "甲":["廉貞","破軍","武曲","太陽"],
    "乙":["天機","天梁","紫微","太陰"],
    "丙":["天同","天機","文昌","廉貞"],
    "丁":["太陰","天同","天機","巨門"],
    "戊":["貪狼","太陰","右弼","天機"],
    "己":["武曲","貪狼","天梁","文曲"],
    "庚":["太陽","武曲","天同","天相"],
    "辛":["巨門","太陽","文曲","文昌"],
    "壬":["天梁","紫微","左輔","武曲"],
    "癸":["破軍","巨門","太陰","貪狼"],
  };
  const HUA_NAMES = ["化祿","化權","化科","化忌"];

  const h = chart.horoscope;
  const year = targetYear || new Date().getFullYear();

  // === 1. 建立本命宮位 + 流年宮位 → 地支對照 ===
  const zhiToGong = {};  // 地支 → 本命宮位名
  const gongToZhi = {};  // 本命宮位名 → 地支
  const zhiToYearlyGong = {};  // 地支 → 流年宮位名
  const PALACE_ORDER = ["命宮","兄弟宮","夫妻宮","子女宮","財帛宮","疾厄宮","遷移宮","交友宮","官祿宮","田宅宮","福德宮","父母宮"];
  for (const zhi of DI_ZHI) {
    if (chart.gongs[zhi]) {
      zhiToGong[zhi] = chart.gongs[zhi].name;
      gongToZhi[chart.gongs[zhi].name] = zhi;
    }
  }
  // 流年宮位：從流年命宮地支開始，逆行排12宮
  const ynMingIdx = DI_ZHI.indexOf(h.yearly.mingGongZhi);
  for (let i = 0; i < 12; i++) {
    const zhiIdx = (ynMingIdx - i + 12) % 12;
    zhiToYearlyGong[DI_ZHI[zhiIdx]] = PALACE_ORDER[i];
  }
  // 雙宮名稱：「本命X宮/流年Y宮」
  function dualName(zhi) {
    const ben = zhiToGong[zhi] || '';
    const yn = zhiToYearlyGong[zhi] || '';
    if (ben === yn) return ben;
    return `本命${ben}/流年${yn}`;
  }

  // === 2. 收集每個宮位的四化（按地支） ===
  // 結構: palaceEffects[zhi] = { gongName, stars, natal:[], decadal:[], yearly:[], monthly:{} }
  const palaceEffects = {};
  for (const zhi of DI_ZHI) {
    palaceEffects[zhi] = {
      gongName: dualName(zhi),
      stars: chart.gongs[zhi]?.stars || [],
      natal: [],    // 本命四化
      decadal: [],  // 大限四化
      yearly: [],   // 流年四化
      monthly: {},  // 各月流月四化 { 1: [], 2: [], ... }
    };
  }

  // 輔助：找某顆星在哪個宮位(地支)
  function findStarZhi(starName) {
    for (const zhi of DI_ZHI) {
      const g = chart.gongs[zhi];
      if (!g) continue;
      if (g.stars.includes(starName) || g.minor.includes(starName)) return zhi;
      // 也檢查四化裡的星名
      if (g.sihua.some(s => s.startsWith(starName))) return zhi;
    }
    return null;
  }

  // === 3. 本命四化 ===
  for (const [star, hua] of Object.entries(chart.siHua)) {
    const zhi = findStarZhi(star);
    if (zhi) {
      palaceEffects[zhi].natal.push({ star, hua, source: '本命' });
    }
  }

  // === 4. 大限四化 ===
  const dxGan = h.decadal.ganZhi?.[0];
  if (dxGan && SI_HUA_TABLE[dxGan]) {
    SI_HUA_TABLE[dxGan].forEach((star, i) => {
      const zhi = findStarZhi(star);
      if (zhi) {
        palaceEffects[zhi].decadal.push({ star, hua: HUA_NAMES[i], source: `大限(${h.decadal.ganZhi})` });
      }
    });
  }

  // === 5. 流年四化 ===
  const ynGan = h.yearly.ganZhi?.[0];
  if (ynGan && SI_HUA_TABLE[ynGan]) {
    SI_HUA_TABLE[ynGan].forEach((star, i) => {
      const zhi = findStarZhi(star);
      if (zhi) {
        palaceEffects[zhi].yearly.push({ star, hua: HUA_NAMES[i], source: `流年(${h.yearly.ganZhi})` });
      }
    });
  }

  // === 6. 流月四化（1-12月）— 使用斗君法 ===
  const months = targetMonths || [1,2,3,4,5,6,7,8,9,10,11,12];

  // 斗君算法：
  // 1. 從太歲（流年地支）起正月，逆數到出生農曆月
  // 2. 從該位置起子時，順數到出生時辰
  // 3. 到達的宮位就是斗君（=正月），然後順行排各月
  const taiSuiIdx = DI_ZHI.indexOf(h.yearly.mingGongZhi);  // 流年命宮地支
  const lunarMonth = chart.basic.lunarMonth || 1;
  const shiChenIdx = chart.basic.shiChenIdx || 0;

  // Step 1: 從太歲逆行至出生月（太歲=正月，逆行=減）
  const step1Idx = (taiSuiIdx - (lunarMonth - 1) + 12) % 12;
  // Step 2: 從 step1 順行至出生時辰（step1=子時，順行=加）
  const douJunIdx = (step1Idx + shiChenIdx) % 12;

  // 流月天干推算：年干+月份 → 月干（五虎遁）
  const TIGER_MAP = { "甲":"丙","乙":"戊","丙":"庚","丁":"壬","戊":"甲","己":"丙","庚":"戊","辛":"庚","壬":"壬","癸":"甲" };
  function getMonthGan(yearGan, monthNum) {
    const startGan = TIGER_MAP[yearGan];
    if (!startGan) return null;
    const idx = (TIAN_GAN.indexOf(startGan) + (monthNum - 1)) % 10;
    return TIAN_GAN[idx];
  }

  const monthlyOverlays = {};
  for (const m of months) {
    // 流月命宮：從斗君（正月）順行
    const monthMingIdx = (douJunIdx + (m - 1)) % 12;
    const monthMingZhi = DI_ZHI[monthMingIdx];
    const monthGan = getMonthGan(ynGan, m);

    const monthEffects = [];
    if (monthGan && SI_HUA_TABLE[monthGan]) {
      SI_HUA_TABLE[monthGan].forEach((star, i) => {
        const zhi = findStarZhi(star);
        if (zhi) {
          const eff = { star, hua: HUA_NAMES[i], source: `流月${m}月(${monthGan})` };
          monthEffects.push({ ...eff, zhi, gongName: dualName(zhi) });
          if (!palaceEffects[zhi].monthly[m]) palaceEffects[zhi].monthly[m] = [];
          palaceEffects[zhi].monthly[m].push(eff);
        }
      });
    }

    monthlyOverlays[m] = {
      mingGongZhi: monthMingZhi,
      dieBenGong: dualName(monthMingZhi),
      gan: monthGan,
      effects: monthEffects,
    };
  }

  // === 7. 找出重疊效果（雙祿、雙忌、祿忌沖等） ===
  const highlights = [];
  for (const zhi of DI_ZHI) {
    const pe = palaceEffects[zhi];
    const allEffects = [...pe.natal, ...pe.decadal, ...pe.yearly];

    // 統計同宮的化祿/化忌數量
    const luCount = allEffects.filter(e => e.hua === '化祿').length;
    const jiCount = allEffects.filter(e => e.hua === '化忌').length;
    const quanCount = allEffects.filter(e => e.hua === '化權').length;

    if (luCount >= 2) {
      const sources = allEffects.filter(e => e.hua === '化祿').map(e => `${e.source}${e.star}化祿`);
      highlights.push({ type: '雙祿', zhi, gongName: pe.gongName, detail: sources.join(' + '), impact: '大吉，該領域資源豐沛' });
    }
    if (jiCount >= 2) {
      const sources = allEffects.filter(e => e.hua === '化忌').map(e => `${e.source}${e.star}化忌`);
      highlights.push({ type: '雙忌', zhi, gongName: pe.gongName, detail: sources.join(' + '), impact: '該領域壓力加倍，需特別注意' });
    }
    if (luCount >= 1 && jiCount >= 1) {
      highlights.push({ type: '祿忌同宮', zhi, gongName: pe.gongName, detail: `祿忌交會於${pe.gongName}`, impact: '機會與挑戰並存' });
    }
    if (quanCount >= 2) {
      highlights.push({ type: '雙權', zhi, gongName: pe.gongName, detail: '掌控力加倍', impact: '該領域主導力強' });
    }

    // 對宮沖（化忌沖對宮）
    const oppIdx = (DI_ZHI.indexOf(zhi) + 6) % 12;
    const oppZhi = DI_ZHI[oppIdx];
    const oppGong = dualName(oppZhi);
    if (jiCount >= 1 && oppGong) {
      highlights.push({ type: '化忌沖', zhi, gongName: pe.gongName, targetGong: oppGong,
        detail: `${pe.gongName}化忌沖${oppGong}`, impact: `${oppGong}受沖，該領域易有波折` });
    }

    // 流月重疊
    for (const m of months) {
      const me = pe.monthly[m] || [];
      const allWithMonth = [...allEffects, ...me];
      const mLu = allWithMonth.filter(e => e.hua === '化祿').length;
      const mJi = allWithMonth.filter(e => e.hua === '化忌').length;
      if (mLu >= 3) {
        highlights.push({ type: '三祿疊', zhi, gongName: pe.gongName, month: m,
          detail: `${m}月三祿疊於${pe.gongName}`, impact: '該月此領域極度有利' });
      }
      if (mJi >= 3) {
        highlights.push({ type: '三忌疊', zhi, gongName: pe.gongName, month: m,
          detail: `${m}月三忌疊於${pe.gongName}`, impact: '該月此領域風險極高' });
      }
    }
  }

  // === 8. 生成 AI 摘要文字 ===
  let summary = `\n===== 疊宮分析結果（程式計算，非 AI 推測）=====\n\n`;

  summary += `【當前大限】${h.decadal.ganZhi}，大限命宮在${h.decadal.mingGongZhi}宮（疊本命${h.decadal.dieBenGong}）\n`;
  if (dxGan && SI_HUA_TABLE[dxGan]) {
    summary += `大限四化：${SI_HUA_TABLE[dxGan].map((s,i) => `${s}${HUA_NAMES[i]}`).join('、')}\n`;
    SI_HUA_TABLE[dxGan].forEach((star, i) => {
      const zhi = findStarZhi(star);
      if (zhi) summary += `  → ${star}${HUA_NAMES[i]} 飛入${dualName(zhi)}（${zhi}宮）\n`;
    });
  }

  summary += `\n【${year}年流年】${h.yearly.ganZhi}，流年命宮在${h.yearly.mingGongZhi}宮（疊本命${h.yearly.dieBenGong}）\n`;
  if (ynGan && SI_HUA_TABLE[ynGan]) {
    summary += `流年四化：${SI_HUA_TABLE[ynGan].map((s,i) => `${s}${HUA_NAMES[i]}`).join('、')}\n`;
    SI_HUA_TABLE[ynGan].forEach((star, i) => {
      const zhi = findStarZhi(star);
      if (zhi) summary += `  → ${star}${HUA_NAMES[i]} 飛入${dualName(zhi)}（${zhi}宮）\n`;
    });
  }

  summary += `\n【流月概覽】\n`;
  for (const m of months) {
    const mo = monthlyOverlays[m];
    summary += `${m}月：命宮在${mo.mingGongZhi}宮（疊${mo.dieBenGong}），天干${mo.gan}`;
    if (mo.effects.length > 0) {
      summary += `，四化：${mo.effects.map(e => `${e.star}${e.hua}→${e.gongName}`).join('、')}`;
    }
    summary += `\n`;
  }

  if (highlights.length > 0) {
    summary += `\n【⚠️ 重要疊宮效果】\n`;
    for (const hl of highlights) {
      summary += `- ${hl.type}：${hl.detail}`;
      if (hl.month) summary += `（${hl.month}月）`;
      summary += ` → ${hl.impact}\n`;
    }
  }

  summary += `\n【疊宮總表】\n`;
  summary += `| 地支 | 本命宮位 | 流年宮位 | 主星 | 本命四化 | 大限四化 | 流年四化 |\n`;
  summary += `|------|----------|----------|------|----------|----------|----------|\n`;
  for (const zhi of DI_ZHI) {
    const pe = palaceEffects[zhi];
    const benGong = zhiToGong[zhi] || '';
    const ynGong = zhiToYearlyGong[zhi] || '';
    const stars = pe.stars.join(',') || '-';
    const natal = pe.natal.map(e => `${e.star}${e.hua}`).join(',') || '-';
    const decadal = pe.decadal.map(e => `${e.star}${e.hua}`).join(',') || '-';
    const yearly = pe.yearly.map(e => `${e.star}${e.hua}`).join(',') || '-';
    summary += `| ${zhi} | ${benGong} | ${ynGong} | ${stars} | ${natal} | ${decadal} | ${yearly} |\n`;
  }

  return {
    decadal: {
      ganZhi: h.decadal.ganZhi,
      mingGongZhi: h.decadal.mingGongZhi,
      dieBenGong: h.decadal.dieBenGong,
      sihua: dxGan ? SI_HUA_TABLE[dxGan].map((s,i) => ({ star: s, hua: HUA_NAMES[i], zhi: findStarZhi(s), gongName: zhiToGong[findStarZhi(s)] || '' })) : [],
    },
    yearly: {
      ganZhi: h.yearly.ganZhi,
      mingGongZhi: h.yearly.mingGongZhi,
      dieBenGong: h.yearly.dieBenGong,
      sihua: ynGan ? SI_HUA_TABLE[ynGan].map((s,i) => ({ star: s, hua: HUA_NAMES[i], zhi: findStarZhi(s), gongName: zhiToGong[findStarZhi(s)] || '' })) : [],
    },
    monthly: monthlyOverlays,
    palaceEffects,
    highlights,
    summary,
    // Expose the natal-palace lookup so calculateDayHourOverlay can reuse it
    // without recomputing — keeps day/hour overlays consistent with the base.
    _lookup: { zhiToGong, findStarZhi, dualName, SI_HUA_TABLE, HUA_NAMES },
  };
}


// ============================================================
// 流日 / 流時 疊宮計算
// ============================================================
// Shared tables are scoped to the module so calculateDayHourOverlay doesn't
// depend on internal refs of calculateTransitOverlay's return value. This lets
// callers use day/hour overlay standalone (e.g., the Decision Advisor on a
// chart that hasn't run a full analysis yet).
const _SI_HUA_TABLE = {
  "甲":["廉貞","破軍","武曲","太陽"],
  "乙":["天機","天梁","紫微","太陰"],
  "丙":["天同","天機","文昌","廉貞"],
  "丁":["太陰","天同","天機","巨門"],
  "戊":["貪狼","太陰","右弼","天機"],
  "己":["武曲","貪狼","天梁","文曲"],
  "庚":["太陽","武曲","天同","天相"],
  "辛":["巨門","太陽","文曲","文昌"],
  "壬":["天梁","紫微","左輔","武曲"],
  "癸":["破軍","巨門","太陰","貪狼"],
};
const _HUA_NAMES = ["化祿","化權","化科","化忌"];

// 五鼠遁 — day gan → hour gan at 子時
const _HOUR_START_GAN = {
  "甲":"甲","己":"甲",
  "乙":"丙","庚":"丙",
  "丙":"戊","辛":"戊",
  "丁":"庚","壬":"庚",
  "戊":"壬","癸":"壬",
};

// Julian Day Number for a Gregorian date at noon.
function _julianDay(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524;
}

// Day stem/branch via the 60-day sexagenary cycle.
// Reference anchor: 1900-01-01 (JDN 2415021) is 甲戌 (gan=0, zhi=10).
function _dayGanZhi(y, m, d) {
  const offset = _julianDay(y, m, d) - 2415021;
  const ganIdx = ((0 + offset) % 10 + 10) % 10;
  const zhiIdx = ((10 + offset) % 12 + 12) % 12;
  return { gan: TIAN_GAN[ganIdx], zhi: DI_ZHI[zhiIdx], ganIdx, zhiIdx };
}

// Hour stem from day stem + shichen index (0=子 ... 11=亥).
function _hourGan(dayGan, shichenIdx) {
  const startGan = _HOUR_START_GAN[dayGan];
  if (!startGan) return null;
  const idx = (TIAN_GAN.indexOf(startGan) + shichenIdx) % 10;
  return TIAN_GAN[idx];
}

/**
 * 計算流日（+ 可選流時）的精確疊宮效果。
 * 回傳 { daily, hourly, summary } — summary 可直接串進 AI prompt。
 *
 * @param {object} chart    calculateChart() 回傳的本命盤
 * @param {number} year     西元年（西曆）
 * @param {number} month    西曆月 1-12
 * @param {number} day      西曆日
 * @param {number|null} hour   可選 0-23；給值才算流時
 * @param {number|null} minute 流時用不到，保留給將來擴充
 */
export function calculateDayHourOverlay(chart, year, month, day, hour = null, minute = null) {
  if (!chart || !chart.gongs) return null;

  // Natal-palace lookup — rebuild on the fly so this function works on any
  // chart, not just one that already ran calculateTransitOverlay.
  const zhiToGong = {};
  for (const zhi of DI_ZHI) {
    if (chart.gongs[zhi]) zhiToGong[zhi] = chart.gongs[zhi].name;
  }
  function findStarZhi(starName) {
    for (const zhi of DI_ZHI) {
      const g = chart.gongs[zhi];
      if (!g) continue;
      if (g.stars.includes(starName) || g.minor.includes(starName)) return zhi;
      if (g.sihua.some(s => s.startsWith(starName))) return zhi;
    }
    return null;
  }
  const gongOrPlain = (zhi) => zhiToGong[zhi] || `${zhi}宮`;

  // ── 流日 ──
  const { gan: dayGan, zhi: dayZhi } = _dayGanZhi(year, month, day);
  const dailySihua = _SI_HUA_TABLE[dayGan]
    ? _SI_HUA_TABLE[dayGan].map((star, i) => {
        const landedZhi = findStarZhi(star);
        return {
          star,
          hua: _HUA_NAMES[i],
          zhi: landedZhi,
          gongName: landedZhi ? gongOrPlain(landedZhi) : "（本命無此星）",
        };
      })
    : [];

  // ── 流時 (optional) ──
  let hourly = null;
  if (hour !== null && hour !== undefined) {
    const shichenIdx = hourToShiChenIdx(hour);
    const hGan = _hourGan(dayGan, shichenIdx);
    const hZhi = DI_ZHI[shichenIdx];
    const hourlySihua = hGan && _SI_HUA_TABLE[hGan]
      ? _SI_HUA_TABLE[hGan].map((star, i) => {
          const landedZhi = findStarZhi(star);
          return {
            star,
            hua: _HUA_NAMES[i],
            zhi: landedZhi,
            gongName: landedZhi ? gongOrPlain(landedZhi) : "（本命無此星）",
          };
        })
      : [];
    hourly = {
      gan: hGan,
      zhi: hZhi,
      shichenIdx,
      ganZhi: hGan ? `${hGan}${hZhi}` : null,
      sihua: hourlySihua,
    };
  }

  // ── 疊宮重點：哪些宮位被多層疊加了化祿/化忌 ──
  // Collect natal sihua into a map (to surface triple-overlaps of 祿 or 忌)
  const palaceHits = {};
  for (const zhi of DI_ZHI) palaceHits[zhi] = { lu: [], ji: [] };

  for (const [star, hua] of Object.entries(chart.siHua || {})) {
    const z = findStarZhi(star);
    if (!z) continue;
    if (hua === "化祿") palaceHits[z].lu.push(`本命${star}化祿`);
    if (hua === "化忌") palaceHits[z].ji.push(`本命${star}化忌`);
  }
  for (const s of dailySihua) {
    if (!s.zhi) continue;
    if (s.hua === "化祿") palaceHits[s.zhi].lu.push(`流日${s.star}化祿`);
    if (s.hua === "化忌") palaceHits[s.zhi].ji.push(`流日${s.star}化忌`);
  }
  if (hourly?.sihua) {
    for (const s of hourly.sihua) {
      if (!s.zhi) continue;
      if (s.hua === "化祿") palaceHits[s.zhi].lu.push(`流時${s.star}化祿`);
      if (s.hua === "化忌") palaceHits[s.zhi].ji.push(`流時${s.star}化忌`);
    }
  }
  const highlights = [];
  for (const zhi of DI_ZHI) {
    const hit = palaceHits[zhi];
    if (hit.lu.length >= 2) highlights.push({ type: "多祿疊", gongName: gongOrPlain(zhi), detail: hit.lu.join(" + "), impact: "該宮位當下能量旺，此事有利" });
    if (hit.ji.length >= 2) highlights.push({ type: "多忌疊", gongName: gongOrPlain(zhi), detail: hit.ji.join(" + "), impact: "該宮位壓力集中，此事需避" });
    if (hit.lu.length >= 1 && hit.ji.length >= 1) highlights.push({ type: "祿忌同宮", gongName: gongOrPlain(zhi), detail: `${hit.lu.join(",")} 與 ${hit.ji.join(",")}`, impact: "吉凶交錯，成敗一線之隔" });
  }

  // ── 摘要文字 ──
  let summary = `\n===== 流日${hourly ? "/流時" : ""}疊宮（程式精算，非 AI 推測）=====\n`;
  summary += `日期：${year}/${month}/${day}${hourly ? ` ${String(hour).padStart(2, "0")}:${String(minute || 0).padStart(2, "0")}` : ""}\n`;
  summary += `\n【流日】${dayGan}${dayZhi}日\n`;
  if (dailySihua.length) {
    summary += `流日四化：${dailySihua.map(s => `${s.star}${s.hua}`).join("、")}\n`;
    for (const s of dailySihua) {
      summary += `  → ${s.star}${s.hua} 飛入 ${s.gongName}\n`;
    }
  } else {
    summary += "（無可用流日四化資料）\n";
  }
  if (hourly) {
    summary += `\n【流時】${hourly.ganZhi || "(未知)"} 時（地支 ${hourly.zhi}）\n`;
    if (hourly.sihua?.length) {
      summary += `流時四化：${hourly.sihua.map(s => `${s.star}${s.hua}`).join("、")}\n`;
      for (const s of hourly.sihua) {
        summary += `  → ${s.star}${s.hua} 飛入 ${s.gongName}\n`;
      }
    }
  }
  if (highlights.length) {
    summary += `\n【疊宮重點】\n`;
    for (const h of highlights) {
      summary += `- ${h.type} 於 ${h.gongName}：${h.detail}（${h.impact}）\n`;
    }
  }

  return {
    daily: {
      gan: dayGan,
      zhi: dayZhi,
      ganZhi: `${dayGan}${dayZhi}`,
      sihua: dailySihua,
    },
    hourly,
    highlights,
    summary,
  };
}

export { SHI_CHEN_RANGE, DI_ZHI, TIAN_GAN };

// 五虎遁月干表 — 年干 → 正月天干，然後順推每月
const _TIGER_MAP = {
  "甲": "丙", "乙": "戊", "丙": "庚", "丁": "壬", "戊": "甲",
  "己": "丙", "庚": "戊", "辛": "庚", "壬": "壬", "癸": "甲",
};

/**
 * 取某年某月的流月四化 4 顆星 (祿/權/科/忌 順序)
 * 目前用 chart.horoscope 的流年干 (current year only)。跨年月後續 iteration 補。
 * @param {object} chart  calculateChart 輸出
 * @param {number} month  1-12
 * @returns {string[]|null}  [祿星, 權星, 科星, 忌星] 或 null
 */
export function getMonthlySihuaStars(chart, month) {
  const yearGan = chart?.horoscope?.yearly?.ganZhi?.[0];
  if (!yearGan || month < 1 || month > 12) return null;
  const startGan = _TIGER_MAP[yearGan];
  if (!startGan) return null;
  const monthGan = TIAN_GAN[(TIAN_GAN.indexOf(startGan) + (month - 1)) % 10];
  return _SI_HUA_TABLE[monthGan] ? [..._SI_HUA_TABLE[monthGan]] : null;
}

/**
 * 取某日的流日四化 4 顆星 (祿/權/科/忌 順序)
 * 複用 calculateDayHourOverlay 的計算, 抽出 sihua 的 star name array
 * @param {object} chart  calculateChart 輸出
 * @param {number} year, month, day
 * @returns {string[]|null}  [祿星, 權星, 科星, 忌星] 或 null
 */
export function getDailySihuaStars(chart, year, month, day) {
  const overlay = calculateDayHourOverlay(chart, year, month, day);
  if (!overlay?.daily?.sihua?.length) return null;
  return overlay.daily.sihua.map(s => s.star);
}
