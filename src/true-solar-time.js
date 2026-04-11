/**
 * 真太陽時計算模組 (True Solar Time)
 *
 * TST = (Birth_Time - DST_offset) + LC + EoT
 * - LC = (Lng_birth - Lng_meridian) × 4 min
 * - Lng_meridian = UTC_offset × 15
 * - EoT: NOAA approximate formula
 */

import { DateTime } from 'luxon';

// 時辰名稱
const SHI_CHEN = [
  { name: '子', branch: '子', start: 23, end: 1 },
  { name: '丑', branch: '丑', start: 1, end: 3 },
  { name: '寅', branch: '寅', start: 3, end: 5 },
  { name: '卯', branch: '卯', start: 5, end: 7 },
  { name: '辰', branch: '辰', start: 7, end: 9 },
  { name: '巳', branch: '巳', start: 9, end: 11 },
  { name: '午', branch: '午', start: 11, end: 13 },
  { name: '未', branch: '未', start: 13, end: 15 },
  { name: '申', branch: '申', start: 15, end: 17 },
  { name: '酉', branch: '酉', start: 17, end: 19 },
  { name: '戌', branch: '戌', start: 19, end: 21 },
  { name: '亥', branch: '亥', start: 21, end: 23 },
];

/**
 * 計算一年中的第幾天
 */
function getDayOfYear(year, month, day) {
  const dt = DateTime.local(year, month, day);
  return dt.ordinal;
}

/**
 * 計算均時差 (Equation of Time) — NOAA 近似公式
 * @returns {number} 分鐘
 */
function calculateEoT(year, month, day) {
  const doy = getDayOfYear(year, month, day);
  const B = (360 / 365) * (doy - 81);
  const Brad = B * Math.PI / 180;
  return 9.87 * Math.sin(2 * Brad) - 7.53 * Math.cos(Brad) - 1.5 * Math.sin(Brad);
}

/**
 * 計算真太陽時
 * @param {number} year - 出生年
 * @param {number} month - 出生月
 * @param {number} day - 出生日
 * @param {number} hour - 出生時 (0-23)
 * @param {number} minute - 出生分 (0-59)
 * @param {number} lng - 出生地經度 (東經正, 西經負)
 * @param {string} timezoneId - IANA timezone ID (e.g. "Asia/Tokyo")
 * @returns {object} { trueSolarTime, shichen, corrections, dateAdjusted, ... }
 */
export function calculateTrueSolarTime(year, month, day, hour, minute, lng, timezoneId) {
  // Step 1: 用 Luxon 取得該日期時間在該時區的資訊
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: timezoneId }
  );

  // DST 偏移: Luxon offset 包含 DST, 標準 offset 不包含
  // offset = 標準 + DST, 所以 DST_offset = offset - standard_offset
  const offsetMinutes = dt.offset; // 總偏移(含DST), 分鐘
  // 取同一時區的 1月1日 offset 作為標準偏移（冬令）
  const dtJan = DateTime.fromObject({ year, month: 1, day: 1 }, { zone: timezoneId });
  const dtJul = DateTime.fromObject({ year, month: 7, day: 1 }, { zone: timezoneId });
  const standardOffset = Math.min(dtJan.offset, dtJul.offset); // 標準偏移 = 較小的那個
  const dstOffset = offsetMinutes - standardOffset; // DST 偏移量(分鐘), 0 or 60

  // Step 2: 標準經線
  const standardMeridian = standardOffset / 60 * 15; // 度

  // Step 3: 經度修正 (LC)
  const lngCorrection = (lng - standardMeridian) * 4; // 分鐘

  // Step 4: 均時差 (EoT)
  const eot = calculateEoT(year, month, day);

  // Step 5: 總修正量
  const totalCorrection = lngCorrection + eot - dstOffset;

  // Step 6: 計算真太陽時
  const birthMinutes = hour * 60 + minute;
  let tstMinutes = birthMinutes + totalCorrection;

  // 處理跨日
  let dateOffset = 0;
  if (tstMinutes >= 1440) {
    tstMinutes -= 1440;
    dateOffset = 1;
  } else if (tstMinutes < 0) {
    tstMinutes += 1440;
    dateOffset = -1;
  }

  let tstHour = Math.floor(tstMinutes / 60);
  let tstMinute = Math.round(tstMinutes % 60);
  if (tstMinute >= 60) {
    tstMinute -= 60;
    tstHour += 1;
  }

  // Step 7: 時辰判定
  const shichen = getShichen(tstHour, tstMinute);

  // Step 8: 早子時/晚子時判定（影響日柱）
  const isEarlyZi = shichen.name === '子' && tstHour >= 23; // 早子時 23:00-00:00
  const isLateZi = shichen.name === '子' && tstHour < 1;    // 晚子時 00:00-01:00

  // Step 9: 邊界提示
  const nearBoundary = isNearShichenBoundary(tstHour, tstMinute, 5);

  // 調整後的日期
  const adjustedDate = DateTime.local(year, month, day).plus({ days: dateOffset });

  return {
    // 真太陽時結果
    trueSolarHour: tstHour,
    trueSolarMinute: tstMinute,
    trueSolarTimeStr: `${String(tstHour).padStart(2, '0')}:${String(tstMinute).padStart(2, '0')}`,

    // 時辰
    shichen: shichen.name,
    shichenIndex: SHI_CHEN.indexOf(shichen),

    // 日期調整
    dateOffset,
    adjustedYear: adjustedDate.year,
    adjustedMonth: adjustedDate.month,
    adjustedDay: adjustedDate.day,

    // 早晚子時
    isEarlyZi,
    isLateZi,

    // 邊界提示
    nearBoundary: nearBoundary ? nearBoundary : null,

    // 修正明細
    corrections: {
      isDST: dstOffset > 0,
      dstOffsetMin: dstOffset,
      standardOffset,
      standardMeridian,
      lngCorrection: Math.round(lngCorrection * 100) / 100,
      eot: Math.round(eot * 100) / 100,
      totalCorrection: Math.round(totalCorrection * 100) / 100,
    },

    // 原始輸入
    original: {
      hour, minute, lng, timezoneId,
      timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    },
  };
}

