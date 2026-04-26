// Self-contained payment flow.
//
// Modes (single component, switches on internal state):
//   "pricing"   — list plans, click one to start
//   "invoice"   — invoice/tax form + provider choice; submit calls /checkout
//   "redirect"  — momentary "redirecting to OEN..." screen
//   "receipt"   — post-success page; polls /status until paid, shows entitlement
//   "history"   — past orders for the logged-in user
//
// Wire-up: render <PaymentFlow user={wizardUser} onClose={...} /> from wherever
// you want the upgrade entry point. `user` only needs `.email` to be useful.
//
// Keeps style aligned with existing wizard-* classes; doesn't pull in extra UI deps.

import { useEffect, useMemo, useState } from "react";
import { fetchPlans, startCheckout, fetchOrderStatus, fetchHistory } from "./payment.js";

const INVOICE_TYPES = [
  { key: "personal", label: "個人 (二聯式)" },
  { key: "company",  label: "公司戶 (三聯式 + 統編)" },
  { key: "donation", label: "捐贈發票 (愛心碼)" },
  { key: "skip",     label: "不開立發票" },
];

const PROVIDER_LABEL = {
  oen:    "OEN 金流",
  stripe: "Stripe (信用卡)",
  mock:   "Mock 模式",
};

function fmtTWD(n) {
  return `NT$ ${Number(n || 0).toLocaleString()}`;
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("zh-TW", { hour12: false });
}

