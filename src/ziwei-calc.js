/**
 * 紫微斗數自動排盤引擎
 * 依據 15 步驟排盤邏輯
 */

// ===== 基礎常數 =====
const TIAN_GAN = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const DI_ZHI = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const SHI_CHEN = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const SHI_CHEN_RANGE = [
  "子 (23:00-01:00)","丑 (01:00-03:00)","寅 (03:00-05:00)","卯 (05:00-07:00)",
  "辰 (07:00-09:00)","巳 (09:00-11:00)","午 (11:00-13:00)","未 (13:00-15:00)",
  "申 (15:00-17:00)","酉 (17:00-19:00)","戌 (19:00-21:00)","亥 (21:00-23:00)"
];

const GONG_NAMES = ["命宮","父母宮","福德宮","田宅宮","官祿宮","交友宮","遷移宮","疾厄宮","財帛宮","子女宮","夫妻宮","兄弟宮"];

// 五行局對照表 [天干index][命宮地支index] → 局數
// 水二局=2, 木三局=3, 金四局=4, 土五局=5, 火六局=6
const WU_XING_JU = {
  // 甲己
  "甲": {"子":2,"丑":6,"寅":3,"卯":3,"辰":5,"巳":6,"午":2,"未":6,"申":3,"酉":4,"戌":5,"亥":2},
  "己": {"子":2,"丑":6,"寅":3,"卯":3,"辰":5,"巳":6,"午":2,"未":6,"申":3,"酉":4,"戌":5,"亥":2},
  // 乙庚
  "乙": {"子":4,"丑":2,"寅":6,"卯":3,"辰":3,"巳":5,"午":6,"未":2,"申":6,"酉":3,"戌":4,"亥":5},
  "庚": {"子":4,"丑":2,"寅":6,"卯":3,"辰":3,"巳":5,"午":6,"未":2,"申":6,"酉":3,"戌":4,"亥":5},
  // 丙辛
  "丙": {"子":5,"丑":4,"寅":2,"卯":6,"辰":3,"巳":3,"午":5,"未":6,"申":2,"酉":6,"戌":3,"亥":4},
  "辛": {"子":5,"丑":4,"寅":2,"卯":6,"辰":3,"巳":3,"午":5,"未":6,"申":2,"酉":6,"戌":3,"亥":4},
  // 丁壬
  "丁": {"子":3,"丑":5,"寅":4,"卯":2,"辰":6,"巳":3,"午":3,"未":5,"申":4,"酉":2,"戌":6,"亥":3},
  "壬": {"子":3,"丑":5,"寅":4,"卯":2,"辰":6,"巳":3,"午":3,"未":5,"申":4,"酉":2,"戌":6,"亥":3},
  // 戊癸
  "戊": {"子":6,"丑":3,"寅":5,"卯":4,"辰":2,"巳":6,"午":6,"未":3,"申":5,"酉":5,"戌":2,"亥":6},
  "癸": {"子":6,"丑":3,"寅":5,"卯":4,"辰":2,"巳":6,"午":6,"未":3,"申":5,"酉":5,"戌":2,"亥":6},
};

const JU_NAME = {2:"水二局",3:"木三局",4:"金四局",5:"土五局",6:"火六局"};

// 四化表: 天干 → [化祿, 化權, 化科, 化忌]
const SI_HUA = {
  "甲": ["廉貞","破軍","武曲","太陽"],
  "乙": ["天機","天梁","紫微","太陰"],
  "丙": ["天同","天機","文昌","廉貞"],
  "丁": ["太陰","天同","天機","巨門"],
  "戊": ["貪狼","太陰","右弼","天機"],
  "己": ["武曲","貪狼","天梁","文曲"],
  "庚": ["太陽","武曲","天同","天相"],
  "辛": ["巨門","太陽","文曲","文昌"],
  "壬": ["天梁","紫微","左輔","武曲"],
  "癸": ["破軍","巨門","太陰","貪狼"],
};

