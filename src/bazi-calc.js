/**
 * 八字排盤引擎（基於 lunar-javascript）
 */

import { Solar } from 'lunar-javascript';

const SHI_CHEN_NAMES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];

// 簡體→繁體
const SC2TC = {
  "七杀":"七殺","正财":"正財","偏财":"偏財","正印":"正印","偏印":"偏印",
  "比肩":"比肩","劫财":"劫財","食神":"食神","伤官":"傷官","正官":"正官",
  "炉中火":"爐中火","覆灯火":"覆燈火","涧下水":"澗下水","海中金":"海中金",
  "剑锋金":"劍鋒金","钗钏金":"釵釧金","砂中金":"砂中金","白蜡金":"白蠟金",
  "山头火":"山頭火","霹雳火":"霹靂火","天上火":"天上火","佛灯火":"佛燈火",
  "山下火":"山下火","大驿土":"大驛土","城头土":"城頭土","壁上土":"壁上土",
  "路旁土":"路旁土","沙中土":"沙中土","大林木":"大林木","杨柳木":"楊柳木",
  "松柏木":"松柏木","平地木":"平地木","桑柘木":"桑柘木","石榴木":"石榴木",
  "长流水":"長流水","大海水":"大海水","天河水":"天河水","井泉水":"井泉水",
  "大溪水":"大溪水","金箔金":"金箔金",
};

function toTC(str) {
  if (!str) return str;
  let result = str;
  for (const [k, v] of Object.entries(SC2TC)) {
    result = result.replaceAll(k, v);
  }
  return result;
}

// 小時→時辰 index
function hourToShiChenIdx(hour) {
  if (hour >= 23 || hour < 1) return 0;
  return Math.floor((hour + 1) / 2);
}

// 五行統計
function countWuXing(ba) {
  const ganWuXing = { "甲":"木","乙":"木","丙":"火","丁":"火","戊":"土","己":"土","庚":"金","辛":"金","壬":"水","癸":"水" };
  const zhiWuXing = { "子":"水","丑":"土","寅":"木","卯":"木","辰":"土","巳":"火","午":"火","未":"土","申":"金","酉":"金","戌":"土","亥":"水" };

  const count = { "金":0, "木":0, "水":0, "火":0, "土":0 };
  const pillars = [ba.getYear(), ba.getMonth(), ba.getDay(), ba.getTime()];
  for (const p of pillars) {
    const gan = p[0], zhi = p[1];
    if (ganWuXing[gan]) count[ganWuXing[gan]]++;
    if (zhiWuXing[zhi]) count[zhiWuXing[zhi]]++;
  }
  return count;
}

export function calculateBazi(solarYear, solarMonth, solarDay, hour, gender, minute = 0) {
  const shiChenIdx = hourToShiChenIdx(hour);
  // lunar-javascript 的八字根據節氣定月柱，需要用 Solar 精確時間
  const solar = Solar.fromYmdHms(solarYear, solarMonth, solarDay, hour, minute, 0);
  const lunar = solar.getLunar();
  const ba = lunar.getEightChar();

  const yearPillar = ba.getYear();
  const monthPillar = ba.getMonth();
  const dayPillar = ba.getDay();
  const timePillar = ba.getTime();

  // 十神
  const yearShenGan = toTC(ba.getYearShiShenGan());
  const monthShenGan = toTC(ba.getMonthShiShenGan());
  const timeShenGan = toTC(ba.getTimeShiShenGan());

  // 地支藏干十神
  const yearShenZhi = (ba.getYearShiShenZhi() || []).map(toTC);
  const monthShenZhi = (ba.getMonthShiShenZhi() || []).map(toTC);
  const dayShenZhi = (ba.getDayShiShenZhi() || []).map(toTC);
  const timeShenZhi = (ba.getTimeShiShenZhi() || []).map(toTC);

  // 藏干
  const yearHideGan = ba.getYearHideGan() || [];
  const monthHideGan = ba.getMonthHideGan() || [];
  const dayHideGan = ba.getDayHideGan() || [];
  const timeHideGan = ba.getTimeHideGan() || [];

  // 納音
  const yearNaYin = toTC(ba.getYearNaYin());
  const monthNaYin = toTC(ba.getMonthNaYin());
  const dayNaYin = toTC(ba.getDayNaYin());
  const timeNaYin = toTC(ba.getTimeNaYin());

  // 日主
  const dayMaster = dayPillar[0];
  const dayWuXing = toTC(ba.getDayWuXing());

  // 五行
  const wuXing = countWuXing(ba);

  // 大運
  const isMale = gender === "男";
  const yun = ba.getYun(isMale ? 1 : 0);
  const startAge = yun.getStartYear();
  const daYunList = yun.getDaYun().slice(1, 11).map(dy => ({
    ganZhi: dy.getGanZhi(),
    startAge: dy.getStartAge(),
    startYear: dy.getStartYear(),
  }));

  return {
    solarDate: `${solarYear}年${solarMonth}月${solarDay}日`,
    lunarDate: lunar.toString(),
    gender,
    shiChen: SHI_CHEN_NAMES[shiChenIdx],
    pillars: {
      year: { ganZhi: yearPillar, naYin: yearNaYin, shiShenGan: yearShenGan, shiShenZhi: yearShenZhi, hideGan: yearHideGan },
      month: { ganZhi: monthPillar, naYin: monthNaYin, shiShenGan: monthShenGan, shiShenZhi: monthShenZhi, hideGan: monthHideGan },
      day: { ganZhi: dayPillar, naYin: dayNaYin, shiShenGan: "日主", shiShenZhi: dayShenZhi, hideGan: dayHideGan },
      time: { ganZhi: timePillar, naYin: timeNaYin, shiShenGan: timeShenGan, shiShenZhi: timeShenZhi, hideGan: timeHideGan },
    },
    dayMaster,
    dayWuXing,
    wuXing,
    daYun: daYunList,
    startAge,
    shengXiao: lunar.getYearShengXiao(),
  };
}

