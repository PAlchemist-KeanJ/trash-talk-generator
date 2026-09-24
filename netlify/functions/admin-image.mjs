// Streams a stored image at its original (print) size. Admin only.
import { isAdmin, unauthorized } from "../../lib/admin-auth.mjs";
import { db, imageStore } from "../../lib/cards.mjs";

export default async (req, context) => {
  if (!isAdmin(req)) return unauthorized();
  const id = Number(context.params.id);
  if (!Number.isInteger(id)) return new Response("Bad id", { status: 400 });

  const [row] = await db().sql`SELECT file_name, blob_key FROM cards WHERE id = ${id}`;
  if (!row || !row.blob_key) return new Response("Not found", { status: 404 });

  const result = await imageStore().getWithMetadata(row.blob_key, { type: "stream" });
  if (!result) return new Response("Not found", { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(result.data, {
    headers: {
      "Content-Type": (result.metadata && result.metadata.contentType) || "image/png",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${row.file_name || `card-${id}.png`}"`,
    },
  });
};

export const config = {
  path: "/api/admin/image/:id",
};