// ===== 農曆轉換 (簡化版，1900-2100) =====
// 農曆資料壓縮表 (每年一個hex值)
const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
  0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
  0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
  0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
  0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
  0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a4d0,0x0d150,0x0f252,
  0x0d520,
];

function lunarYearDays(y) {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
  return sum + leapDays(y);
}

function leapMonth(y) { return LUNAR_INFO[y - 1900] & 0xf; }

function leapDays(y) {
  if (leapMonth(y)) return (LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29;
  return 0;
}

function monthDays(y, m) {
  return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29;
}

function solarToLunar(year, month, day) {
  let offset = 0;
  const baseDate = new Date(1900, 0, 31); // 農曆1900年正月初一
  const objDate = new Date(year, month - 1, day);
  offset = Math.floor((objDate - baseDate) / 86400000);

  let lunarYear = 1900;
  let temp = 0;
  for (let i = 1900; i < 2101 && offset > 0; i++) {
    temp = lunarYearDays(i);
    offset -= temp;
    lunarYear = i;
  }
  if (offset < 0) { offset += temp; lunarYear--; }

  const leap = leapMonth(lunarYear);
  let isLeap = false;
  let lunarMonth = 1;
  for (let i = 1; i < 13 && offset > 0; i++) {
    if (leap > 0 && i === (leap + 1) && !isLeap) {
      --i; isLeap = true; temp = leapDays(lunarYear);
    } else {
      temp = monthDays(lunarYear, i);
    }
    if (isLeap && i === (leap + 1)) isLeap = false;
    offset -= temp;
    if (!isLeap) lunarMonth = i;
  }
  if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
    if (isLeap) isLeap = false; else { isLeap = true; --lunarMonth; }
  }
  if (offset < 0) { offset += temp; --lunarMonth; }
  const lunarDay = offset + 1;

  return { year: lunarYear, month: lunarMonth, day: lunarDay, isLeap };
}

// ===== 天干地支計算 =====
function yearToGanZhi(year) {
  const ganIdx = (year - 4) % 10;
  const zhiIdx = (year - 4) % 12;
  return { gan: TIAN_GAN[ganIdx], zhi: DI_ZHI[zhiIdx], ganIdx, zhiIdx };
}

function hourToShiChen(hour, minute = 0) {
  const totalMin = hour * 60 + minute;
  if (totalMin >= 1380 || totalMin < 60) return 0;   // 子
  return Math.floor((totalMin - 60) / 120) + 1;
}

// ===== 步驟一：起盤立十二宮 =====
function step1_mingGong(lunarMonth, shiChenIdx) {
  // 從寅位(idx=2)順推月份，再逆推時辰
  let pos = (2 + (lunarMonth - 1)) % 12; // 順推月
  pos = (pos - shiChenIdx + 12) % 12;     // 逆推時
  return pos; // 命宮地支 index
}

function step1_twelveGong(mingGongIdx) {
  const gongs = {};
  for (let i = 0; i < 12; i++) {
    const zhiIdx = (mingGongIdx + i) % 12;
    gongs[DI_ZHI[zhiIdx]] = { name: GONG_NAMES[i], zhiIdx, stars: [], sihua: [], minor: [] };
  }
  return gongs;
}

// ===== 步驟二：身宮、來因宮 =====
function step2_shenGong(shiChenIdx, gongs) {
  const map = {0:0,6:0, 1:2,7:2, 2:4,8:4, 3:6,9:6, 4:8,10:8, 5:10,11:10}; // 時辰→宮職offset
  const offset = map[shiChenIdx];
  // 身宮重疊的宮職名
  return GONG_NAMES[offset];
}

function step2_laiYinGong(ganIdx) {
  const map = [10,9,8,7,6,5,4,3,2,11]; // 甲→戌,乙→酉,...癸→亥
  return DI_ZHI[map[ganIdx]];
}