export function formatBazi(chart) {
  const p = chart.pillars;
  let text = `## 八字命盤\n\n`;
  text += `### 基本資料\n`;
  text += `- 陽曆：${chart.solarDate}\n`;
  text += `- 農曆：${chart.lunarDate}\n`;
  text += `- 時辰：${chart.shiChen}時\n`;
  text += `- 性別：${chart.gender}\n`;
  text += `- 生肖：${chart.shengXiao}\n`;
  text += `- 日主：${chart.dayMaster}（${chart.dayWuXing}）\n\n`;

  text += `### 四柱\n`;
  text += `| | 年柱 | 月柱 | 日柱 | 時柱 |\n`;
  text += `|------|------|------|------|------|\n`;
  text += `| 干支 | ${p.year.ganZhi} | ${p.month.ganZhi} | ${p.day.ganZhi} | ${p.time.ganZhi} |\n`;
  text += `| 十神 | ${p.year.shiShenGan} | ${p.month.shiShenGan} | ${p.day.shiShenGan} | ${p.time.shiShenGan} |\n`;
  text += `| 藏干 | ${p.year.hideGan.join("、")} | ${p.month.hideGan.join("、")} | ${p.day.hideGan.join("、")} | ${p.time.hideGan.join("、")} |\n`;
  text += `| 納音 | ${p.year.naYin} | ${p.month.naYin} | ${p.day.naYin} | ${p.time.naYin} |\n\n`;

  text += `### 五行分布\n`;
  const wx = chart.wuXing;
  text += `金${wx["金"]} 木${wx["木"]} 水${wx["水"]} 火${wx["火"]} 土${wx["土"]}\n\n`;

  text += `### 大運（${chart.startAge}歲起運）\n`;
  text += `| 起始歲 | 干支 | 起始年 |\n`;
  text += `|--------|------|--------|\n`;
  for (const dy of chart.daYun) {
    text += `| ${dy.startAge} | ${dy.ganZhi} | ${dy.startYear} |\n`;
  }

  return text;
}

export function formatBaziCompact(chart) {
  const p = chart.pillars;
  let t = `[八字] ${chart.solarDate} ${chart.lunarDate} ${chart.shiChen}時 ${chart.gender} ${chart.shengXiao} 日主:${chart.dayMaster}(${chart.dayWuXing})\n`;
  t += `[四柱] 年${p.year.ganZhi}(${p.year.shiShenGan}) 月${p.month.ganZhi}(${p.month.shiShenGan}) 日${p.day.ganZhi}(${p.day.shiShenGan}) 時${p.time.ganZhi}(${p.time.shiShenGan})\n`;
  t += `[藏干] 年${p.year.hideGan.join("")} 月${p.month.hideGan.join("")} 日${p.day.hideGan.join("")} 時${p.time.hideGan.join("")}\n`;
  t += `[納音] ${p.year.naYin} ${p.month.naYin} ${p.day.naYin} ${p.time.naYin}\n`;
  const wx = chart.wuXing;
  t += `[五行] 金${wx["金"]}木${wx["木"]}水${wx["水"]}火${wx["火"]}土${wx["土"]}\n`;
  t += `[大運] ${chart.startAge}歲起 ${chart.daYun.map(d => `${d.ganZhi}(${d.startAge})`).join(" ")}\n`;
  return t;
}