/**
 * 判斷時辰
 */
function getShichen(hour, minute = 0) {
  const totalMinutes = hour * 60 + minute;
  if (totalMinutes >= 23 * 60 || totalMinutes < 1 * 60) return SHI_CHEN[0]; // 子
  if (totalMinutes < 3 * 60) return SHI_CHEN[1];   // 丑
  if (totalMinutes < 5 * 60) return SHI_CHEN[2];   // 寅
  if (totalMinutes < 7 * 60) return SHI_CHEN[3];   // 卯
  if (totalMinutes < 9 * 60) return SHI_CHEN[4];   // 辰
  if (totalMinutes < 11 * 60) return SHI_CHEN[5];  // 巳
  if (totalMinutes < 13 * 60) return SHI_CHEN[6];  // 午
  if (totalMinutes < 15 * 60) return SHI_CHEN[7];  // 未
  if (totalMinutes < 17 * 60) return SHI_CHEN[8];  // 申
  if (totalMinutes < 19 * 60) return SHI_CHEN[9];  // 酉
  if (totalMinutes < 21 * 60) return SHI_CHEN[10]; // 戌
  return SHI_CHEN[11]; // 亥
}

/**
 * 檢查是否接近時辰邊界
 * @param {number} thresholdMinutes - 邊界閾值（分鐘）
 * @returns {object|null} { prevShichen, nextShichen } or null
 */
function isNearShichenBoundary(hour, minute, thresholdMinutes = 5) {
  const boundaries = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
  const totalMinutes = hour * 60 + minute;

  for (const bHour of boundaries) {
    const bMinutes = bHour * 60;
    const diff = Math.abs(totalMinutes - bMinutes);
    // 也檢查跨午夜 (23:00)
    const diffWrap = Math.abs(totalMinutes - (bMinutes + 1440));
    const diffWrap2 = Math.abs(totalMinutes + 1440 - bMinutes);
    const minDiff = Math.min(diff, diffWrap, diffWrap2);

    if (minDiff <= thresholdMinutes && minDiff > 0) {
      const prevShichen = getShichen(hour, minute);
      // 往另一邊看
      const otherMinutes = totalMinutes < bMinutes
        ? bMinutes + 1
        : bMinutes - 1;
      const otherH = Math.floor(((otherMinutes % 1440) + 1440) % 1440 / 60);
      const otherM = ((otherMinutes % 1440) + 1440) % 1440 % 60;
      const nextShichen = getShichen(otherH, otherM);

      if (prevShichen.name !== nextShichen.name) {
        return {
          message: `真太陽時距${nextShichen.name}時邊界僅${minDiff}分鐘，建議同時參考${prevShichen.name}時和${nextShichen.name}時`,
          current: prevShichen.name,
          adjacent: nextShichen.name,
          minutesFromBoundary: minDiff,
        };
      }
    }
  }
  return null;
}

/**
 * 格式化修正過程（Pro 版詳細顯示）
 */
export function formatCorrectionDetails(tst) {
  const c = tst.corrections;
  const lines = [
    `原始時間：${tst.original.timeStr} (${tst.original.timezoneId})`,
    `DST 狀態：${c.isDST ? '是（夏令時間，-' + c.dstOffsetMin + '分鐘）' : '否'}`,
    `標準經線：${c.standardMeridian}°（UTC${c.standardOffset >= 0 ? '+' : ''}${c.standardOffset / 60}）`,
    `經度修正：(${tst.original.lng} - ${c.standardMeridian}) × 4 = ${c.lngCorrection > 0 ? '+' : ''}${c.lngCorrection} 分鐘`,
    `均時差：${c.eot > 0 ? '+' : ''}${c.eot} 分鐘`,
    `總修正：${c.totalCorrection > 0 ? '+' : ''}${c.totalCorrection} 分鐘`,
    `真太陽時：${tst.trueSolarTimeStr}`,
    `對應時辰：${tst.shichen}時`,
  ];
  if (tst.dateOffset !== 0) {
    lines.push(`⚠️ 日期調整：${tst.dateOffset > 0 ? '+' : ''}${tst.dateOffset}天`);
  }
  if (tst.isEarlyZi) {
    lines.push(`⚠️ 早子時（23:00-00:00），日柱仍用當日`);
  }
  if (tst.nearBoundary) {
    lines.push(`⚠️ ${tst.nearBoundary.message}`);
  }
  return lines.join('\n');
}
