// Admin management of card background templates.
//   GET    /api/admin/templates               list all (enabled and disabled)
//   PUT    /api/admin/templates/chunk?upload=&part=original|light&index=
//          raw bytes of one piece of a file (files are sent in pieces so large
//          print originals get past the request size limit)
//   POST   /api/admin/templates               { upload, originalChunks, lightChunks, contentType,
//                                                lightType, name, width, height, id? } -> create / replace image
//   PATCH  /api/admin/templates/:id           edit name, text area, on/off, order
//   DELETE /api/admin/templates/:id
import { isAdmin, unauthorized } from "../../lib/admin-auth.mjs";
import { db } from "../../lib/cards.mjs";
import { lightKey, originalKey, publicTemplate, templateStore } from "../../lib/templates.mjs";

const COLUMNS = `id, name, content_type, image_bytes, image_width, image_height, area_x, area_y, area_width,
  area_height, align, font_size_range, enabled, sort, image_updated_at, created_at, updated_at`;

const bad = (error) => Response.json({ error }, { status: 400 });
const chunkKey = (upload, part, index) => `uploads/${upload}/${part}/${index}`;

function num(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

async function assemble(store, upload, part, count) {
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const piece = await store.get(chunkKey(upload, part, i), { type: "arrayBuffer" });
    if (!piece) throw new Error(`Missing piece ${i + 1} of ${count}`);
    pieces.push(Buffer.from(piece));
  }
  await Promise.all(pieces.map((_, i) => store.delete(chunkKey(upload, part, i))));
  return Buffer.concat(pieces);
}

function withUrls(row) {
  return { ...row, ...publicTemplate(row), textArea: undefined };
}

export default async (req, context) => {
  if (!isAdmin(req)) return unauthorized();
  const url = new URL(req.url);
  const pool = db().pool;
  const store = templateStore();

  if (url.pathname.endsWith("/chunk")) {
    if (req.method !== "PUT") return new Response("Method not allowed", { status: 405 });
    const upload = url.searchParams.get("upload") || "";
    const part = url.searchParams.get("part");
    const index = Number(url.searchParams.get("index"));
    if (!/^[A-Za-z0-9-]{8,64}$/.test(upload) || !["original", "light"].includes(part) || !Number.isInteger(index) || index < 0) {
      return bad("Bad upload piece");
    }
    const bytes = Buffer.from(await req.arrayBuffer());
    if (!bytes.length) return bad("Empty upload piece");
    await store.set(chunkKey(upload, part, index), bytes);
    return Response.json({ ok: true });
  }

  const id = context.params.id ? Number(context.params.id) : null;
  if (context.params.id && !Number.isInteger(id)) return bad("Bad id");

  if (req.method === "GET") {
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM templates ORDER BY sort, id`);
    return Response.json({ rows: rows.map(withUrls) });
  }

  if (req.method === "DELETE" && id) {
    const { rows } = await pool.query("DELETE FROM templates WHERE id = $1 RETURNING id", [id]);
    await Promise.all([store.delete(originalKey(id)), store.delete(lightKey(id))]);
    return Response.json({ deleted: rows.length });
  }

  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid JSON");

  if (req.method === "PATCH" && id) {
    const sets = [];
    const values = [];
    const set = (column, value) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (typeof body.name === "string" && body.name.trim()) set("name", body.name.trim().slice(0, 200));
    if (body.area_x !== undefined) set("area_x", num(body.area_x, 0, 1, 0.05));
    if (body.area_y !== undefined) set("area_y", num(body.area_y, 0, 1, 0.16));
    if (body.area_width !== undefined) set("area_width", num(body.area_width, 0.05, 1, 0.9));
    if (body.area_height !== undefined) set("area_height", num(body.area_height, 0.05, 1, 0.45));
    if (["left", "center", "right"].includes(body.align)) set("align", body.align);
    if (typeof body.font_size_range === "string") set("font_size_range", body.font_size_range.trim().slice(0, 60));
    if (typeof body.enabled === "boolean") set("enabled", body.enabled);
    if (body.sort !== undefined) set("sort", Math.round(num(body.sort, -100000, 100000, 0)));
    if (!sets.length) return bad("Nothing to change");
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE templates SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING ${COLUMNS}`,
      values,
    );
    if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ row: withUrls(rows[0]) });
  }

  if (req.method === "POST") {
    const upload = String(body.upload || "");
    const originalChunks = Number(body.originalChunks);
    const lightChunks = Number(body.lightChunks) || 0;
    if (!/^[A-Za-z0-9-]{8,64}$/.test(upload) || !Number.isInteger(originalChunks) || originalChunks < 1) {
      return bad("Missing upload");
    }
    const contentType = /^image\/[a-z0-9.+-]+$/i.test(body.contentType || "") ? body.contentType : "image/png";
    const lightType = /^image\/[a-z0-9.+-]+$/i.test(body.lightType || "") ? body.lightType : contentType;
    const original = await assemble(store, upload, "original", originalChunks);
    const light = lightChunks > 0 ? await assemble(store, upload, "light", lightChunks) : null;
    const width = Number.isInteger(body.width) ? body.width : null;
    const height = Number.isInteger(body.height) ? body.height : null;

    let row;
    if (body.id) {
      const { rows } = await pool.query(
        `UPDATE templates SET content_type = $1, image_bytes = $2, image_width = $3, image_height = $4, image_updated_at = NOW(), updated_at = NOW()
         WHERE id = $5 RETURNING ${COLUMNS}`,
        [contentType, original.length, width, height, Number(body.id)],
      );
      row = rows[0];
      if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    } else {
      const name = String(body.name || "template").trim().slice(0, 200) || "template";
      const { rows } = await pool.query(
        `INSERT INTO templates (name, blob_key, content_type, image_bytes, image_width, image_height, sort)
         VALUES ($1, '', $2, $3, $4, $5, (SELECT COALESCE(MAX(sort), 0) + 1 FROM templates))
         RETURNING ${COLUMNS}`,
        [name, contentType, original.length, width, height],
      );
      row = rows[0];
      await pool.query("UPDATE templates SET blob_key = $1 WHERE id = $2", [originalKey(row.id), row.id]);
    }

    await store.set(originalKey(row.id), original, { metadata: { contentType } });
    if (light) await store.set(lightKey(row.id), light, { metadata: { contentType: lightType } });
    else await store.delete(lightKey(row.id));
    return Response.json({ row: withUrls(row) });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = {
  path: ["/api/admin/templates", "/api/admin/templates/chunk", "/api/admin/templates/:id"],
};
