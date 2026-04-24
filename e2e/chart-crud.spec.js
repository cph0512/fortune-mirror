// Chart CRUD — save / load / delete. Exercises the #7 oai proxy
// DELETE-body regression and the Bearer auth path added by #1.
import { test, expect } from "@playwright/test";

const ts = Date.now();
const userEmail = `e2e_chart_${ts}@test.local`;
const password = "e2epw" + ts;
let token;
let chartId;

test.beforeAll(async ({ request }) => {
  const reg = await request.post("/api/fortune-register", {
    data: { username: userEmail, password, name: "E2E Chart" },
  });
  token = (await reg.json()).token;
});

// Response shapes differ per backend:
//   sandbox: {ok, chart: {id, ...}}, list is {ok, charts: [...]}
//   scheduler: depends — normalize by looking for id in common places.
function extractChartId(body) {
  return body?.chart?.id || body?.chart_id || body?.id || null;
}
function extractCharts(body) {
  if (Array.isArray(body)) return body;
  return body?.charts || [];
}

test("save chart", async ({ request }) => {
  const res = await request.post("/api/fortune-charts", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      user: userEmail,
      chart: {
        name: "E2E test chart",
        birthData: { year: 1990, month: 5, day: 15, hour: 10, minute: 0, place: "Taipei" },
      },
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  chartId = extractChartId(body);
  expect(chartId, `id missing in save response: ${JSON.stringify(body).slice(0, 200)}`).toBeTruthy();
});

test("load charts contains new one", async ({ request }) => {
  const res = await request.get(`/api/fortune-charts?user=${encodeURIComponent(userEmail)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  const charts = extractCharts(await res.json());
  expect(charts.length, `no charts returned`).toBeGreaterThan(0);
  const found = charts.find((c) => (c.id || c.chart_id) === chartId);
  expect(found, `saved chart ${chartId} not in list`).toBeTruthy();
});

test("delete chart (DELETE with body)", async ({ request }) => {
  const res = await request.delete("/api/fortune-charts", {
    headers: { Authorization: `Bearer ${token}` },
    data: { user: userEmail, id: chartId },
  });
  expect(res.ok(), `delete status ${res.status()}`).toBeTruthy();
});

test("chart gone after delete", async ({ request }) => {
  const res = await request.get(`/api/fortune-charts?user=${encodeURIComponent(userEmail)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const charts = extractCharts(await res.json());
  const remaining = charts.find((c) => (c.id || c.chart_id) === chartId);
  expect(remaining).toBeFalsy();
});