// ===== 步驟三：安宮干 =====
function step3_gongGan(yearGanIdx) {
  // 五虎遁: 甲己→丙寅, 乙庚→戊寅, 丙辛→庚寅, 丁壬→壬寅, 戊癸→甲寅
  const yinGanMap = [2,4,6,8,0,2,4,6,8,0]; // 寅位天干 index
  const startGan = yinGanMap[yearGanIdx];
  const result = {};
  for (let i = 0; i < 12; i++) {
    const zhiIdx = (2 + i) % 12;
    result[DI_ZHI[zhiIdx]] = TIAN_GAN[(startGan + i) % 10];
  }
  return result;
}

// ===== 步驟四：定五行局 =====
function step4_wuXingJu(yearGan, mingGongZhi) {
  return WU_XING_JU[yearGan]?.[mingGongZhi] || 5;
}

// ===== 步驟五：安紫微十四主星 =====
function step5_mainStars(lunarDay, juNum) {
  // 紫微星位置查表 (簡化公式)
  // 商數 = (農曆日 - 1) / 局數，取整+1
  const quotient = Math.ceil(lunarDay / juNum);
  const remainder = lunarDay % juNum;

  // 紫微位置 = 寅位(2) + 商 - 1，但需考慮餘數修正
  let ziWeiPos;
  if (remainder === 0) {
    ziWeiPos = (2 + quotient - 1) % 12;
  } else {
    // 根據局數和餘數修正
    const basePos = (2 + quotient) % 12;
    // 奇數局順修正，偶數局逆修正
    if (juNum % 2 === 0) {
      ziWeiPos = (basePos + (juNum - remainder)) % 12;
    } else {
      ziWeiPos = (basePos - (juNum - remainder) + 12) % 12;
    }
  }

  // 紫微星系 (逆時針): 紫微, 天機, 空, 太陽, 武曲, 天同, 空, 空, 廉貞
  const ziWeiXi = {};
  const ziWeiStars = ["紫微","天機",null,"太陽","武曲","天同",null,null,"廉貞"];
  for (let i = 0; i < ziWeiStars.length; i++) {
    if (ziWeiStars[i]) {
      ziWeiXi[ziWeiStars[i]] = (ziWeiPos - i + 120) % 12;
    }
  }

  // 天府位置 (根據紫微位置對稱)
  // 天府 = (4 - ziWeiPos + 4 + 12) % 12 = (8 - ziWeiPos + 12) % 12
  // 簡化: 紫微+天府 永遠關於寅申線對稱
  const tianFuPos = (4 - (ziWeiPos - 4) + 12) % 12;

  // 天府星系 (順時針): 天府, 太陰, 貪狼, 巨門, 天相, 天梁, 七殺, 空, 空, 空, 破軍
  const tianFuXi = {};
  const tianFuStars = ["天府","太陰","貪狼","巨門","天相","天梁","七殺",null,null,null,"破軍"];
  for (let i = 0; i < tianFuStars.length; i++) {
    if (tianFuStars[i]) {
      tianFuXi[tianFuStars[i]] = (tianFuPos + i) % 12;
    }
  }

  return { ...ziWeiXi, ...tianFuXi };
}

// ===== 步驟六：生年干星曜 =====
function step6_yearGanStars(ganIdx) {
  // 祿存位置
  const luCunMap = [2,3,5,6,5,6,8,9,11,0]; // 甲→寅,乙→卯,...
  const luCun = luCunMap[ganIdx];
  const qingYang = (luCun + 1) % 12;
  const tuoLuo = (luCun - 1 + 12) % 12;

  // 天魁天鉞
  const tianKuiMap = [1,0,11,11,1,0,7,6,3,3]; // by 天干
  const tianYueMap = [7,6,9,9,7,6,1,2,5,5];

  return {
    "祿存": luCun, "擎羊": qingYang, "陀羅": tuoLuo,
    "天魁": tianKuiMap[ganIdx], "天鉞": tianYueMap[ganIdx],
  };
}

