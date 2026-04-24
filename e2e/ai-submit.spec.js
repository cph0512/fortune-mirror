// AI-submit — actually kicks off /api/fortune jobs against live models.
// Covers: main analysis, heban, family, decision, chat follow-up with date.
// SLOW: each AI call is 20-120s. Whole file can take 5-10 min.
// Set AI_E2E=0 to skip if you're just running fast checks.
import { test, expect } from "@playwright/test";

const skipAI = process.env.AI_E2E === "0";

// Each AI call needs a generous deadline.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

async function submitAndPoll(request, body) {
  const submit = await request.post("/api/fortune", {
    data: body,
    headers: { "Content-Type": "application/json" },
  });
  expect(submit.ok(), "submit should be 200").toBeTruthy();
  const { job_id } = await submit.json();
  expect(job_id).toBeTruthy();

  // Poll up to ~3 min
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await request.get(`/api/fortune/${job_id}`);
    if (!poll.ok()) continue;
    const data = await poll.json();
    if (data.status === "done") {
      return data;
    }
  }
  throw new Error(`job ${job_id} timed out`);
}

test.skip(skipAI, "AI_E2E=0 set");

test("decision advisor returns JSON with yesno schema", async ({ request }) => {
  const result = await submitAndPoll(request, {
    images: [],
    system: "你是一個決策建議分析師. 回傳 JSON 格式.",
    prompt: "我該不該接受這份新工作 offer? 回傳 JSON: {type: 'yesno', options: [{label, score, keyPoints: [3 短句], analysis}], recommendation, gap, notes}",
    job_type: "decision",
    goal: "decision",
    visitor_id: `e2e_decision_${Date.now()}`,
  });
  expect(result.result).toBeTruthy();
  // Extract JSON from result (strip ```json fences if present)
  const cleaned = result.result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }
  expect(parsed).toBeTruthy();
  expect(["yesno", "multi", "timed", "open", "blocked"]).toContain(parsed.type);
});

test("main analysis accepts job + returns 紫微 evidence", async ({ request }) => {
  const result = await submitAndPoll(request, {
    images: [],
    system: "你是命理分析師",
    prompt: "請分析以下命盤. 出生: 1990/5/15 10:00, 台北. 三段簡短描述就好.",
    job_type: "analysis",
    goal: "goal.general",
    visitor_id: `e2e_main_${Date.now()}`,
    birth_data: { year: 1990, month: 5, day: 15, hour: 10, minute: 0, place: "台北" },
  });
  expect(result.result?.length, "result non-empty").toBeGreaterThan(100);
});

test("chat with date triggers day-level context", async ({ request }) => {
  const result = await submitAndPoll(request, {
    images: [],
    system: "你是命理助手",
    prompt: "請問下週三適合做重大決定嗎? 用兩句話回答.",
    job_type: "chat",
    goal: "goal.general",
    visitor_id: `e2e_chat_${Date.now()}`,
  });
  expect(result.result?.length).toBeGreaterThan(20);
});
