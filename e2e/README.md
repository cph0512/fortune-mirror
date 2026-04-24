# E2E tests (Playwright)

Smoke-level browser tests that exercise the **live** production sites
(test / lab / oai). Good for catching catastrophic frontend regressions
that slip past unit/contract tests — blank page, JS parse errors, bundle
drift, API outage.

## One-time setup

```bash
# From fortune-mirror/
npx playwright install chromium     # ~100MB, one time
```

## Running

```bash
# Default target is test.destinytelling.life
npx playwright test

# Point at another site
BASE_URL=https://lab.destinytelling.life npx playwright test
BASE_URL=https://oai.destinytelling.life npx playwright test

# Run a single spec
npx playwright test e2e/homepage.spec.js

# See HTML report
npx playwright show-report
```

## Writing more tests

Existing `homepage.spec.js` demonstrates the pattern. To cover
revenue-critical flows (see smoke checklist section B-F), add:

- `heban.spec.js` — fill the compatibility form, submit, assert the
  cross-sihua block surfaces in the prompt (via audit tool fetch).
- `family.spec.js` — build a 3-person family, run analysis, assert
  star names + 化X appear in the rendered result.
- `decision.spec.js` — open the decision modal from the home CTA,
  submit a yes/no question, assert the JSON schema renders a score
  card and options list.
- `chat.spec.js` — from a completed analysis, submit a follow-up
  question with a date ("下週三"), assert the response mentions the
  day-level overlay.

Each test file should:
1. Register or reuse a smoke account (don't pollute real user data).
2. Exercise ONE vertical flow end-to-end.
3. Assert on visible DOM AND on the HTTP contracts (use `request.get` /
   `request.post` for API-level checks).
4. Clean up saved data in `afterAll` hooks.

## CI / monitor integration

Not wired to CI yet. Easiest path later:
- Add a GitHub Action `.github/workflows/e2e.yml` that runs on pushes
  to `lab` and `main`.
- Add a post-deploy step in `~/auto-deploy.sh` to run the playwright
  suite once and TG-alert on failure (similar pattern to
  `scripts/monitor-sites.sh`).
