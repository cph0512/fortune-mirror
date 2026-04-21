/**
 * Smoke test for src/crosssihua.js
 *
 * Run: node test-crosssihua.mjs
 *
 * Two hardcoded birth inputs to avoid any test framework; verifies shape +
 * a couple of invariants on L1-L4 flights.
 */
import { calculateChart, getMonthlySihuaStars, getDailySihuaStars, getDecadalSihuaStarsAtOffset } from "./src/ziwei-calc.js";
import { calculateCrossSihua, __internals } from "./src/crosssihua.js";

const { DI_ZHI, HUA_ORDER } = __internals;

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

// Two synthetic birth profiles (arbitrary — only structure matters)
const chartA = calculateChart(1988, 5, 12, 14, 30, "男"); // A
const chartB = calculateChart(1990, 9, 23, 8, 15, "女");  // B

assert(!!chartA.siHua, "chartA has siHua");
assert(!!chartA.feiHua, "chartA has feiHua");
assert(!!chartA.horoscope, "chartA has horoscope");

// --- Baseline L1-L4 both directions ---
const res = calculateCrossSihua(chartA, chartB, { nameA: "阿明", nameB: "小美" });

assert(Array.isArray(res.flights.aToB), "aToB is array");
assert(Array.isArray(res.flights.bToA), "bToA is array");
assert(res.summary.includes("阿明"), "summary uses nameA");
assert(res.summary.includes("小美"), "summary uses nameB");
assert(res.summary.includes("交叉飛化"), "summary has headline");

// Every flight must have layer in L1-L4
const allFlights = [...res.flights.aToB, ...res.flights.bToA];
const validLayers = new Set(["L1", "L2", "L3", "L4"]);
const badLayer = allFlights.find(f => !validLayers.has(f.layer));
assert(!badLayer, `all flights within L1-L4 (found invalid: ${badLayer?.layer})`);

// Every flight must have a dst palace that ends in "宮"
const badPalace = allFlights.find(f => !f.toPalace || !f.toPalace.endsWith("宮"));
assert(!badPalace, `all flights have valid toPalace ending in 宮 (bad: ${JSON.stringify(badPalace)})`);

// Every flight must have hua in HUA_ORDER
const badHua = allFlights.find(f => !HUA_ORDER.includes(f.hua));
assert(!badHua, `all flights have valid hua (bad: ${JSON.stringify(badHua)})`);

// L1 count per side ≤ 4 (at most 4 生年四化)
const l1A = res.flights.aToB.filter(f => f.layer === "L1");
const l1B = res.flights.bToA.filter(f => f.layer === "L1");
assert(l1A.length <= 4, `L1 A→B ≤ 4 (got ${l1A.length})`);
assert(l1B.length <= 4, `L1 B→A ≤ 4 (got ${l1B.length})`);

// L3 and L4 count per side ≤ 4
for (const layer of ["L3", "L4"]) {
  const a = res.flights.aToB.filter(f => f.layer === layer);
  const b = res.flights.bToA.filter(f => f.layer === layer);
  assert(a.length <= 4, `${layer} A→B ≤ 4 (got ${a.length})`);
  assert(b.length <= 4, `${layer} B→A ≤ 4 (got ${b.length})`);
}

// L2 count per side: 12 palaces × 4 hua = 48 at most; minor stars may not map
for (const dir of ["aToB", "bToA"]) {
  const l2 = res.flights[dir].filter(f => f.layer === "L2");
  assert(l2.length <= 48, `L2 ${dir} ≤ 48 (got ${l2.length})`);
}

// --- Level toggles ---
const onlyL1 = calculateCrossSihua(chartA, chartB, { levels: ["natal"] });
assert(onlyL1.flights.aToB.every(f => f.layer === "L1"), "levels=natal only L1");
assert(onlyL1.flights.bToA.every(f => f.layer === "L1"), "levels=natal only L1 (reverse)");

const onlyL4 = calculateCrossSihua(chartA, chartB, { levels: ["yearly"] });
assert(onlyL4.flights.aToB.every(f => f.layer === "L4"), "levels=yearly only L4");

// --- L5/L6 via extras ---
const withMonthly = calculateCrossSihua(chartA, chartB, {
  levels: ["monthly"],
  monthlySihua: { a: ["太陽", "武曲", "天同", "天相"], b: ["太陰", "貪狼", "天梁", "巨門"] },
  monthlyLabel: "2026年5月",
});
const l5flights = withMonthly.flights.aToB.filter(f => f.layer === "L5");
assert(l5flights.length <= 4, `L5 A→B ≤ 4 (got ${l5flights.length})`);
assert(withMonthly.summary.includes("2026年5月"), "L5 summary includes label");

