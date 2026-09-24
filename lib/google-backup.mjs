// Google Sheets / Apps Script now only receive backup copies. Every call runs
// after the response has been sent (context.waitUntil), so the site keeps
// working even when Google is slow or unreachable.
export const GOOGLE_SHEETS_URL =
  "https://script.google.com/macros/s/AKfycbx47_iqMPEFJMrX2OtWlWIPF9y-DPr0BfXP_9mgr6OKM7zt3Izz7jBCG9DqcX4bUYHyXg/exec";
export const GOOGLE_COUNTER_URL =
  "https://script.google.com/macros/s/AKfycbwYEUyumlfdviXc65eGUujZG8QlEtzo2aHkVo4Asr4YyVMGnyRURMk4oDg1j-ujIQikQQ/exec";

async function send(url, payload) {
  try {
    const init = payload === undefined
      ? { method: "GET", redirect: "follow" }
      : { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload), redirect: "follow" };
    const resp = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) console.error("google backup: rejected", resp.status);
  } catch (err) {
    console.error("google backup: failed", err && err.message ? err.message : err);
  }
}

// payload undefined -> GET request (used for the counter's ?action=increment).
export function backupToGoogle(context, url, payload) {
  if (Netlify.env.get("GOOGLE_BACKUP_DISABLED") === "true") return;
  const job = send(url, payload);
  if (context && typeof context.waitUntil === "function") context.waitUntil(job);
}
