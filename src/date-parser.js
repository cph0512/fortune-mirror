/**
 * parseQuestionDateTime — extract a date from a natural-language question.
 *
 * Returns `{ year, month, day, hour, minute, dayExplicit }` or null.
 *
 * Options:
 *   - bumpPastToFuture (default true) — auto-shifts past bare dates to the
 *     next occurrence. Original behavior serves the decision advisor (擇吉
 *     must be future). Follow-up chat passes `false` so "上個月" or "4/6"
 *     asked in May stays in the past.
 *   - now (default new Date()) — injectable for deterministic tests.
 *
 * `dayExplicit` distinguishes day-level questions (user named a specific
 * day → fine to trigger L6 流日 overlay) from month-only phrasing (day=1
 * is a placeholder → caller should stick with transitOverlay's 12-month
 * context, not per-day analysis).
 */
export function parseQuestionDateTime(question, opts = {}) {
  const { bumpPastToFuture = true, now = new Date() } = opts;
  if (!question) return null;
  const todayY = now.getFullYear(), todayM = now.getMonth() + 1, todayD = now.getDate();
  let y = null, m = null, d = null;
  let dayExplicit = false;

  // 1. 相對日期 (zh/en/ja)
  const relMap = [
    [/(大大後天|大後天)/, 3],
    [/(後天|後日|the day after tomorrow)/i, 2],
    [/(明天|明日|tomorrow)/i, 1],
    [/(今天|今日|today)/i, 0],
    [/(昨天|昨日|yesterday)/i, -1],
  ];
  for (const [rx, delta] of relMap) {
    if (rx.test(question)) {
      const target = new Date(todayY, todayM - 1, todayD + delta);
      y = target.getFullYear(); m = target.getMonth() + 1; d = target.getDate();
      dayExplicit = true;
      break;
    }
  }

  // 2. 週 X / 下週 X / 下星期 X / next <weekday>
  if (!y) {
    const weekMap = { "日": 0, "天": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6,
      "sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6,
      "日曜": 0, "月曜": 1, "火曜": 2, "水曜": 3, "木曜": 4, "金曜": 5, "土曜": 6 };
    const wx = question.match(/(下|下個|next)?\s*(週|禮拜|星期|week)\s*([日天一二三四五六])/) ||
               question.match(/next\s+(sun|mon|tue|wed|thu|fri|sat)/i) ||
               question.match(/(下|下個)?\s*(日|月|火|水|木|金|土)曜日?/);
    if (wx) {
      const dayKey = (wx[3] || wx[1] || wx[2] || "").toLowerCase();
      const targetDow = weekMap[dayKey];
      if (targetDow !== undefined) {
        const curDow = now.getDay();
        let delta = (targetDow - curDow + 7) % 7;
        if (delta === 0) delta = 7; // 同一天的「下週X」= 下週
        const wantNext = /下|next/.test(question);
        if (wantNext && delta < 7) delta += 7;
        const target = new Date(todayY, todayM - 1, todayD + delta);
        y = target.getFullYear(); m = target.getMonth() + 1; d = target.getDate();
        dayExplicit = true;
      }
    }
  }

  // 3. 下個月 X 號
  if (!y) {
    const nm = question.match(/下個?月\s*(\d{1,2})\s*[號日]?/);
    if (nm) {
      const target = new Date(todayY, todayM, parseInt(nm[1], 10));
      y = target.getFullYear(); m = target.getMonth() + 1; d = target.getDate();
      dayExplicit = true;
    }
  }

  // 4. 具體日期 N/M, N月M日
  if (!y) {
    const mdMatch = question.match(/(\d{1,2})\s*[\/月\-]\s*(\d{1,2})\s*日?/);
    if (mdMatch) {
      const mm = parseInt(mdMatch[1], 10);
      const dd = parseInt(mdMatch[2], 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        y = todayY; m = mm; d = dd;
        dayExplicit = true;
        if (bumpPastToFuture) {
          const candidate = new Date(y, m - 1, d);
          if (candidate.getTime() < now.getTime() - 24 * 3600 * 1000) y++;
        }
      }
    }
  }

  // 5. 中文月份：「七月」「8 月份」「明年三月」
  if (!y) {
    const cnMonths = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6,
                      "七": 7, "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12 };
    const cnMatch = question.match(/(?:(\d{4})\s*年|(明|今|去)\s*年)?\s*(十一|十二|十|[一二三四五六七八九]|\d{1,2})\s*月\s*份?\s*(?:(\d{1,2})\s*[號日])?/);
    if (cnMatch) {
      const [, yearStr, relYear, monthStr, dayStr] = cnMatch;
      const mm = cnMonths[monthStr] ?? parseInt(monthStr, 10);
      if (mm >= 1 && mm <= 12) {
        let year = todayY;
        if (yearStr) year = parseInt(yearStr, 10);
        else if (relYear === "明") year = todayY + 1;
        else if (relYear === "去") year = todayY - 1;
        const dd = dayStr ? parseInt(dayStr, 10) : 1;
        if (dd >= 1 && dd <= 31) {
          y = year; m = mm; d = dd;
          dayExplicit = !!dayStr;
          if (!yearStr && !relYear && bumpPastToFuture) {
            const candidate = new Date(y, m - 1, d);
            if (candidate.getTime() < now.getTime() - 24 * 3600 * 1000) y++;
          }
        }
      }
    }
  }

  if (!y) return null;

  // 6. 時間解析 (optional — 流時)
  let hour = null, minute = null;
  const timeMatch = question.match(/(下午|晚上|晚|上午|早上|afternoon|evening|morning|pm|am)?\s*(\d{1,2})\s*[點:時]\s*(\d{1,2})?/i);
  if (timeMatch) {
    hour = parseInt(timeMatch[2], 10);
    minute = parseInt(timeMatch[3] || "0", 10) || 0;
    const period = (timeMatch[1] || "").toLowerCase();
    if ((period.includes("下午") || period.includes("晚") || period.includes("afternoon") || period.includes("evening") || period === "pm") && hour < 12) hour += 12;
  }
  if (hour === null) {
    const clockMatch = question.match(/(\d{1,2}):(\d{2})/);
    if (clockMatch) {
      hour = parseInt(clockMatch[1], 10);
      minute = parseInt(clockMatch[2], 10);
    }
  }
  return { year: y, month: m, day: d, hour, minute, dayExplicit };
}