// --- Real L5/L6 via helpers (integration with ziwei-calc) ---
const mayStars = getMonthlySihuaStars(chartA, 5);
assert(Array.isArray(mayStars) && mayStars.length === 4, `getMonthlySihuaStars returns 4 stars (got ${mayStars?.length})`);
const junStars = getMonthlySihuaStars(chartA, 6);
assert(Array.isArray(junStars) && junStars.length === 4, `getMonthlySihuaStars month=6 returns 4 stars`);
assert(JSON.stringify(mayStars) !== JSON.stringify(junStars), `May vs June stars differ (五虎遁 works)`);

const dayStars = getDailySihuaStars(chartA, 2026, 5, 15);
assert(Array.isArray(dayStars) && dayStars.length === 4, `getDailySihuaStars returns 4 stars (got ${dayStars?.length})`);

const realL5 = calculateCrossSihua(chartA, chartB, {
  levels: ["natal", "palace", "decadal", "yearly", "monthly"],
  monthlySihua: {
    a: getMonthlySihuaStars(chartA, 6),
    b: getMonthlySihuaStars(chartB, 6),
  },
  monthlyLabel: "2026年6月",
  nameA: "阿明", nameB: "小美",
});
assert(realL5.summary.includes("2026年6月"), "real L5 helper summary has month label");
const realL5flights = [...realL5.flights.aToB, ...realL5.flights.bToA].filter(f => f.layer === "L5");
assert(realL5flights.length > 0, `real L5 produced flights (got ${realL5flights.length})`);

const realL6 = calculateCrossSihua(chartA, chartB, {
  levels: ["natal", "palace", "decadal", "yearly", "daily"],
  dailySihua: {
    a: getDailySihuaStars(chartA, 2026, 5, 15),
    b: getDailySihuaStars(chartB, 2026, 5, 15),
  },
  dailyLabel: "2026/5/15",
  nameA: "阿明", nameB: "小美",
});
assert(realL6.summary.includes("2026/5/15"), "real L6 helper summary has date label");
const l6flights = [...realL6.flights.aToB, ...realL6.flights.bToA].filter(f => f.layer === "L6");
assert(l6flights.length > 0, `real L6 produced flights (got ${l6flights.length})`);

// --- Past decadal (L3b) ---
const curDec = getDecadalSihuaStarsAtOffset(chartA, 0);
const prevDec = getDecadalSihuaStarsAtOffset(chartA, -1);
assert(curDec && Array.isArray(curDec.stars) && curDec.stars.length === 4, `getDecadalSihuaStarsAtOffset offset=0 returns 4 stars`);
assert(prevDec && Array.isArray(prevDec.stars) && prevDec.stars.length === 4, `getDecadalSihuaStarsAtOffset offset=-1 returns 4 stars (got ${prevDec?.stars?.length})`);
assert(curDec.gan !== prevDec.gan || curDec.zhi !== prevDec.zhi, `current vs previous decadal differ by gan/zhi`);

const realL3b = calculateCrossSihua(chartA, chartB, {
  levels: ["natal", "palace", "decadal", "pastDecadal", "yearly"],
  pastDecadalSihua: {
    a: getDecadalSihuaStarsAtOffset(chartA, -1)?.stars,
    b: getDecadalSihuaStarsAtOffset(chartB, -1)?.stars,
  },
  pastDecadalLabel: `上一大限`,
  nameA: "阿明", nameB: "小美",
});
const realL3bFlights = [...realL3b.flights.aToB, ...realL3b.flights.bToA].filter(f => f.layer === "L3b");
assert(realL3bFlights.length > 0, `L3b past decadal produced flights (got ${realL3bFlights.length})`);
assert(realL3b.summary.includes("上一大限"), "L3b summary has past-decadal heading");

console.log("\n--- Summary sample (L1-L4) ---");
console.log(res.summary.slice(0, 800));
console.log("\n...(truncated)\n");
console.log(`Total flights: A→B=${res.flights.aToB.length}, B→A=${res.flights.bToA.length}`);
console.log(`L5 flights (both dir): ${realL5flights.length}`);
console.log(`L6 flights (both dir): ${l6flights.length}`);
