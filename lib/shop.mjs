// Shared helpers for orders and email leads.
const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

export const ORDER_STATUSES = ["pending_payment", "paid", "printed", "shipped", "cancelled"];

export function text(value, max = 2000) {
  if (value == null) return "";
  return String(value).trim().slice(0, max);
}

export function money(value) {
  const t = text(value, 40);
  if (!t) return "";
  return /^\d+(\.\d+)?$/.test(t) ? `US$${t}` : t;
}

export function productsText(products) {
  if (Array.isArray(products)) {
    return products
      .map((p) => {
        const name = text(p && p.name, 200);
        const qty = Number(p && p.qty) > 1 ? ` ×${Number(p.qty)}` : "";
        const line = p && p.lineTotal != null && p.lineTotal !== "" ? ` (${money(p.lineTotal)})` : "";
        return name ? `${name}${qty}${line}` : "";
      })
      .filter(Boolean)
      .join(", ")
      .slice(0, 4000);
  }
  return text(products, 4000);
}

// Old Sheet statuses ("pending_payment", "Paid", "✅ shipped"...) -> our statuses.
export function normalizeStatus(value) {
  const t = text(value, 80).toLowerCase();
  if (/ship|寄出|已寄/.test(t)) return "shipped";
  if (/print|印/.test(t)) return "printed";
  if (/cancel|取消/.test(t)) return "cancelled";
  if (/^paid|payment received|已付|confirmed/.test(t)) return "paid";
  return "pending_payment";
}

// TT-YYYYMMDD-NNNN, numbered per Hong Kong calendar day.
export async function nextInvoiceNo(pool, date = new Date()) {
  const day = new Date(date.getTime() + HK_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `TT-${day}-`;
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(invoice_no FROM $2::int), '\\D', '', 'g'), '')::int), 0) AS last
     FROM orders WHERE invoice_no LIKE $1`,
    [`${prefix}%`, prefix.length + 1],
  );
  return `${prefix}${String(rows[0].last + 1).padStart(4, "0")}`;
}
