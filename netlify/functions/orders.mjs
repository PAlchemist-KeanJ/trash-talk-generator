// Records shop orders from the main page. The order is saved here first; the
// Google Sheet gets the same row in the background as a backup.
//   POST /api/orders { orderKey, stage: "invoice" | "confirmed" | "details", customerName, ... }
import { db, safeFileName } from "../../lib/cards.mjs";
import { backupToGoogle, GOOGLE_SHEETS_URL } from "../../lib/google-backup.mjs";
import { money, nextInvoiceNo, productsText, text } from "../../lib/shop.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const stage = ["invoice", "confirmed", "details"].includes(body.stage) ? body.stage : "invoice";
  const designFile = safeFileName(text(body.designFileName || body.design_file, 180));
  const order = {
    key: /^[A-Za-z0-9-]{8,80}$/.test(body.orderKey || "") ? body.orderKey : null,
    name: text(body.customerName, 200),
    email: text(body.customerEmail, 200),
    phone: text(body.phone, 60),
    address: text(body.shippingAddress, 1000),
    products: productsText(body.products),
    subtotal: money(body.subtotal),
    region: text(body.shippingRegion, 100),
    fee: body.shippingFee === 0 || body.shippingFee === "0" ? "FREE" : money(body.shippingFee),
    total: money(body.total),
    message: text(body.originalMessage),
    reply: text(body.aiResponse),
    designFile,
    invoiceFile: designFile ? `invoice-${designFile}` : "",
  };
  if (!order.email && !order.name) return Response.json({ error: "Missing customer" }, { status: 400 });

  if (stage !== "details") {
    backupToGoogle(context, GOOGLE_SHEETS_URL, {
      type: "order",
      timestamp: new Date().toISOString(),
      customer_name: order.name,
      customer_email: order.email,
      customer_phone: order.phone,
      shipping_address: order.address,
      products: order.products.replace(/ \(US\$[^)]*\)/g, ""),
      total: order.total,
      design_file: order.designFile,
      status: "pending_payment",
    });
  }

  const pool = db().pool;
  try {
    // Fill in whatever this step knows; never blank out what an earlier step saved.
    const params = [order.name, order.email, order.phone, order.address, order.products, order.subtotal, order.region,
      order.fee, order.total, order.message, order.reply, order.designFile, order.invoiceFile, stage === "confirmed"];
    const assignments = `
      customer_name = COALESCE(NULLIF($1, ''), customer_name),
      customer_email = COALESCE(NULLIF($2, ''), customer_email),
      customer_phone = COALESCE(NULLIF($3, ''), customer_phone),
      shipping_address = COALESCE(NULLIF($4, ''), shipping_address),
      products = COALESCE(NULLIF($5, ''), products),
      subtotal = COALESCE(NULLIF($6, ''), subtotal),
      shipping_region = COALESCE(NULLIF($7, ''), shipping_region),
      shipping_fee = COALESCE(NULLIF($8, ''), shipping_fee),
      total = COALESCE(NULLIF($9, ''), total),
      original_message = COALESCE(NULLIF($10, ''), original_message),
      ai_response = COALESCE(NULLIF($11, ''), ai_response),
      design_file = COALESCE(NULLIF($12, ''), design_file),
      invoice_file = COALESCE(NULLIF($13, ''), invoice_file),
      customer_confirmed_at = CASE WHEN $14 THEN COALESCE(customer_confirmed_at, NOW()) ELSE customer_confirmed_at END,
      updated_at = NOW()`;

    if (order.key) {
      const { rows } = await pool.query(
        `UPDATE orders SET ${assignments} WHERE order_key = $15 RETURNING id, invoice_no`,
        [...params, order.key],
      );
      if (rows[0]) return Response.json({ id: rows[0].id, invoiceNo: rows[0].invoice_no });
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const invoiceNo = await nextInvoiceNo(pool);
      try {
        const { rows } = await pool.query(
          `INSERT INTO orders (order_key, invoice_no, customer_name, customer_email, customer_phone, shipping_address,
             products, subtotal, shipping_region, shipping_fee, total, original_message, ai_response, design_file,
             invoice_file, customer_confirmed_at)
           VALUES ($15, $16, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CASE WHEN $14 THEN NOW() END)
           RETURNING id, invoice_no`,
          [...params, order.key, invoiceNo],
        );
        return Response.json({ id: rows[0].id, invoiceNo: rows[0].invoice_no });
      } catch (err) {
        if (err && err.code === "23505" && /order_key/.test(err.constraint || err.detail || "")) {
          // Two steps of the same order arrived together: update instead.
          const { rows } = await pool.query(
            `UPDATE orders SET ${assignments} WHERE order_key = $15 RETURNING id, invoice_no`,
            [...params, order.key],
          );
          return Response.json({ id: rows[0].id, invoiceNo: rows[0].invoice_no });
        }
        if (!(err && err.code === "23505")) throw err;
      }
    }
    throw new Error("Could not allocate an invoice number");
  } catch (err) {
    console.error("orders: save failed", err && err.message ? err.message : err);
    return Response.json({ error: "Could not save order" }, { status: 500 });
  }
};

export const config = {
  path: "/api/orders",
};
