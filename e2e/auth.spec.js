// Auth flow — register → login → session save/load → logout.
// Fast (no AI). Verifies the #1 Bearer-token contract, the #3 session
// auth path, and the #6 contract regressions (logout / session).
import { test, expect } from "@playwright/test";

const ts = Date.now();
const userEmail = `e2e_auth_${ts}@test.local`;
const password = "e2epw" + ts;
let token = null;

test("register returns token + user shape", async ({ request }) => {
  const res = await request.post("/api/fortune-register", {
    data: { username: userEmail, password, name: "E2E Auth" },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  // Common contract across sandbox (test) and scheduler (lab/oai):
  //   username + name + non-empty token. Token format differs per site
  //   (sandbox = base64, scheduler = hex), so we only assert non-empty.
  expect(body).toHaveProperty("username", userEmail);
  expect(body).toHaveProperty("name");
  expect(body.token, "token required in register response").toBeTruthy();
  expect(body.token.length).toBeGreaterThanOrEqual(32);
  token = body.token;
});

test("login returns token for existing user", async ({ request }) => {
  const res = await request.post("/api/fortune-login", {
    data: { username: userEmail, password },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.token, "login must include token").toBeTruthy();
  expect(body.token.length).toBeGreaterThanOrEqual(32);
  token = body.token;
});

test("session save + load with Bearer", async ({ request }) => {
  expect(token, "token from login must exist").toBeTruthy();
  const saveRes = await request.post("/api/fortune-session", {
    headers: { Authorization: `Bearer ${token}` },
    data: { user: userEmail, session: { _lang: "en", goal: "goal.career" } },
  });
  expect(saveRes.ok()).toBeTruthy();

  const loadRes = await request.get(`/api/fortune-session?user=${encodeURIComponent(userEmail)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(loadRes.ok()).toBeTruthy();
  const loaded = await loadRes.json();
  expect(loaded._lang).toBe("en");
  expect(loaded.goal).toBe("goal.career");
});

test("logout 200", async ({ request }) => {
  const res = await request.post("/api/fortune-logout", {
    headers: { Authorization: `Bearer ${token || ""}` },
    data: {},
  });
  expect(res.status()).toBe(200);
});
