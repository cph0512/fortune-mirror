/**
 * 合盤三種 sub-mode 的 smoke 驗證
 * 模擬 WizardApp 的 heban handler: 根據 hebanMode 組 levels + extras,
 * 印出 crosssihua 產生的 summary. 方便肉眼檢查 AI 收到的飛化區塊長什麼樣
 * (basic 只有 L1-L4 / monthly 多 L5 / timed 多 L6).
 *
 * Run: node test-heban-modes.mjs
 */
import { calculateChart, getMonthlySihuaStars, getDailySihuaStars } from "./src/ziwei-calc.js";
import { calculateCrossSihua } from "./src/crosssihua.js";

const A = calculateChart(1988, 5, 12, 14, 30, "男");
const B = calculateChart(1990, 9, 23, 8, 15, "女");

function buildHebanOptsLikeHandler(mode, { targetMonth, targetDay }) {
  const base = { levels: ["natal", "palace", "decadal", "yearly"], nameA: "阿明", nameB: "小美" };
  const currentYear = new Date().getFullYear();
  if (mode === "monthly") {
    const aSt = getMonthlySihuaStars(A, targetMonth);
    const bSt = getMonthlySihuaStars(B, targetMonth);
    if (aSt && bSt) {
      base.levels = [...base.levels, "monthly"];
      base.monthlySihua = { a: aSt, b: bSt };
      base.monthlyLabel = `${currentYear}年${targetMonth}月`;
    }
  } else if (mode === "timed") {
    const aSt = getDailySihuaStars(A, currentYear, targetMonth, targetDay);
    const bSt = getDailySihuaStars(B, currentYear, targetMonth, targetDay);
    if (aSt && bSt) {
      base.levels = [...base.levels, "daily"];
      base.dailySihua = { a: aSt, b: bSt };
      base.dailyLabel = `${currentYear}/${targetMonth}/${targetDay}`;
    }
  }
  return base;
}

function summarize(mode, opts) {
  const cross = calculateCrossSihua(A, B, opts);
  const l5 = [...cross.flights.aToB, ...cross.flights.bToA].filter(f => f.layer === "L5").length;
  const l6 = [...cross.flights.aToB, ...cross.flights.bToA].filter(f => f.layer === "L6").length;
  const total = cross.flights.aToB.length + cross.flights.bToA.length;
  console.log(`\n═══ mode=${mode} ═══`);
  console.log(`levels: ${opts.levels.join(", ")}`);
  console.log(`flights total: ${total} (L5=${l5}, L6=${l6})`);
  console.log(`summary head: ${cross.summary.split("\n").slice(0, 4).join("\n")}`);
  console.log(`summary bytes: ${cross.summary.length}`);
  return { l5, l6, total };
}

const basic = summarize("basic", buildHebanOptsLikeHandler("basic", {}));
const monthly = summarize("monthly", buildHebanOptsLikeHandler("monthly", { targetMonth: 6 }));
const timed = summarize("timed", buildHebanOptsLikeHandler("timed", { targetMonth: 6, targetDay: 15 }));

console.log("\n═══ assertions ═══");
const asserts = [
  ["basic has 0 L5 + 0 L6", basic.l5 === 0 && basic.l6 === 0],
  ["monthly adds L5 (>0)", monthly.l5 > 0],
  ["monthly still no L6", monthly.l6 === 0],
  ["timed adds L6 (>0)", timed.l6 > 0],
  ["timed still no L5", timed.l5 === 0],
  ["monthly total > basic total", monthly.total > basic.total],
  ["timed total > basic total", timed.total > basic.total],
];
let pass = 0, fail = 0;
for (const [label, ok] of asserts) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (ok) pass++; else fail++;
}
console.log(`\n${pass} passed / ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
