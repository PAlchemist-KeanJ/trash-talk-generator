// Shared storage for generated images: the file itself lives in Netlify Blobs,
// the conversation that produced it (plus bookkeeping) lives in Netlify Database.
import { getStore } from "@netlify/blobs";
import { getDatabase } from "@netlify/database";

export const db = () => getDatabase();
export const imageStore = () => getStore("card-images");

export function safeFileName(name) {
  return String(name || "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 180);
}

// RecycledTrashTalk123.png            -> card
// RecycledTrashTalk123_PhoneCase.png  -> mockup of RecycledTrashTalk123.png
// invoice-RecycledTrashTalk123.png    -> invoice for RecycledTrashTalk123.png
export function classifyFileName(fileName) {
  if (/^invoice-/i.test(fileName)) {
    return { kind: "invoice", parent: fileName.replace(/^invoice-/i, "") };
  }
  const mockup = fileName.match(/^(RecycledTrashTalk\d*|trash-talk-\d+)_[A-Za-z0-9]+\.[a-z0-9]+$/i);
  if (mockup) return { kind: "mockup", parent: `${mockup[1]}.png` };
  return { kind: "card", parent: null };
}

// Google Sheets exports use Hong Kong local time without a zone, e.g.
// "19/02/2026, 10:23:19" (DD/MM/YYYY), "7/8/2026 下午7:56:46" (Chinese AM/PM)
// or "2026-02-19 10:23:19".
const SHEET_UTC_OFFSET_HOURS = 8;

function to24h(hour, meridiem) {
  const h = Number(hour || 0);
  const mer = String(meridiem || "").toUpperCase();
  if ((mer === "下午" || mer === "PM") && h < 12) return h + 12;
  if ((mer === "上午" || mer === "AM") && h === 12) return 0;
  return h;
}

function parseSheetDate(text) {
  const time = "\\s*(上午|下午|AM|PM)?\\s*(?:(\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?\\s*(AM|PM)?$";
  let parts = null;
  let m = text.match(new RegExp("^(\\d{1,2})/(\\d{1,2})/(\\d{4}),?" + time, "i"));
  if (m) {
    // Day first (HK sheets); fall back to month first when the middle number can't be a month.
    const [day, month] = Number(m[2]) > 12 ? [m[2], m[1]] : [m[1], m[2]];
    parts = [m[3], month, day, to24h(m[5], m[4] || m[8]), m[6], m[7]];
  }
  if (!parts) {
    // "2026-02-19 10:23:19", "2026/7/24 上午5:11:59"
    m = text.match(new RegExp("^(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})(?:[ T,]+|$)" + time, "i"));
    if (m) parts = [m[1], m[2], m[3], to24h(m[5], m[4] || m[8]), m[6], m[7]];
  }
  if (!parts) return null;
  const [y, mo, d, h, mi, sec] = parts.map((v) => Number(v || 0));
  return new Date(Date.UTC(y, mo - 1, d, h - SHEET_UTC_OFFSET_HOURS, mi, sec));
}

export function toIsoOrNow(value) {
  const date = !value ? null : value instanceof Date ? value : parseSheetDate(String(value).trim()) || new Date(value);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match || !match[2]) return null;
  return { contentType: match[1] || "image/png", bytes: Buffer.from(match[3], "base64") };
}

// Saves (or overwrites) one image and its conversation. Re-saving the same file
// name replaces the previous version, mirroring the Drive "oversave" behaviour.
export async function saveImage({ fileName, bytes, contentType, originalMessage, reply, driveUrl, source, createdAt }) {
  const name = safeFileName(fileName);
  const { kind, parent } = classifyFileName(name);
  const blobKey = `images/${name}`;

  await imageStore().set(blobKey, bytes, { metadata: { contentType: contentType || "image/png" } });

  const [row] = await db().sql`
    INSERT INTO cards (file_name, kind, parent_file_name, original_message, reply, blob_key, image_bytes, drive_url, source, created_at)
    VALUES (${name}, ${kind}, ${parent}, ${originalMessage || ""}, ${reply || ""}, ${blobKey}, ${bytes.length},
            ${driveUrl || null}, ${source || "site"}, ${toIsoOrNow(createdAt)})
    ON CONFLICT (file_name) DO UPDATE SET
      blob_key = EXCLUDED.blob_key,
      image_bytes = EXCLUDED.image_bytes,
      original_message = CASE WHEN EXCLUDED.original_message <> '' THEN EXCLUDED.original_message ELSE cards.original_message END,
      reply = CASE WHEN EXCLUDED.reply <> '' THEN EXCLUDED.reply ELSE cards.reply END,
      drive_url = COALESCE(EXCLUDED.drive_url, cards.drive_url),
      updated_at = NOW()
    RETURNING id
  `;
  return row;
}
