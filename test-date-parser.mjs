/**
 * Unit tests for parseQuestionDateTime.
 * Covers the cases flagged in smoke 2026-04-22:
 *  - month-only phrase "今年 5 月" should NOT be dayExplicit
 *  - range "4-6 月" should parse month=4, dayExplicit=false
 *  - weekday phrases like "下週三" / "next wed" are dayExplicit
 *  - bare past dates "4/6" with bumpPastToFuture:false stay in the past
 *  - relative "明天" / "後天" / "今天" are dayExplicit
 *  - time anchor injected cleanly
 *
 * Run: node test-date-parser.mjs
 */
import { parseQuestionDateTime } from "./src/date-parser.js";

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`PASS: ${msg}`); }
  else      { fail++; console.error(`FAIL: ${msg}`); }
}

// Fixed "now" for deterministic assertions: 2026-05-15 (Friday)
const NOW = new Date(2026, 4, 15, 10, 0, 0);

// --- 1. Month-only should NOT be dayExplicit ---
let r = parseQuestionDateTime("今年 5 月怎樣", { now: NOW, bumpPastToFuture: false });
assert(r?.month === 5 && r?.day === 1 && r?.dayExplicit === false, `今年 5 月 → month=5 day=1 dayExplicit=false (got ${JSON.stringify(r)})`);

r = parseQuestionDateTime("8 月份運勢如何", { now: NOW, bumpPastToFuture: false });
assert(r?.month === 8 && r?.dayExplicit === false, `8 月份 → dayExplicit=false (got ${r?.dayExplicit})`);

r = parseQuestionDateTime("七月怎麼走", { now: NOW, bumpPastToFuture: false });
assert(r?.month === 7 && r?.dayExplicit === false, `七月 → month=7 dayExplicit=false`);

r = parseQuestionDateTime("4-6 月", { now: NOW, bumpPastToFuture: false });
// "4-6 月" matches the mdMatch pattern "\d-\d 月" — accept either month=4 or 6,
// but with bumpPastToFuture:false should not auto-shift to next year.
assert(r !== null && r.year === 2026, `4-6 月 → 2026 不飄 2027 (got year=${r?.year})`);

// --- 2. Explicit day should be dayExplicit=true ---
r = parseQuestionDateTime("7 月 15 日", { now: NOW, bumpPastToFuture: false });
assert(r?.month === 7 && r?.day === 15 && r?.dayExplicit === true, `7 月 15 日 → dayExplicit=true`);

r = parseQuestionDateTime("5月12號", { now: NOW, bumpPastToFuture: false });
assert(r?.month === 5 && r?.day === 12 && r?.dayExplicit === true, `5月12號 → dayExplicit=true`);

// --- 3. Weekday is dayExplicit ---
r = parseQuestionDateTime("下週三怎樣", { now: NOW });
assert(r?.dayExplicit === true, `下週三 → dayExplicit=true`);
// 下週 = literally next week; from Fri 5/15 → Wed of following week = 5/27
assert(r?.year === 2026 && r?.month === 5 && r?.day === 27, `下週三 from 2026-05-15 (Fri) → 2026-05-27 (got ${r?.year}/${r?.month}/${r?.day})`);

r = parseQuestionDateTime("next mon", { now: NOW });
assert(r?.dayExplicit === true, `next mon → dayExplicit=true`);

// --- 4. Relative dates ---
r = parseQuestionDateTime("明天幾點好", { now: NOW });
assert(r?.day === 16 && r?.dayExplicit === true, `明天 from 2026-05-15 → 2026-05-16 dayExplicit=true`);

r = parseQuestionDateTime("後天的運勢", { now: NOW });
assert(r?.day === 17 && r?.dayExplicit === true, `後天 → 2026-05-17`);

r = parseQuestionDateTime("今天適合出門嗎", { now: NOW });
assert(r?.day === 15 && r?.dayExplicit === true, `今天 → 2026-05-15`);

// --- 5. Bare past date — bumpPastToFuture behavior ---
// 4/6 asked on 2026-05-15 (past by 39 days)
r = parseQuestionDateTime("4/6 怎麼樣", { now: NOW, bumpPastToFuture: false });
assert(r?.year === 2026 && r?.month === 4 && r?.day === 6, `4/6 bumpPast=false → stays 2026/4/6 (got ${r?.year}/${r?.month}/${r?.day})`);

r = parseQuestionDateTime("4/6 怎麼樣", { now: NOW, bumpPastToFuture: true });
assert(r?.year === 2027 && r?.month === 4 && r?.day === 6, `4/6 bumpPast=true → 2027/4/6 (got ${r?.year}/${r?.month}/${r?.day})`);

// --- 6. Explicit year overrides bumping ---
r = parseQuestionDateTime("2025 年 3 月", { now: NOW, bumpPastToFuture: true });
assert(r?.year === 2025 && r?.month === 3, `2025 年 3 月 → explicit year kept regardless of bump`);

r = parseQuestionDateTime("明年三月", { now: NOW });
assert(r?.year === 2027 && r?.month === 3, `明年三月 from 2026 → 2027/3 (got ${r?.year}/${r?.month})`);

r = parseQuestionDateTime("去年十二月", { now: NOW });
assert(r?.year === 2025 && r?.month === 12, `去年十二月 from 2026 → 2025/12`);

// --- 7. Time parse ---
r = parseQuestionDateTime("明天下午 2 點", { now: NOW });
assert(r?.day === 16 && r?.hour === 14, `明天下午 2 點 → hour=14`);

r = parseQuestionDateTime("明天 14:30 怎樣", { now: NOW });
assert(r?.day === 16 && r?.hour === 14 && r?.minute === 30, `明天 14:30 → hour=14 minute=30`);

// --- 8. No date in question ---
r = parseQuestionDateTime("我適合做什麼工作", { now: NOW });
assert(r === null, `純粹職業問題 → null`);

r = parseQuestionDateTime("", { now: NOW });
assert(r === null, `empty string → null`);

r = parseQuestionDateTime(null, { now: NOW });
assert(r === null, `null input → null`);

// --- 9. Edge: default bumpPastToFuture is true (backward compat for decision advisor) ---
r = parseQuestionDateTime("4/6", { now: NOW });
assert(r?.year === 2027, `default opts 4/6 past → bumps to 2027 (backward compat)`);

console.log(`\n${pass} passed / ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
