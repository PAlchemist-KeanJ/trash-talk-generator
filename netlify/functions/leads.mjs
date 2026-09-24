// Records the email left for a free download. Saved here first; the Google
// Sheet gets a backup copy in the background.
//   POST /api/leads { email, designFile }
import { db, safeFileName } from "../../lib/cards.mjs";
import { backupToGoogle, GOOGLE_SHEETS_URL } from "../../lib/google-backup.mjs";
import { text } from "../../lib/shop.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await req.json().catch(() => null);
  const email = text(body && body.email, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Invalid email" }, { status: 400 });
  const designFile = safeFileName(text(body.designFile || body.design_file, 180));

  backupToGoogle(context, GOOGLE_SHEETS_URL, {
    type: "free_download",
    email,
    design_file: designFile || "unknown",
    timestamp: new Date().toISOString(),
  });

  try {
    const [row] = await db().sql`
      INSERT INTO leads (email, design_file, status) VALUES (${email}, ${designFile}, 'new_lead') RETURNING id`;
    return Response.json({ id: row.id });
  } catch (err) {
    console.error("leads: save failed", err && err.message ? err.message : err);
    return Response.json({ error: "Could not save" }, { status: 500 });
  }
};

export const config = {
  path: "/api/leads",
};
