import { decodeDataUrl, saveImage } from "../../lib/cards.mjs";

const DRIVE_UPLOAD_URL =
  "https://script.google.com/macros/s/AKfycbzEQfh7CPCYc_wAvF697x6AZ5Hvjc7ssyhrBKzDwSG4cTJ_WoMtIrLK0lZDgmxf6VsU/exec";

function safeString(value, maxLength) {
  const text = typeof value === "string" ? value : "";
  return text.slice(0, maxLength);
}

function normalizeUploadBody(body) {
  return {
    image: safeString(body.image, 12_000_000),
    fileName: safeString(body.fileName || body.filename, 180),
    originalMessage: safeString(body.originalMessage, 2_000),
    transformedMessage: safeString(body.transformedMessage, 2_000),
    timestamp: safeString(body.timestamp, 80) || new Date().toISOString(),
    overwrite: body.overwrite === true || body.overwrite === "true" || body.oversave === true || body.oversave === "true",
    oversave: body.overwrite === true || body.overwrite === "true" || body.oversave === true || body.oversave === "true",
  };
}

function parseDriveLink(text) {
  try {
    const json = JSON.parse(text);
    if (json.fileId) return { fileId: json.fileId, url: `https://drive.google.com/file/d/${json.fileId}/view?usp=sharing` };
    if (json.fileUrl || json.url || json.link) return { url: json.fileUrl || json.url || json.link };
  } catch {
    // Apps Script deployments sometimes return plain text.
  }

  const fileMatch = text.match(/drive\.google\.com\/file\/d\/([^/\s"]+)/);
  if (fileMatch) {
    return {
      fileId: fileMatch[1],
      url: `https://drive.google.com/file/d/${fileMatch[1]}/view?usp=sharing`,
    };
  }

  const idMatch = text.match(/["']?(?:fileId|id)["']?\s*[:=]\s*["']([^"']+)["']/);
  if (idMatch) {
    return {
      fileId: idMatch[1],
      url: `https://drive.google.com/file/d/${idMatch[1]}/view?usp=sharing`,
    };
  }

  return {};
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const payload = normalizeUploadBody(body || {});
  if (!payload.image || !payload.fileName) {
    return Response.json({ success: false, error: "Missing image or file name" }, { status: 400 });
  }

  // 1) Keep the original on this site (Netlify Blobs + Database) so it shows up
  //    in /admin at full print size, independent of Google.
  let savedHere = false;
  const decoded = decodeDataUrl(payload.image);
  if (decoded) {
    try {
      await saveImage({
        fileName: payload.fileName,
        bytes: decoded.bytes,
        contentType: decoded.contentType,
        originalMessage: payload.originalMessage,
        reply: payload.transformedMessage,
        createdAt: payload.timestamp,
      });
      savedHere = true;
    } catch (err) {
      console.error("upload-to-drive: saving to site storage failed", err && err.message ? err.message : err);
    }
  }

  // 2) Backup copy to Google Drive (server-side, so it works for visitors whose
  //    browsers cannot reach Google). When the site copy succeeded we answer
  //    straight away and let the Drive upload finish in the background.
  const forwardToDrive = async () => {
    try {
      const resp = await fetch(DRIVE_UPLOAD_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      });
      const text = await resp.text();
      if (resp.ok) return parseDriveLink(text);
      console.error("upload-to-drive: Apps Script rejected upload", resp.status);
    } catch (err) {
      console.error("upload-to-drive: Drive backup failed", err && err.message ? err.message : err);
    }
    return null;
  };

  if (savedHere) {
    context.waitUntil(forwardToDrive());
    return Response.json({ success: true, savedHere: true });
  }

  const driveLink = await forwardToDrive();
  if (!driveLink) {
    return Response.json({ success: false, error: "Upload failed" }, { status: 502 });
  }
  return Response.json({ success: true, ...driveLink });
};

export const config = {
  path: "/api/upload-to-drive",
};
