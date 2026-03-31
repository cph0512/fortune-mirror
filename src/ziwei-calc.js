/**
 * 紫微斗數排盤引擎（基於 iztro 套件）
 */

import { astro } from 'iztro';

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
    },
    gongs,
    gongGan,
    daXian,
    siHua,
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

  return text;
}

export { SHI_CHEN_RANGE, DI_ZHI, TIAN_GAN };
