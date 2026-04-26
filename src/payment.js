// Payment API client. Sandbox-side endpoints live on /api/payment/* —
// the same Cloud Run service that handles /api/fortune. Pulls the public
// origin from API_BASE so test/lab/oai all work; prod points at the real
// fortune-api Cloud Run after deploy-prod.sh.

const API_PAYMENT_BASE = (() => {
  // API_BASE is hostname-aware: oai → oai backend, lab → lab, otherwise sandbox/prod.
  // Mirror that resolution here so a payment call always hits the same site.
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  if (host === "oai.destinytelling.life") return "https://oai.destinytelling.life";
  if (host === "lab.destinytelling.life") return "https://lab.destinytelling.life";
  return ""; // same-origin (relative) for prod + test
})();

function url(path) {
  return `${API_PAYMENT_BASE}${path}`;
}

export async function fetchPlans() {
  const res = await fetch(url("/api/payment/plans"));
  if (!res.ok) throw new Error(`plans HTTP ${res.status}`);
  const data = await res.json();
  return data.plans || {};
}

/**
 * Start checkout. Returns { order_id, checkout_url, provider, fallback_reason? }.
 * Redirect the browser to checkout_url.
 *
 * `invoice` shape:
 *   { invoice_type: "personal" | "company" | "donation" | "skip",
 *     tax_id, invoice_title, invoice_email, donation_code }
 */
export async function startCheckout({ planId, email, provider, invoice }) {
  const body = {
    plan_id: planId,
    email,
    provider: provider || "",
    ...(invoice || {}),
  };
  const res = await fetch(url("/api/payment/checkout"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `checkout HTTP ${res.status}`);
    err.field = data.field;
    throw err;
  }
  return data;
}

export async function fetchOrderStatus(orderId) {
  const res = await fetch(url(`/api/payment/status?order_id=${encodeURIComponent(orderId)}`));
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`status HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchHistory(email) {
  const res = await fetch(url(`/api/payment/history?email=${encodeURIComponent(email)}`));
  if (!res.ok) throw new Error(`history HTTP ${res.status}`);
  const data = await res.json();
  return data.orders || [];
}
