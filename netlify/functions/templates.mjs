// Public template list for the main page, plus the template images.
//   GET /api/templates        -> { backgrounds: [...] } (enabled templates only)
//   GET /tpl-img/:id/:v       -> lighter copy for visitors
//   GET /tpl-orig/:id/:v      -> full-size original
import { db } from "../../lib/cards.mjs";
import { lightKey, originalKey, publicTemplate, templateStore } from "../../lib/templates.mjs";

export default async (req, context) => {
  const url = new URL(req.url);

  if (url.pathname === "/api/templates") {
    try {
      const rows = await db().sql`
        SELECT id, name, image_bytes, area_x, area_y, area_width, area_height, align, font_size_range, image_updated_at, updated_at
        FROM templates WHERE enabled ORDER BY sort, id`;
      return Response.json(
        { source: "site", backgrounds: rows.map(publicTemplate) },
        {
          headers: {
            "Cache-Control": "public, max-age=0, must-revalidate",
            "Netlify-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
          },
        },
      );
    } catch (err) {
      console.error("templates list failed", err && err.message ? err.message : err);
      return Response.json({ source: "site", backgrounds: [], error: "unavailable" }, { status: 500 });
    }
  }

  const id = Number(context.params.id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const store = templateStore();
  const wantOriginal = url.pathname.startsWith("/tpl-orig/");
  let entry = await store.getWithMetadata(wantOriginal ? originalKey(id) : lightKey(id), { type: "stream" });
  if (!entry && !wantOriginal) entry = await store.getWithMetadata(originalKey(id), { type: "stream" });
  if (!entry) return new Response("Not found", { status: 404 });

  return new Response(entry.data, {
    headers: {
      "Content-Type": (entry.metadata && entry.metadata.contentType) || "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config = {
  path: ["/api/templates", "/tpl-img/:id/:v", "/tpl-orig/:id/:v"],
};