export default function PaymentFlow({ user, onClose }) {
  const [mode, setMode] = useState("pricing");
  const [plans, setPlans] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Pricing → invoice
  const [selectedPlan, setSelectedPlan] = useState(null);
  // Invoice form state
  const [invoice, setInvoice] = useState({
    invoice_type: "personal",
    tax_id: "",
    invoice_title: "",
    invoice_email: user?.email || "",
    donation_code: "",
  });
  const [providerChoice, setProviderChoice] = useState(""); // "" auto / "oen" / "stripe"

  // Receipt state
  const [orderId, setOrderId] = useState("");
  const [receipt, setReceipt] = useState(null);

  // History state
  const [history, setHistory] = useState([]);

  // Detect ?payment=success&order=... on first mount so a returning user sees
  // their receipt automatically.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const paymentFlag = sp.get("payment");
    const ord = sp.get("order");
    if (paymentFlag === "success" && ord) {
      setOrderId(ord);
      setMode("receipt");
    }
  }, []);

  // Load plans the first time we hit pricing mode
  useEffect(() => {
    if (mode !== "pricing" || Object.keys(plans).length) return;
    fetchPlans().then(setPlans).catch((e) => setError(`無法載入方案：${e.message}`));
  }, [mode, plans]);

  // Receipt poll loop
  useEffect(() => {
    if (mode !== "receipt" || !orderId) return;
    let stop = false;
    let timer = null;
    const tick = async () => {
      try {
        const r = await fetchOrderStatus(orderId);
        if (stop) return;
        setReceipt(r);
        if (r && (r.status === "paid" || r.status === "failed" || r.status === "cancelled")) return;
      } catch (e) {
        if (!stop) setError(`查詢訂單失敗：${e.message}`);
      }
      if (!stop) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [mode, orderId]);

  // History fetch
  useEffect(() => {
    if (mode !== "history" || !user?.email) return;
    fetchHistory(user.email).then(setHistory).catch((e) => setError(`歷史紀錄載入失敗：${e.message}`));
  }, [mode, user?.email]);

  const planList = useMemo(
    () => Object.entries(plans).map(([id, p]) => ({ id, ...p })),
    [plans],
  );

  function startPlan(plan) {
    setSelectedPlan(plan);
    setError("");
    // Default invoice email to wizardUser.email for convenience
    setInvoice((iv) => ({ ...iv, invoice_email: user?.email || iv.invoice_email }));
    setMode("invoice");
  }

  async function handleSubmitInvoice() {
    if (!user?.email) {
      setError("請先登入再付款");
      return;
    }
    if (invoice.invoice_type === "company") {
      if (!/^\d{8}$/.test(invoice.tax_id)) { setError("統編必須是 8 碼數字"); return; }
      if (!invoice.invoice_title.trim()) { setError("請填公司抬頭"); return; }
    }
    if (invoice.invoice_type === "donation") {
      if (!/^\d+$/.test(invoice.donation_code)) { setError("愛心碼必須是數字"); return; }
    }

    setBusy(true);
    setError("");
    try {
      const res = await startCheckout({
        planId: selectedPlan.id,
        email: user.email,
        provider: providerChoice,
        invoice,
      });
      setOrderId(res.order_id);
      // For mock mode the URL is relative; for real providers it's external.
      // Either way: send the browser there.
      setMode("redirect");
      setTimeout(() => {
        window.location.href = res.checkout_url;
      }, 800);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="payment-flow" style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>{
          mode === "pricing" ? "選擇方案"
          : mode === "invoice" ? `${selectedPlan?.name || ""} — 結帳`
          : mode === "redirect" ? "前往付款..."
          : mode === "receipt" ? "訂單明細"
          : mode === "history" ? "我的訂單"
          : "付款"
        }</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {user?.email && mode !== "history" && (
            <button onClick={() => setMode("history")} style={btnGhost}>歷史訂單</button>
          )}
          {mode !== "pricing" && mode !== "redirect" && (
            <button onClick={() => { setMode("pricing"); setError(""); }} style={btnGhost}>方案列表</button>
          )}
          {onClose && <button onClick={onClose} style={btnGhost}>✕</button>}
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 16, background: "#fee2e2", color: "#991b1b", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {mode === "pricing" && (
        <div style={{ display: "grid", gap: 12 }}>
          {planList.length === 0 && <div>載入方案中...</div>}
          {planList.map((p) => (
            <button key={p.id} onClick={() => startPlan(p)}
              style={{
                textAlign: "left", padding: 18, borderRadius: 12,
                border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer",
              }}>
              <div style={{ fontSize: "1.1em", fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
              <div style={{ color: "#6b7280", fontSize: "0.9em", marginBottom: 6 }}>{p.feature === "all" ? "解鎖全部" : `解鎖 ${p.feature}`}</div>
              <div style={{ fontSize: "1.2em", fontWeight: 700, color: "#0f766e" }}>{fmtTWD(p.price)}</div>
            </button>
          ))}
        </div>
      )}

      {mode === "invoice" && selectedPlan && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ padding: 14, background: "#f9fafb", borderRadius: 8 }}>
            <div style={{ fontSize: "0.9em", color: "#6b7280" }}>方案</div>
            <div style={{ fontSize: "1.1em", fontWeight: 600 }}>{selectedPlan.name}</div>
            <div style={{ fontSize: "1.4em", fontWeight: 700, color: "#0f766e", marginTop: 4 }}>{fmtTWD(selectedPlan.price)}</div>
          </div>

          <div>
            <label style={lbl}>發票類型</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {INVOICE_TYPES.map((t) => (
                <button key={t.key}
                  type="button"
                  onClick={() => setInvoice({ ...invoice, invoice_type: t.key })}
                  style={{
                    ...chipStyle,
                    background: invoice.invoice_type === t.key ? "#0f766e" : "#fff",
                    color: invoice.invoice_type === t.key ? "#fff" : "#374151",
                    borderColor: invoice.invoice_type === t.key ? "#0f766e" : "#d1d5db",
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {invoice.invoice_type === "company" && (
            <>
              <div>
                <label style={lbl}>統一編號 (8 碼)</label>
                <input style={inputStyle} maxLength={8} pattern="\d{8}"
                  value={invoice.tax_id}
                  onChange={(e) => setInvoice({ ...invoice, tax_id: e.target.value.replace(/\D/g, "").slice(0, 8) })} />
              </div>
              <div>
                <label style={lbl}>公司抬頭</label>
                <input style={inputStyle}
                  value={invoice.invoice_title}
                  onChange={(e) => setInvoice({ ...invoice, invoice_title: e.target.value })} />
              </div>
            </>
          )}

          {invoice.invoice_type === "donation" && (
            <div>
              <label style={lbl}>愛心碼 (3-7 位數字)</label>
              <input style={inputStyle}
                value={invoice.donation_code}
                onChange={(e) => setInvoice({ ...invoice, donation_code: e.target.value.replace(/\D/g, "") })} />
            </div>
          )}

          {invoice.invoice_type !== "skip" && (
            <div>
              <label style={lbl}>發票寄送 email (留空則使用 {user?.email || "結帳 email"})</label>
              <input style={inputStyle} type="email"
                placeholder={user?.email || ""}
                value={invoice.invoice_email}
                onChange={(e) => setInvoice({ ...invoice, invoice_email: e.target.value })} />
            </div>
          )}

          <div>
            <label style={lbl}>付款方式</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { key: "", label: "自動 (推薦, OEN 優先, 失敗自動切 Stripe)" },
                { key: "oen", label: "強制 OEN" },
                { key: "stripe", label: "強制 Stripe" },
              ].map((p) => (
                <button key={p.key} type="button"
                  onClick={() => setProviderChoice(p.key)}
                  style={{
                    ...chipStyle,
                    background: providerChoice === p.key ? "#0f766e" : "#fff",
                    color: providerChoice === p.key ? "#fff" : "#374151",
                    borderColor: providerChoice === p.key ? "#0f766e" : "#d1d5db",
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleSubmitInvoice} disabled={busy}
            style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
            {busy ? "處理中..." : `前往付款 ${fmtTWD(selectedPlan.price)}`}
          </button>
        </div>
      )}

      {mode === "redirect" && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: "1.1em", marginBottom: 12 }}>正在前往付款頁面...</div>
          <div style={{ color: "#6b7280", fontSize: "0.9em" }}>若 5 秒後未跳轉, 請重新嘗試。</div>
        </div>
      )}

      {mode === "receipt" && (
        <div style={{ display: "grid", gap: 14 }}>
          {!receipt && <div>查詢訂單中...</div>}
          {receipt && (
            <>
              <div style={{
                padding: 16, borderRadius: 8,
                background: receipt.status === "paid" ? "#dcfce7" : "#fef9c3",
                color: receipt.status === "paid" ? "#14532d" : "#854d0e",
              }}>
                <div style={{ fontSize: "1.1em", fontWeight: 600 }}>
                  {receipt.status === "paid" ? "✅ 付款成功" : `⏳ 訂單狀態: ${receipt.status}`}
                </div>
                {receipt.status === "paid" && (
                  <div style={{ marginTop: 4, fontSize: "0.9em" }}>
                    已解鎖: {receipt.feature === "all" ? "深度分析 + 合盤" : receipt.feature}
                  </div>
                )}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {[
                    ["訂單編號", receipt.order_id],
                    ["方案", receipt.plan_name],
                    ["金額", `${fmtTWD(receipt.amount)} ${receipt.currency || ""}`],
                    ["付款方式", PROVIDER_LABEL[receipt.provider] || receipt.provider || "—"],
                    ["建立時間", fmtTime(receipt.created)],
                    ["付款時間", fmtTime(receipt.paid_at)],
                    ["收件 email", receipt.email],
                  ].map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "8px 0", color: "#6b7280", width: "30%" }}>{k}</td>
                      <td style={{ padding: "8px 0" }}>{v || "—"}</td>
                    </tr>
                  ))}
                  {receipt.invoice && receipt.invoice.invoice_type !== "skip" && (
                    <>
                      <tr><td colSpan={2} style={{ paddingTop: 12, color: "#6b7280", fontWeight: 600 }}>發票資訊</td></tr>
                      <tr><td style={{ padding: "6px 0", color: "#6b7280" }}>類型</td><td>{INVOICE_TYPES.find(t => t.key === receipt.invoice.invoice_type)?.label || receipt.invoice.invoice_type}</td></tr>
                      {receipt.invoice.tax_id && (
                        <tr><td style={{ padding: "6px 0", color: "#6b7280" }}>統編 / 抬頭</td><td>{receipt.invoice.tax_id} / {receipt.invoice.invoice_title}</td></tr>
                      )}
                      {receipt.invoice.donation_code && (
                        <tr><td style={{ padding: "6px 0", color: "#6b7280" }}>愛心碼</td><td>{receipt.invoice.donation_code}</td></tr>
                      )}
                      {receipt.invoice.invoice_email && (
                        <tr><td style={{ padding: "6px 0", color: "#6b7280" }}>發票寄送</td><td>{receipt.invoice.invoice_email}</td></tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {mode === "history" && (
        <div style={{ display: "grid", gap: 10 }}>
          {history.length === 0 && <div style={{ color: "#6b7280" }}>尚無訂單紀錄</div>}
          {history.map((o) => (
            <button key={o.order_id}
              onClick={() => { setOrderId(o.order_id); setMode("receipt"); }}
              style={{
                textAlign: "left", padding: 14, borderRadius: 10,
                border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <strong>{o.plan_name || o.plan_id}</strong>
                <span style={{
                  padding: "2px 8px", borderRadius: 999, fontSize: "0.8em",
                  background: o.status === "paid" ? "#dcfce7" : "#fef9c3",
                  color: o.status === "paid" ? "#14532d" : "#854d0e",
                }}>{o.status}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280", fontSize: "0.85em" }}>
                <span>{fmtTime(o.created)}</span>
                <span>{fmtTWD(o.amount)} {PROVIDER_LABEL[o.provider] ? `· ${PROVIDER_LABEL[o.provider]}` : ""}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const btnPrimary = {
  padding: "12px 18px", borderRadius: 8, background: "#0f766e", color: "#fff",
  border: "none", cursor: "pointer", fontSize: "1em", fontWeight: 600,
};
const btnGhost = {
  padding: "8px 14px", borderRadius: 8, background: "transparent", color: "#374151",
  border: "1px solid #d1d5db", cursor: "pointer", fontSize: "0.9em",
};
const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid #d1d5db", fontSize: "0.95em",
};
const chipStyle = {
  padding: "8px 14px", borderRadius: 999, border: "1px solid #d1d5db",
  cursor: "pointer", fontSize: "0.88em",
};
const lbl = { display: "block", fontSize: "0.88em", color: "#374151", marginBottom: 6, fontWeight: 500 };
