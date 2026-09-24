// Trash talk counter. The number lives in Netlify Database; the old Google
// counter is bumped in the background as a backup.
//   GET  /api/counter                   -> { total }
//   GET  /api/counter?action=increment  -> { total } (the new number)
//   GET/POST /api/admin/counter         -> admin read / set { total }
import { isAdmin, unauthorized } from "../../lib/admin-auth.mjs";
import { db } from "../../lib/cards.mjs";
import { backupToGoogle, GOOGLE_COUNTER_URL } from "../../lib/google-backup.mjs";

const noStore = { "Cache-Control": "no-store" };

async function currentTotal(sql) {
  const [row] = await sql`SELECT total FROM counter WHERE id = 1`;
  if (row) return row.total;
  const [created] = await sql`
    INSERT INTO counter (id, total) VALUES (1, 402)
    ON CONFLICT (id) DO UPDATE SET total = counter.total
    RETURNING total`;
  return created.total;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const sql = db().sql;

  if (url.pathname === "/api/admin/counter") {
    if (!isAdmin(req)) return unauthorized();
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const total = Number(body && body.total);
      if (!Number.isInteger(total) || total < 0) {
        return Response.json({ error: "Counter must be a whole number" }, { status: 400 });
      }
      const [row] = await sql`
        INSERT INTO counter (id, total) VALUES (1, ${total})
        ON CONFLICT (id) DO UPDATE SET total = EXCLUDED.total, updated_at = NOW()
        RETURNING total, updated_at`;
      return Response.json(row, { headers: noStore });
    }
    const [row] = await sql`SELECT total, updated_at FROM counter WHERE id = 1`;
    return Response.json(row || { total: await currentTotal(sql) }, { headers: noStore });
  }

  try {
    if (url.searchParams.get("action") === "increment") {
      await currentTotal(sql);
      const [row] = await sql`UPDATE counter SET total = total + 1, updated_at = NOW() WHERE id = 1 RETURNING total`;
      backupToGoogle(context, `${GOOGLE_COUNTER_URL}?action=increment&t=${Date.now()}`);
      return Response.json({ total: row.total }, { headers: noStore });
    }
    return Response.json({ total: await currentTotal(sql) }, { headers: noStore });
  } catch (err) {
    console.error("counter failed", err && err.message ? err.message : err);
    return Response.json({ error: "Counter unavailable" }, { status: 500, headers: noStore });
  }
};

export const config = {
  path: ["/api/counter", "/api/admin/counter"],
};