// ===== 步驟七：生月星曜 =====
function step7_monthStars(lunarMonth) {
  // 左輔: 辰位起正月順行
  const zuoFu = (4 + lunarMonth - 1) % 12;
  // 右弼: 戌位起正月逆行
  const youBi = (10 - (lunarMonth - 1) + 12) % 12;
  // 天刑: 酉位起正月順行
  const tianXing = (9 + lunarMonth - 1) % 12;
  // 天姚: 丑位起正月順行
  const tianYao = (1 + lunarMonth - 1) % 12;

  return { "左輔": zuoFu, "右弼": youBi, "天刑": tianXing, "天姚": tianYao };
}

// ===== 步驟八：生時星曜 =====
function step8_hourStars(shiChenIdx, yearZhiIdx) {
  // 文昌: 戌位起子時逆行
  const wenChang = (10 - shiChenIdx + 12) % 12;
  // 文曲: 辰位起子時順行
  const wenQu = (4 + shiChenIdx) % 12;
  // 地空: 亥位起子時逆行
  const diKong = (11 - shiChenIdx + 12) % 12;
  // 地劫: 亥位起子時順行
  const diJie = (11 + shiChenIdx) % 12;

  // 火星鈴星 (簡化: 依生年支分組)
  const huoGroup = [2,3,1,9]; // 寅午戌→丑, 申子辰→寅, 巳酉丑→卯, 亥卯未→酉 起點
  const lingGroup = [10,10,10,10]; // 都從戌起
  const groupIdx = [2,3,0,3,2,1,0,3,2,1,0,3]; // 年支→組別
  const g = groupIdx[yearZhiIdx];
  const huoStart = huoGroup[g];
  const huoXing = (huoStart + shiChenIdx) % 12;
  const lingXing = (lingGroup[g] + shiChenIdx) % 12;

  return { "文昌": wenChang, "文曲": wenQu, "地空": diKong, "地劫": diJie, "火星": huoXing, "鈴星": lingXing };
}

// ===== 步驟九：四化 =====
function step9_siHua(yearGan) {
  const [lu, quan, ke, ji] = SI_HUA[yearGan];
  return { [lu]: "化祿", [quan]: "化權", [ke]: "化科", [ji]: "化忌" };
}

// ===== 步驟十：大限 =====
function step10_daXian(mingGongIdx, juNum, isYangMale) {
  // isYangMale: 陽男/陰女=true (順行), 陰男/陽女=false (逆行)
  const direction = isYangMale ? 1 : -1;
  const startAge = juNum;
  const result = [];
  for (let i = 0; i < 12; i++) {
    const zhiIdx = (mingGongIdx + i * direction + 120) % 12;
    result.push({
      zhi: DI_ZHI[zhiIdx],
      startAge: startAge + i * 10,
      endAge: startAge + i * 10 + 9,
    });
  }
  return result;
}

// ===== 步驟十二：長生十二星 =====
function step12_changSheng(juNum, isYangMale) {
  const startMap = {2:8, 3:11, 4:5, 5:8, 6:2}; // 局→長生起點
  const start = startMap[juNum];
  const dir = isYangMale ? 1 : -1;
  const names = ["長生","沐浴","冠帶","臨官","帝旺","衰","病","死","墓","絕","胎","養"];
  const result = {};
  for (let i = 0; i < 12; i++) {
    const pos = (start + i * dir + 120) % 12;
    result[DI_ZHI[pos]] = names[i];
  }
  return result;
}

