// Admin views of shop orders and free-download email leads.
//   GET    /api/admin/orders?q=&status=&from=&to=&page=     list (+ linked card / invoice images)
//   PATCH  /api/admin/orders/:id { status }                 change status
//   DELETE /api/admin/orders/:id
//   GET    /api/admin/orders.csv                            CSV export (same filters)
//   POST   /api/admin/orders/import { mode: "orders" | "invoices", rows }
//   ...and the same for /api/admin/leads
import { isAdmin, unauthorized } from "../../lib/admin-auth.mjs";
import { db, safeFileName, toIsoOrNow } from "../../lib/cards.mjs";
import { csvResponse } from "../../lib/csv.mjs";
import { money, normalizeStatus, ORDER_STATUSES, text } from "../../lib/shop.mjs";

const PAGE_SIZE = 50;
const bad = (error) => Response.json({ error }, { status: 400 });

function buildFilter(params, searchColumns) {
  const where = [];
  const values = [];
  const q = (params.get("q") || "").trim();
  if (q) {
    values.push(`%${q}%`);
    where.push(`(${searchColumns.map((c) => `t.${c} ILIKE $${values.length}`).join(" OR ")})`);
  }
  if (params.get("status")) {
    values.push(params.get("status"));
    where.push(`t.status = $${values.length}`);
  }
  if (params.get("from")) {
    values.push(params.get("from"));
    where.push(`t.created_at >= $${values.length}::date`);
  }
  if (params.get("to")) {
    values.push(params.get("to"));
    where.push(`t.created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", values };
}

const ORDER_SEARCH = ["invoice_no", "customer_name", "customer_email", "customer_phone", "shipping_address", "products",
  "design_file", "original_message", "ai_response"];
const LEAD_SEARCH = ["email", "design_file", "status"];

// Card / invoice images saved on this site, matched by file name.
const ORDER_LINKS = `
  (SELECT c.id FROM cards c WHERE c.file_name = t.design_file AND c.image_bytes IS NOT NULL) AS card_id,
  (SELECT c.id FROM cards c WHERE c.file_name = t.invoice_file AND c.image_bytes IS NOT NULL) AS invoice_id`;
const LEAD_LINKS = `(SELECT c.id FROM cards c WHERE c.file_name = t.design_file AND c.image_bytes IS NOT NULL) AS card_id`;

async function importOrders(pool, mode, rows) {
  let created = 0;
  let updated = 0;
  for (const r of rows) {
    const o = {
      date: toIsoOrNow(r.date),
      invoiceNo: text(r.invoiceNo, 60),
      name: text(r.name, 200),
      email: text(r.email, 200),
      phone: text(r.phone, 60),
      address: text(r.address, 1000),
      products: text(r.products, 4000),
      subtotal: money(r.subtotal),
      region: text(r.shippingRegion, 100),
      fee: text(r.shippingFee, 40) || money(r.shippingUsd),
      total: money(r.total),
      message: text(r.originalMessage),
      reply: text(r.aiResponse),
      designFile: safeFileName(text(r.designFile, 180)),
      status: normalizeStatus(r.status),
      emailSent: text(r.emailSent, 80),
    };
    if (!o.name && !o.email && !o.invoiceNo) continue;

    // Same row imported before (same invoice # and design) -> fill gaps.
    let match = null;
    if (o.invoiceNo) {
      const { rows: found } = await pool.query(
        "SELECT id FROM orders WHERE (invoice_no = $1 OR invoice_no LIKE $1 || '-%') AND design_file = $2 LIMIT 1",
        [o.invoiceNo, o.designFile],
      );
      match = found[0];
    }
    // The Invoices sheet numbered orders separately; attach its extra details
    // (subtotal, shipping, message, AI reply) to the matching order instead.
    if (!match && mode === "invoices" && o.designFile) {
      const { rows: found } = await pool.query(
        `SELECT id FROM orders WHERE design_file = $1 AND ($2 = '' OR lower(customer_email) = lower($2))
           AND created_at BETWEEN $3::timestamptz - INTERVAL '1 day' AND $3::timestamptz + INTERVAL '1 day'
         ORDER BY abs(extract(epoch FROM created_at - $3::timestamptz)) LIMIT 1`,
        [o.designFile, o.email, o.date],
      );
      match = found[0];
    }

    if (match) {
      await pool.query(
        `UPDATE orders SET
           customer_phone = COALESCE(NULLIF(customer_phone, ''), $2),
           shipping_address = COALESCE(NULLIF(shipping_address, ''), $3),
           products = CASE WHEN length($4) > length(products) THEN $4 ELSE products END,
           subtotal = COALESCE(NULLIF(subtotal, ''), $5),
           shipping_region = COALESCE(NULLIF(shipping_region, ''), $6),
           shipping_fee = COALESCE(NULLIF(shipping_fee, ''), $7),
           total = COALESCE(NULLIF(total, ''), $8),
           original_message = COALESCE(NULLIF(original_message, ''), $9),
           ai_response = COALESCE(NULLIF(ai_response, ''), $10),
           email_sent = COALESCE(NULLIF(email_sent, ''), $11),
           updated_at = NOW()
         WHERE id = $1`,
        [match.id, o.phone, o.address, o.products, o.subtotal, o.region, o.fee, o.total, o.message, o.reply, o.emailSent],
      );
      updated++;
      continue;
    }

    // Invoice numbers from the two old sheets overlap; keep the first one as-is.
    let invoiceNo = o.invoiceNo || null;
    if (invoiceNo) {
      const { rows: taken } = await pool.query("SELECT 1 FROM orders WHERE invoice_no = $1", [invoiceNo]);
      if (taken.length) invoiceNo = `${invoiceNo}-${mode === "invoices" ? "INV" : "B"}${created + updated}`;
    }
    await pool.query(
      `INSERT INTO orders (invoice_no, customer_name, customer_email, customer_phone, shipping_address, products,
         subtotal, shipping_region, shipping_fee, total, original_message, ai_response, design_file, invoice_file,
         status, email_sent, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'import', $17, $17)`,
      [invoiceNo, o.name, o.email, o.phone, o.address, o.products, o.subtotal, o.region, o.fee, o.total, o.message,
        o.reply, o.designFile, o.designFile ? `invoice-${o.designFile}` : "", o.status, o.emailSent, o.date],
    );
    created++;
  }
  return { created, updated };
}

async function importLeads(pool, rows) {
  let created = 0;
  let skipped = 0;
  for (const r of rows) {
    const email = text(r.email, 200);
    if (!email) continue;
    const { rows: inserted } = await pool.query(
      `INSERT INTO leads (email, design_file, status, source, created_at)
       SELECT $1::text, $2::text, $3::text, 'import', $4::timestamptz
       WHERE NOT EXISTS (SELECT 1 FROM leads WHERE email = $1::text AND design_file = $2::text AND created_at = $4::timestamptz)
       RETURNING id`,
      [email, safeFileName(text(r.designFile, 180)), text(r.status, 80) || "new_lead", toIsoOrNow(r.date)],
    );
    if (inserted.length) created++;
    else skipped++;
  }
  return { created, skipped };
}

export default async (req, context) => {
  if (!isAdmin(req)) return unauthorized();
  const url = new URL(req.url);
  const pool = db().pool;
  const isOrders = url.pathname.startsWith("/api/admin/orders");
  const table = isOrders ? "orders" : "leads";
  const id = context.params.id ? Number(context.params.id) : null;

  if (url.pathname.endsWith("/import")) {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.rows)) return bad("Missing rows");
    if (body.rows.length > 1000) return bad("Send at most 1000 rows at a time");
    const result = isOrders
      ? await importOrders(pool, body.mode === "invoices" ? "invoices" : "orders", body.rows)
      : await importLeads(pool, body.rows);
    return Response.json(result);
  }

  if (context.params.id !== undefined) {
    if (!Number.isInteger(id)) return bad("Bad id");
    if (req.method === "DELETE") {
      const { rows } = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [id]);
      return Response.json({ deleted: rows.length });
    }
    if (req.method === "PATCH") {
      const body = await req.json().catch(() => ({}));
      const status = text(body && body.status, 80);
      if (!status || (isOrders && !ORDER_STATUSES.includes(status))) return bad("Unknown status");
      const { rows } = await pool.query(
        `UPDATE ${table} SET status = $1${isOrders ? ", updated_at = NOW()" : ""} WHERE id = $2 RETURNING id, status`,
        [status, id],
      );
      return rows[0] ? Response.json(rows[0]) : Response.json({ error: "Not found" }, { status: 404 });
    }
    return new Response("Method not allowed", { status: 405 });
  }

  const filter = buildFilter(url.searchParams, isOrders ? ORDER_SEARCH : LEAD_SEARCH);

  if (url.pathname.endsWith(".csv")) {
    const { rows } = await pool.query(`SELECT t.* FROM ${table} t ${filter.sql} ORDER BY t.created_at DESC`, filter.values);
    if (isOrders) {
      return csvResponse(
        "trash-talk-orders",
        ["Date", "Invoice #", "Customer Name", "Email", "Phone", "Shipping Address", "Products", "Subtotal",
          "Shipping Region", "Shipping Fee", "Total", "Original Message", "AI Response", "Design File", "Invoice File",
          "Payment Status", "Customer said paid", "Email Sent", "Source"],
        rows.map((r) => [r.created_at, r.invoice_no, r.customer_name, r.customer_email, r.customer_phone,
          r.shipping_address, r.products, r.subtotal, r.shipping_region, r.shipping_fee, r.total, r.original_message,
          r.ai_response, r.design_file, r.invoice_file, r.status, r.customer_confirmed_at, r.email_sent, r.source]),
      );
    }
    return csvResponse(
      "trash-talk-email-leads",
      ["Date", "Email", "Design File", "Status", "Source"],
      rows.map((r) => [r.created_at, r.email, r.design_file, r.status, r.source]),
    );
  }

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const [{ rows }, { rows: countRows }, { rows: stats }] = await Promise.all([
    pool.query(
      `SELECT t.*, ${isOrders ? ORDER_LINKS : LEAD_LINKS} FROM ${table} t ${filter.sql}
       ORDER BY t.created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      filter.values,
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM ${table} t ${filter.sql}`, filter.values),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM ${table} GROUP BY status ORDER BY status`),
  ]);
  return Response.json({ rows, total: countRows[0].total, page, pageSize: PAGE_SIZE, stats });
};

export const config = {
  path: [
    "/api/admin/orders", "/api/admin/orders.csv", "/api/admin/orders/import", "/api/admin/orders/:id",
    "/api/admin/leads", "/api/admin/leads.csv", "/api/admin/leads/import", "/api/admin/leads/:id",
  ],
};
