// Public, read-only access to finished cards and their product mockups, so a
// card can be shared by link and other sites (e.g. the Base44 shop) can show it
// straight from here instead of waiting for the Google Drive copy.
//   GET /api/public/image/:fileName            the image itself (cards and mockups only)
//   GET /api/public/cards?limit=&since=&edition= newest cards with image + share links
import { db, imageStore, safeFileName } from "../../lib/cards.mjs";

const CORS = { "Access-Control-Allow-Origin": "*" };

function versioned(path, updatedAt) {
  const v = updatedAt ? new Date(updatedAt).getTime() : "";
  return v ? `${path}?v=${v}` : path;
}

async function serveImage(req, fileName) {
  const name = safeFileName(decodeURIComponent(fileName || ""));
  if (!name) return new Response("Not found", { status: 404 });
  const [row] = await db().sql`
    SELECT blob_key FROM cards WHERE file_name = ${name} AND kind IN ('card', 'mockup') AND blob_key IS NOT NULL`;
  if (!row) return new Response("Not found", { status: 404, headers: CORS });

  const result = await imageStore().getWithMetadata(row.blob_key, { type: "stream" });
  if (!result) return new Response("Not found", { status: 404, headers: CORS });

  // Re-editing a card keeps its file name, so un-versioned links are only cached briefly.
  const pinned = new URL(req.url).searchParams.has("v");
  return new Response(result.data, {
    headers: {
      ...CORS,
      "Content-Type": (result.metadata && result.metadata.contentType) || "image/png",
      "Cache-Control": pinned ? "public, max-age=31536000, immutable" : "public, max-age=60",
      "Content-Disposition": `inline; filename="${name}"`,
    },
  });
}

async function listCards(req) {
  const url = new URL(req.url);
  const origin = url.origin;
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const since = url.searchParams.get("since");
  const edition = (url.searchParams.get("edition") || "").replace(/\D/g, "");

  const values = [];
  const where = ["c.kind = 'card'", "c.image_bytes IS NOT NULL", "c.file_name ~* '^RecycledTrashTalk[0-9]+\\.png$'"];
  if (edition) {
    values.push(`RecycledTrashTalk${edition}.png`);
    where.push(`c.file_name = $${values.length}`);
  }
  if (since && !Number.isNaN(new Date(since).getTime())) {
    values.push(new Date(since).toISOString());
    where.push(`c.updated_at > $${values.length}::timestamptz`);
  }
  const { rows } = await db().pool.query(
    `SELECT c.file_name, c.reply, c.created_at, c.updated_at,
            (SELECT COALESCE(json_agg(json_build_object('file_name', m.file_name, 'updated_at', m.updated_at) ORDER BY m.file_name), '[]')
               FROM cards m WHERE m.parent_file_name = c.file_name AND m.image_bytes IS NOT NULL) AS mockups
     FROM cards c WHERE ${where.join(" AND ")}
     ORDER BY c.updated_at DESC LIMIT ${limit}`,
    values,
  );

  const cards = rows.map((r) => {
    const number = r.file_name.match(/(\d+)/)[1];
    const mockups = {};
    for (const m of r.mockups || []) {
      const product = m.file_name.replace(/^[^_]+_/, "").replace(/\.[a-z0-9]+$/i, "");
      mockups[product] = origin + versioned(`/api/public/image/${encodeURIComponent(m.file_name)}`, m.updated_at);
    }
    return {
      edition: Number(number),
      fileName: r.file_name,
      text: r.reply,
      imageUrl: origin + versioned(`/api/public/image/${encodeURIComponent(r.file_name)}`, r.updated_at),
      shareUrl: `${origin}/c/${number}`,
      mockups,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
  return Response.json({ cards }, { headers: { ...CORS, "Cache-Control": "public, max-age=15" } });
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...CORS, "Access-Control-Allow-Methods": "GET" } });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (context.params.fileName) return serveImage(req, context.params.fileName);
  return listCards(req);
};

export const config = {
  path: ["/api/public/cards", "/api/public/image/:fileName"],
};