// ===== 主函數：完整排盤 =====
export function calculateChart(solarYear, solarMonth, solarDay, hour, minute, gender) {
  // 1. 農曆轉換
  const lunar = solarToLunar(solarYear, solarMonth, solarDay);
  const { gan: yearGan, zhi: yearZhi, ganIdx: yearGanIdx, zhiIdx: yearZhiIdx } = yearToGanZhi(lunar.year);
  const shiChenIdx = hourToShiChen(hour, minute);
  const isYang = yearGanIdx % 2 === 0; // 甲丙戊庚壬為陽
  const isMale = gender === "男";
  const isYangMale = (isYang && isMale) || (!isYang && !isMale); // 陽男陰女順行

  // 步驟一：命宮
  const mingGongIdx = step1_mingGong(lunar.month, shiChenIdx);
  const gongs = step1_twelveGong(mingGongIdx);

  // 步驟二：身宮、來因宮
  const shenGongName = step2_shenGong(shiChenIdx, gongs);
  const laiYinZhi = step2_laiYinGong(yearGanIdx);

  // 步驟三：宮干
  const gongGan = step3_gongGan(yearGanIdx);

  // 步驟四：五行局
  const mingGongZhi = DI_ZHI[mingGongIdx];
  const juNum = step4_wuXingJu(yearGan, mingGongZhi);

  // 步驟五：十四主星
  const mainStars = step5_mainStars(lunar.day, juNum);

  // 放入宮位
  for (const [star, pos] of Object.entries(mainStars)) {
    const zhi = DI_ZHI[pos];
    if (gongs[zhi]) gongs[zhi].stars.push(star);
  }

  // 步驟六：年干星
  const yearStars = step6_yearGanStars(yearGanIdx);
  for (const [star, pos] of Object.entries(yearStars)) {
    const zhi = DI_ZHI[pos];
    if (gongs[zhi]) gongs[zhi].minor.push(star);
  }

  // 步驟七：月星
  const monthStars = step7_monthStars(lunar.month);
  for (const [star, pos] of Object.entries(monthStars)) {
    const zhi = DI_ZHI[pos];
    if (gongs[zhi]) gongs[zhi].minor.push(star);
  }

  // 步驟八：時星
  const hourStars = step8_hourStars(shiChenIdx, yearZhiIdx);
  for (const [star, pos] of Object.entries(hourStars)) {
    const zhi = DI_ZHI[pos];
    if (gongs[zhi]) gongs[zhi].minor.push(star);
  }

  // 步驟九：四化
  const siHua = step9_siHua(yearGan);
  for (const [star, hua] of Object.entries(siHua)) {
    // 找星曜在哪個宮
    for (const zhi of Object.keys(gongs)) {
      if (gongs[zhi].stars.includes(star) || gongs[zhi].minor.includes(star)) {
        gongs[zhi].sihua.push(`${star}${hua}`);
      }
    }
  }

  // 步驟十：大限
  const daXian = step10_daXian(mingGongIdx, juNum, isYangMale);

  // 步驟十二：長生
  const changSheng = step12_changSheng(juNum, isYangMale);
  for (const zhi of Object.keys(gongs)) {
    if (changSheng[zhi]) gongs[zhi].changSheng = changSheng[zhi];
  }

  // 組裝結果
  return {
    // 基本資料
    basic: {
      solarDate: `${solarYear}年${solarMonth}月${solarDay}日`,
      lunarDate: `農曆${lunar.year}年${lunar.month}月${lunar.day}日`,
      yearGanZhi: `${yearGan}${yearZhi}`,
      shiChen: SHI_CHEN[shiChenIdx],
      gender,
      yinYang: isYang ? "陽" : "陰",
      mingGong: `${gongGan[mingGongZhi]}${mingGongZhi}`,
      mingGongZhi,
      shenGong: shenGongName,
      laiYinGong: laiYinZhi,
      wuXingJu: JU_NAME[juNum],
      juNum,
    },
    gongs,
    gongGan,
    daXian,
    siHua,
  };
}

// 格式化為文字 (給 Claude 分析用)
export function formatChart(chart) {
  const b = chart.basic;
  let text = `## 紫微斗數命盤\n\n`;
  text += `### 基本資料\n`;
  text += `- 陽曆：${b.solarDate}\n`;
  text += `- 農曆：${b.lunarDate}\n`;
  text += `- 年柱：${b.yearGanZhi}年\n`;
  text += `- 時辰：${b.shiChen}時\n`;
  text += `- 性別：${b.gender}（${b.yinYang}${b.gender === "男" ? "男" : "女"}）\n`;
  text += `- 命宮：${b.mingGong}（${b.mingGongZhi}宮）\n`;
  text += `- 身宮：${b.shenGong}\n`;
  text += `- 來因宮：${b.laiYinGong}宮\n`;
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
