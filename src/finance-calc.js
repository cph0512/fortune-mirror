/**
 * 紫微斗數財運專項分析引擎
 * 輸出大限/流年/流月的財務相關宮位資料
 */

import { astro } from 'iztro';

const DI_ZHI = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const TIAN_GAN = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];

const SC2TC = {
  "贪狼":"貪狼","巨门":"巨門","禄存":"祿存","廉贞":"廉貞",
  "破军":"破軍","天机":"天機","太阳":"太陽","七杀":"七殺",
  "天钺":"天鉞","左辅":"左輔","右弼":"右弼","陀罗":"陀羅",
  "铃星":"鈴星","擎羊":"擎羊","天马":"天馬","地劫":"地劫",
  "地空":"地空","天姚":"天姚","天刑":"天刑",
  "命宫":"命宮","兄弟":"兄弟宮","夫妻":"夫妻宮","子女":"子女宮",
  "财帛":"財帛宮","疾厄":"疾厄宮","迁移":"遷移宮","仆役":"交友宮",
  "官禄":"官祿宮","田宅":"田宅宮","福德":"福德宮","父母":"父母宮",
  "庙":"廟","旺":"旺","得":"得","利":"利","平":"平","不":"不","陷":"陷",
  "禄":"祿","权":"權","科":"科","忌":"忌",
};

function toTC(str) {
  if (!str) return str;
  let result = str;
  const keys = Object.keys(SC2TC).sort((a, b) => b.length - a.length);
  for (const k of keys) result = result.replaceAll(k, SC2TC[k]);
  return result;
}

const PALACE_MAP = {
  "命宫":"命宮","兄弟":"兄弟宮","夫妻":"夫妻宮","子女":"子女宮",
  "财帛":"財帛宮","疾厄":"疾厄宮","迁移":"遷移宮","仆役":"交友宮",
  "官禄":"官祿宮","田宅":"田宅宮","福德":"福德宮","父母":"父母宮",
};

function normPalace(n) { return PALACE_MAP[n] || toTC(n); }

function extractPalace(p) {
  if (!p) return null;
  const stars = (p.majorStars || []).map(s => {
    let n = toTC(s.name);
    if (s.brightness) n += toTC(s.brightness);
    if (s.mutagen) n += '(' + toTC(s.mutagen) + ')';
    return n;
  });
  const minor = (p.minorStars || []).map(s => {
    let n = toTC(s.name);
    if (s.mutagen) n += '(' + toTC(s.mutagen) + ')';
    return n;
  });
  return {
    gan: toTC(p.heavenlyStem),
    zhi: toTC(p.earthlyBranch),
    stars,
    minor,
  };
}

// 小時→時辰
function hourToIdx(hour) {
  if (hour >= 23 || hour < 1) return 0;
  return Math.floor((hour + 1) / 2);
}

// 財運相關宮位
const FINANCE_PALACES = ['命宫','财帛','官禄','迁移','福德','田宅','子女','仆役'];

export function calculateFinance(solarYear, solarMonth, solarDay, hour, gender) {
  const shiChenIdx = hourToIdx(hour);
  const dateStr = `${solarYear}-${solarMonth}-${solarDay}`;
  const result = astro.bySolar(dateStr, shiChenIdx, gender === '男' ? '男' : '女');

  // 本命盤基本資料
  const benPalaceMap = {};
  for (const p of result.palaces) {
    benPalaceMap[toTC(p.earthlyBranch)] = normPalace(p.name);
  }

  // 本命財務宮位
  const benMing = {};
  for (const gn of FINANCE_PALACES) {
    for (const p of result.palaces) {
      if (p.name === gn) {
        benMing[normPalace(gn)] = extractPalace(p);
      }
    }
  }

  // 身宮
  let shenGong = '';
  for (const p of result.palaces) {
    if (p.isBodyPalace) shenGong = normPalace(p.name);
  }

  // 五行局
  const juName = toTC(result.fiveElementsClass);

  // 命宮位置
  let mingGong = '';
  for (const p of result.palaces) {
    if (normPalace(p.name) === '命宮') {
      mingGong = toTC(p.heavenlyStem) + toTC(p.earthlyBranch);
    }
  }

  // 年干四化
  const yearSihua = {};
  for (const p of result.palaces) {
    for (const s of [...(p.majorStars||[]), ...(p.minorStars||[])]) {
      if (s.mutagen) yearSihua[toTC(s.name)] = toTC(s.mutagen);
    }
  }

  // 宮干飛化（重點：財帛宮、命宮、福德宮的飛化）
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

  const keyFeiHua = {};
  for (const gn of ['命宮','財帛宮','福德宮','田宅宮','官祿宮']) {
    const data = benMing[gn];
    if (data && SI_HUA_TABLE[data.gan]) {
      keyFeiHua[gn] = { gan: data.gan, sihua: SI_HUA_TABLE[data.gan] };
    }
  }

  // 大限 + 流年 + 流月
  const now = new Date();
  const horoDate = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
  const h = result.horoscope(horoDate);

  // 大限資料
  const decadal = {
    ganZhi: toTC(h.decadal.heavenlyStem) + toTC(h.decadal.earthlyBranch),
    sihua: (h.decadal.mutagen || []).map(toTC),
    palaces: {},
  };
  for (const gn of FINANCE_PALACES) {
    const p = h.palace(gn, 'decadal');
    if (p) {
      decadal.palaces[normPalace(gn)] = {
        ...extractPalace(p),
        dieBen: benPalaceMap[toTC(p.earthlyBranch)] || '',
      };
    }
  }

  // 流年資料
  const yearly = {
    ganZhi: toTC(h.yearly.heavenlyStem) + toTC(h.yearly.earthlyBranch),
    sihua: (h.yearly.mutagen || []).map(toTC),
    palaces: {},
  };
  for (const gn of FINANCE_PALACES) {
    const p = h.palace(gn, 'yearly');
    if (p) {
      yearly.palaces[normPalace(gn)] = {
        ...extractPalace(p),
        dieBen: benPalaceMap[toTC(p.earthlyBranch)] || '',
      };
    }
  }

  // 12 個月流月資料
  const months = [];
  const year = now.getFullYear();
  for (let m = 1; m <= 12; m++) {
    const hm = result.horoscope(`${year}-${m}-15`);
    const monthData = {
      month: m,
      ganZhi: toTC(hm.monthly.heavenlyStem) + toTC(hm.monthly.earthlyBranch),
      sihua: (hm.monthly.mutagen || []).map(toTC),
    };
    // 流月財帛宮
    const mp = hm.palace('财帛', 'monthly');
    if (mp) {
      monthData.caiBo = {
        ...extractPalace(mp),
        dieBen: benPalaceMap[toTC(mp.earthlyBranch)] || '',
      };
    }
    months.push(monthData);
  }

  // 小限
  const age = {
    nominalAge: h.age?.nominalAge || 0,
    ganZhi: toTC((h.age?.heavenlyStem || '') + (h.age?.earthlyBranch || '')),
    sihua: (h.age?.mutagen || []).map(toTC),
  };

  return {
    basic: {
      solarDate: `${solarYear}年${solarMonth}月${solarDay}日`,
      lunarDate: `農曆${result.lunarDate}`,
      chineseDate: result.chineseDate,
      gender,
      mingGong,
      shenGong,
      juName,
      yearSihua,
    },
    benMing,
    keyFeiHua,
    decadal,
    yearly,
    months,
    age,
  };
}

