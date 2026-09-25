// Records every generated conversation (the visitor's message and the AI reply)
// so it shows up in /admin, even if the visitor never saves the card. The old
// Google Sheet log gets a backup copy.
import { classifyFileName, db, safeFileName } from "../../lib/cards.mjs";
import { backupToGoogle, GOOGLE_SHEETS_URL } from "../../lib/google-backup.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await req.json().catch(() => null);
  const message = String((body && body.message) || "").trim().slice(0, 2000);
  const reply = String((body && body.reply) || "").trim().slice(0, 2000);
  if (!message) return Response.json({ error: "Missing message" }, { status: 400 });

  // Backup row for the "Trash Talk Log" Google Sheet (sent in the background).
  backupToGoogle(context, GOOGLE_SHEETS_URL, {
    timestamp: new Date().toISOString(),
    message,
    aiResponse: reply,
    count: Number(body.count) || 0,
  });

  const fileName = reply && body.fileName ? safeFileName(body.fileName) : null;
  const sql = db().sql;

  try {
    if (fileName && classifyFileName(fileName).kind === "card") {
      const [created] = await sql`
        INSERT INTO cards (file_name, kind, original_message, reply, source)
        VALUES (${fileName}, 'card', ${message}, ${reply}, 'site')
        ON CONFLICT (file_name) DO NOTHING
        RETURNING id`;
      if (created) return Response.json({ id: created.id });

      // The visitor re-submitted during the same visit: they keep their edition
      // number, so only the latest version of the conversation is kept.
      if (body.replace === true) {
        const [replaced] = await sql`
          UPDATE cards SET original_message = ${message}, reply = ${reply}, updated_at = NOW()
          WHERE file_name = ${fileName}
          RETURNING id`;
        if (replaced) return Response.json({ id: replaced.id });
      }

      // Same file name already recorded: fill in the reply if it is the same
      // conversation, otherwise (counter clash between two visitors) keep both.
      const [updated] = await sql`
        UPDATE cards SET reply = ${reply}, updated_at = NOW()
        WHERE file_name = ${fileName} AND (original_message = ${message} OR original_message = '')
        RETURNING id`;
      if (updated) return Response.json({ id: updated.id });
    }

    const [row] = await sql`
      INSERT INTO cards (kind, original_message, reply, source)
      VALUES ('card', ${message}, ${reply}, 'site')
      RETURNING id`;
    return Response.json({ id: row.id });
  } catch (err) {
    console.error("log-conversation failed", err && err.message ? err.message : err);
    return Response.json({ error: "Could not record conversation" }, { status: 500 });
  }
};

export const config = {
  path: "/api/log-conversation",
};
