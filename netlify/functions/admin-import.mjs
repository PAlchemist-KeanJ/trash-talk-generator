// Imports history from the old Google Sheet / Drive into the admin records.
//   POST /api/admin/import        JSON { rows: [{ timestamp, message, reply, fileName, driveUrl }] }
//   POST /api/admin/import-image  raw image body, X-File-Name header
import { isAdmin, unauthorized } from "../../lib/admin-auth.mjs";
import { classifyFileName, db, imageStore, safeFileName, saveImage, toIsoOrNow } from "../../lib/cards.mjs";

const MAX_ROWS = 1000;

async function importRows(req) {
  const body = await req.json().catch(() => null);
  const rows = Array.isArray(body && body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
  let added = 0;
  let skipped = 0;
  const sql = db().sql;

  for (const r of rows) {
    const message = String(r.message || "").slice(0, 4000);
    const reply = String(r.reply || "").slice(0, 4000);
    const fileName = r.fileName ? safeFileName(r.fileName) : null;
    if (!message && !reply && !fileName) {
      skipped++;
      continue;
    }
    const { kind, parent } = fileName ? classifyFileName(fileName) : { kind: "card", parent: null };
    const createdAt = toIsoOrNow(r.timestamp);
    const driveUrl = r.driveUrl ? String(r.driveUrl).slice(0, 500) : null;

    const inserted = fileName
      ? await sql`
          INSERT INTO cards (file_name, kind, parent_file_name, original_message, reply, drive_url, source, created_at)
          VALUES (${fileName}, ${kind}, ${parent}, ${message}, ${reply}, ${driveUrl}, 'import', ${createdAt})
          ON CONFLICT (file_name) DO UPDATE SET
            original_message = CASE WHEN cards.original_message = '' THEN EXCLUDED.original_message ELSE cards.original_message END,
            reply = CASE WHEN cards.reply = '' THEN EXCLUDED.reply ELSE cards.reply END,
            drive_url = COALESCE(cards.drive_url, EXCLUDED.drive_url)
          RETURNING (xmax = 0) AS created`
      : await sql`
          INSERT INTO cards (kind, original_message, reply, drive_url, source, created_at)
          SELECT 'card', ${message}::text, ${reply}::text, ${driveUrl}::text, 'import', ${createdAt}::timestamptz
          WHERE NOT EXISTS (
            SELECT 1 FROM cards WHERE source = 'import' AND original_message = ${message}
              AND reply = ${reply} AND created_at = ${createdAt}::timestamptz
          )
          RETURNING true AS created`;
    if (inserted[0] && inserted[0].created) added++;
    else skipped++;
  }
  return Response.json({ added, skipped, received: rows.length });
}

// Attaches an uploaded image to one specific record (the "Upload image" button).
async function attachToRecord(req, id) {
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length) return Response.json({ error: "Empty file" }, { status: 400 });
  const [row] = await db().sql`SELECT id, file_name FROM cards WHERE id = ${id}`;
  if (!row) return Response.json({ error: "Record not found" }, { status: 404 });

  const uploaded = safeFileName(decodeURIComponent(req.headers.get("x-file-name") || "")) || "card.png";
  const blobKey = `images/${row.file_name || `record-${id}-${uploaded}`}`;
  await imageStore().set(blobKey, bytes, { metadata: { contentType: req.headers.get("content-type") || "image/png" } });
  await db().sql`
    UPDATE cards SET blob_key = ${blobKey}, image_bytes = ${bytes.length},
      file_name = COALESCE(file_name, ${`record-${id}-${uploaded}`}), updated_at = NOW()
    WHERE id = ${id}`;
  return Response.json({ id, matched: true });
}

async function importImage(req) {
  const recordId = Number(req.headers.get("x-record-id"));
  if (Number.isInteger(recordId) && recordId > 0) return attachToRecord(req, recordId);

  const fileName = safeFileName(decodeURIComponent(req.headers.get("x-file-name") || ""));
  if (!fileName) return Response.json({ error: "Missing file name" }, { status: 400 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length) return Response.json({ error: "Empty file" }, { status: 400 });

  const [existing] = await db().sql`SELECT id, created_at FROM cards WHERE file_name = ${fileName}`;
  const row = await saveImage({
    fileName,
    bytes,
    contentType: req.headers.get("content-type") || "image/png",
    source: "import",
    createdAt: existing ? existing.created_at : req.headers.get("x-file-date"),
  });
  return Response.json({ id: row.id, matched: !!existing });
}

export default async (req) => {
  if (!isAdmin(req)) return unauthorized();
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  return new URL(req.url).pathname.endsWith("/import-image") ? importImage(req) : importRows(req);
};

export const config = {
  path: ["/api/admin/import", "/api/admin/import-image"],
};