export function formatFinance(chart) {
  let t = `## 紫微斗數・財運專項分析\n\n`;

  // 基本資料
  const b = chart.basic;
  t += `### 基本資料\n`;
  t += `- ${b.solarDate}｜${b.lunarDate}｜${b.gender}\n`;
  t += `- 命宮：${b.mingGong}｜身宮：${b.shenGong}｜${b.juName}\n`;
  t += `- 生年四化：${Object.entries(b.yearSihua).map(([s,h]) => s+h).join('、')}\n\n`;

  // 本命財務宮位
  t += `### 本命財務關鍵宮位\n`;
  t += `| 宮位 | 宮干 | 主星 | 輔星 |\n`;
  t += `|------|------|------|------|\n`;
  for (const [name, data] of Object.entries(chart.benMing)) {
    if (data) {
      t += `| ${name} | ${data.gan} | ${data.stars.join('、') || '-'} | ${data.minor.join('、') || '-'} |\n`;
    }
  }

  // 重點宮位飛化
  t += `\n### 重點宮位飛化（因果推導用）\n`;
  for (const [gong, fh] of Object.entries(chart.keyFeiHua)) {
    t += `- ${gong}（${fh.gan}干）→ ${fh.sihua.join('、')}\n`;
  }

  // 大限
  const dx = chart.decadal;
  t += `\n### 當前大限財運（${dx.ganZhi}）\n`;
  t += `- 大限四化：${dx.sihua[0]}化祿、${dx.sihua[1]}化權、${dx.sihua[2]}化科、${dx.sihua[3]}化忌\n`;
  t += `| 大限宮位 | 位置 | 疊本命 | 主星 | 輔星 |\n`;
  t += `|----------|------|--------|------|------|\n`;
  for (const [name, data] of Object.entries(dx.palaces)) {
    t += `| ${name} | ${data.gan}${data.zhi} | ${data.dieBen} | ${data.stars.join('、') || '-'} | ${data.minor.join('、') || '-'} |\n`;
  }

  // 流年
  const yn = chart.yearly;
  t += `\n### 今年流年財運（${yn.ganZhi}）\n`;
  t += `- 流年四化：${yn.sihua[0]}化祿、${yn.sihua[1]}化權、${yn.sihua[2]}化科、${yn.sihua[3]}化忌\n`;
  t += `| 流年宮位 | 位置 | 疊本命 | 主星 | 輔星 |\n`;
  t += `|----------|------|--------|------|------|\n`;
  for (const [name, data] of Object.entries(yn.palaces)) {
    t += `| ${name} | ${data.gan}${data.zhi} | ${data.dieBen} | ${data.stars.join('、') || '-'} | ${data.minor.join('、') || '-'} |\n`;
  }

  // 12個月流月
  t += `\n### 12 個月流月財帛宮\n`;
  t += `| 月份 | 流月干支 | 流月四化 | 財帛宮位置 | 疊本命 | 主星 |\n`;
  t += `|------|----------|----------|------------|--------|------|\n`;
  for (const m of chart.months) {
    const cb = m.caiBo;
    t += `| ${m.month}月 | ${m.ganZhi} | ${m.sihua.join('/')} | ${cb ? cb.gan+cb.zhi : '-'} | ${cb?.dieBen || '-'} | ${cb ? cb.stars.join('、') : '-'} |\n`;
  }

  // 小限
  if (chart.age.nominalAge) {
    t += `\n### 小限\n`;
    t += `- 虛歲${chart.age.nominalAge}｜${chart.age.ganZhi}｜四化：${chart.age.sihua.join('/')}\n`;
  }

  return t;
}
