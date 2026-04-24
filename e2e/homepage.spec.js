// Homepage smoke — verifies the site loads, bundle is fresh,
// and the wizard root mounts. Acts as a canary for any catastrophic
// frontend regression (blank page, JS parse error, missing root).
import { test, expect } from "@playwright/test";

test("homepage loads and wizard mounts", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const res = await page.goto("/");
  expect(res?.status()).toBe(200);

  // Wait for React root to actually populate
  const root = page.locator("#wizard-root");
  await expect(root).toBeVisible();
  // Some child element should appear (welcome header, horoscope block, etc.)
  await expect(root.locator("*").first()).toBeVisible({ timeout: 10_000 });

  // Bundle hash sanity
  const html = await page.content();
  expect(html).toMatch(/main-[a-zA-Z0-9_-]+\.js/);

  // No JS-level page errors
  expect(errors, `page errors: ${JSON.stringify(errors)}`).toEqual([]);
});

test("backend /api/fortune responds (not 5xx)", async ({ request }) => {
  const res = await request.post("/api/fortune", {
    data: {},
    headers: { "Content-Type": "application/json" },
  });
  // 200 (queued) / 400 (missing fields) / 401 (auth) all acceptable.
  // 5xx indicates backend outage.
  expect(res.status()).toBeLessThan(500);
});

test("bundle hash matches across sites", async ({ request }) => {
  const sites = ["test", "lab", "oai"];
  const hashes = [];
  for (const s of sites) {
    const res = await request.get(`https://${s}.destinytelling.life/`);
    const body = await res.text();
    const m = body.match(/main-[a-zA-Z0-9_-]+\.js/);
    hashes.push({ site: s, hash: m?.[0] || null });
  }
  const uniq = new Set(hashes.map((h) => h.hash));
  expect(uniq.size, `sites out of sync: ${JSON.stringify(hashes)}`).toBe(1);
});
