// Lists, exports and deletes saved conversations for the admin page.
import { isAdmin, unauthorized } from "../../lib/admin-auth.mjs";
import { db, imageStore } from "../../lib/cards.mjs";

const PAGE_SIZE = 30;

function buildFilter(params) {
  const where = [];
  const values = [];
  const kind = params.get("kind") || "card";
  if (kind !== "all") {
    values.push(kind);
    where.push(`kind = $${values.length}`);
  }
  const q = (params.get("q") || "").trim();
  if (q) {
    values.push(`%${q}%`);
    where.push(`(original_message ILIKE $${values.length} OR reply ILIKE $${values.length} OR file_name ILIKE $${values.length})`);
  }
  if (params.get("from")) {
    values.push(params.get("from"));
    where.push(`created_at >= $${values.length}::date`);
  }
  if (params.get("to")) {
    values.push(params.get("to"));
    where.push(`created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", values };
}

function csvCell(value) {
  const text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default async (req) => {
  if (!isAdmin(req)) return unauthorized();
  const url = new URL(req.url);
  const pool = db().pool;

  if (req.method === "DELETE") {
    const id = Number(url.pathname.split("/").pop());
    if (!Number.isInteger(id)) return Response.json({ error: "Bad id" }, { status: 400 });
    const { rows } = await pool.query("DELETE FROM cards WHERE id = $1 RETURNING blob_key", [id]);
    if (rows[0] && rows[0].blob_key) await imageStore().delete(rows[0].blob_key);
    return Response.json({ deleted: rows.length });
  }

  const filter = buildFilter(url.searchParams);

  if (url.pathname.endsWith("/export.csv")) {
    const { rows } = await pool.query(
      `SELECT id, created_at, kind, file_name, original_message, reply, drive_url, source, image_bytes
       FROM cards ${filter.sql} ORDER BY created_at DESC`,
      filter.values,
    );
    const header = ["id", "date", "type", "file_name", "user_message", "ai_reply", "drive_url", "source", "has_image"];
    const lines = [header.join(",")].concat(
      rows.map((r) =>
        [r.id, r.created_at, r.kind, r.file_name, r.original_message, r.reply, r.drive_url, r.source, r.image_bytes ? "yes" : "no"]
          .map(csvCell)
          .join(","),
      ),
    );
    // BOM so Excel opens Chinese / Japanese text correctly.
    return new Response("﻿" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="trash-talk-conversations-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = url.searchParams.get("all") === "1" ? 5000 : PAGE_SIZE;
  const offset = url.searchParams.get("all") === "1" ? 0 : (page - 1) * PAGE_SIZE;

  const [{ rows }, { rows: countRows }, { rows: stats }] = await Promise.all([
    pool.query(
      `SELECT c.id, c.created_at, c.kind, c.file_name, c.parent_file_name, c.original_message, c.reply,
              c.image_bytes, c.drive_url, c.source,
              (SELECT COALESCE(json_agg(json_build_object('id', m.id, 'file_name', m.file_name, 'kind', m.kind) ORDER BY m.file_name), '[]')
                 FROM cards m WHERE m.parent_file_name = c.file_name AND m.image_bytes IS NOT NULL) AS related
       FROM cards c ${filter.sql}
       ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      filter.values,
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM cards ${filter.sql}`, filter.values),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE kind = 'card')::int AS cards,
              COUNT(*) FILTER (WHERE kind = 'card' AND created_at >= NOW() - INTERVAL '1 day')::int AS last24h,
              COUNT(*) FILTER (WHERE kind = 'mockup')::int AS mockups,
              COUNT(*) FILTER (WHERE kind = 'invoice')::int AS invoices
       FROM cards`,
    ),
  ]);

  return Response.json({ rows, total: countRows[0].total, page, pageSize: PAGE_SIZE, stats: stats[0] });
};

export const config = {
  path: ["/api/admin/cards", "/api/admin/cards/:id", "/api/admin/export.csv"],
};
