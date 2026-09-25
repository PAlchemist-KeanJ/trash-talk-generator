// Public share page for one card, e.g. /c/403. Social apps read the Open Graph
// tags to show the card as the link preview; visitors get share buttons, a link
// to order the design and a link to make their own.
import { db } from "../../lib/cards.mjs";

const ORDER_BASE_URL = "https://trashtalk.cloud/";
const INSTAGRAM_URL = "https://www.instagram.com/trashtalk.live/";

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function page({ title, description, imageUrl, shareUrl, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Trash Talk Recycling Station">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(shareUrl)}">
${imageUrl ? `<meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:image" content="${esc(imageUrl)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="icon" type="image/png" href="/assets/ui/favicon.png">
<link rel="apple-touch-icon" href="/assets/ui/favicon.png">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 50% 0, #4a0a57 0, #2A0031 55%, #1a0020 100%); color: #fff; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", "PingFang TC", "Noto Sans TC", sans-serif; display: flex; flex-direction: column; align-items: center; padding: 20px 16px 40px; }
  main { width: 100%; max-width: 480px; display: flex; flex-direction: column; align-items: stretch; gap: 16px; }
  header { display: flex; justify-content: center; }
  header img { width: min(260px, 70vw); height: auto; display: block; }
  h1 { margin: 4px 0 0; font-size: 24px; color: #FFE566; text-align: center; letter-spacing: .3px; }
  .messages { display: flex; flex-direction: column; gap: 10px; }
  .msg { border-radius: 16px; padding: 12px 16px; }
  .msg .label { display: block; font-size: 12px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 4px; }
  .msg p { margin: 0; font-size: 17px; line-height: 1.45; word-break: break-word; }
  .msg.original { background: rgba(255, 255, 255, .06); border: 1.5px dashed rgba(255, 255, 255, .25); }
  .msg.original .label { color: #c9b2d1; }
  .msg.original p { color: #e8d5ee; }
  .msg.recycled { background: rgba(45, 232, 151, .1); border: 2px solid #2DE897; }
  .msg.recycled .label { color: #2DE897; }
  .msg.recycled p { font-weight: 700; font-size: 19px; }
  .arrow { text-align: center; font-size: 20px; line-height: 1; margin: -4px 0; }
  .card { background: #fff; border-radius: 18px; padding: 10px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
  .card img { width: 100%; display: block; border-radius: 10px; }
  .section-title { margin: 0; font-size: 13px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #FFE566; text-align: center; }
  .share { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  .share a, .share button { font: 700 14px/1 inherit; font-family: inherit; border: none; border-radius: 999px; padding: 11px 16px; color: #fff; text-decoration: none; cursor: pointer; }
  .fb { background: #1877F2; } .x { background: #000; } .wa { background: #25D366; } .line { background: #06C755; }
  .th { background: #333; } .copy { background: #FF4CBC; } .native { background: linear-gradient(135deg, #FF4CBC, #FF6B6B); }
  .btn { display: block; text-align: center; font-weight: 800; font-size: 17px; text-decoration: none; border-radius: 999px; padding: 15px 22px; }
  .order { background: linear-gradient(135deg, #FFE566, #FAAF40 45%, #FF8C00); color: #2A0031; box-shadow: 0 4px 16px rgba(250, 175, 64, .45); }
  .make { border: 2px solid #FF4CBC; color: #fff; background: rgba(255, 76, 188, .12); }
  .note { color: #c9b2d1; font-size: 13px; text-align: center; margin: 0; }
  .note a { color: #FFE566; }
</style>
</head>
<body>
<main>
<header><a href="/"><img src="/assets/ui/tt-logo.png" alt="Trash Talk 廢語言物"></a></header>
${body}
</main>
</body>
</html>`;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const number = String(context.params.edition || "").replace(/\D/g, "");
  const fileName = number ? `RecycledTrashTalk${number}.png` : "";
  const [card] = fileName
    ? await db().sql`SELECT file_name, original_message, reply, updated_at FROM cards WHERE file_name = ${fileName} AND kind = 'card' AND image_bytes IS NOT NULL`
    : [];

  if (!card) {
    const html = page({
      title: "Trash Talk Recycling Station",
      description: "Turn your trash talk into a one-of-a-kind recycled card.",
      shareUrl: url.origin,
      body: `<h1>This card isn't here (yet)</h1>
        <p class="note">It may still be saving — try again in a moment.</p>
        <a class="btn make" href="/">Make your Own ✨</a>`,
    });
    return new Response(html, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  const shareUrl = `${url.origin}/c/${number}`;
  const imageUrl = `${url.origin}/api/public/image/${encodeURIComponent(card.file_name)}?v=${new Date(card.updated_at).getTime()}`;
  const title = `Recycled Trash Talk #${number}`;
  const quote = String(card.reply || "").replace(/\s+/g, " ").trim();
  const original = String(card.original_message || "").replace(/\s+/g, " ").trim();
  const description = quote ? `“${quote.slice(0, 180)}” — my trash talk, recycled.` : "My trash talk, recycled. Make yours at Trash Talk Recycling Station.";
  const caption = `🗑️✨ My Trash Talk being Recycled! #${number} ✨🗑️ #trashtalk`;
  const u = encodeURIComponent(shareUrl);
  const t = encodeURIComponent(caption);

  const body = `<h1>${esc(title)}</h1>
  <div class="messages">
    ${original ? `<div class="msg original"><span class="label">Trash Talk</span><p>${esc(original)}</p></div>
    <div class="arrow" aria-hidden="true">♻️</div>` : ""}
    ${quote ? `<div class="msg recycled"><span class="label">Recycled Trash Talk</span><p>${esc(quote)}</p></div>` : ""}
  </div>
  <div class="card"><img src="${esc(imageUrl)}" alt="${esc(title)}"></div>
  <p class="section-title">Share</p>
  <div class="share">
    <button class="native" id="nativeShare" hidden>Share…</button>
    <a class="fb" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${u}">Facebook</a>
    <a class="x" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${u}&text=${t}">X</a>
    <a class="th" target="_blank" rel="noopener" href="https://www.threads.net/intent/post?text=${encodeURIComponent(caption + " " + shareUrl)}">Threads</a>
    <a class="wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(caption + " " + shareUrl)}">WhatsApp</a>
    <a class="line" target="_blank" rel="noopener" href="https://social-plugins.line.me/lineit/share?url=${u}">LINE</a>
    <button class="copy" id="copyLink">Copy link</button>
  </div>
  <a class="btn order" href="${esc(ORDER_BASE_URL)}#d=${esc(number)}">Order this design →</a>
  <a class="btn make" href="/">Make your Own ✨</a>
  <p class="note">Posting to Instagram or TikTok? Save the image above and tag <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener">@trashtalk.live</a>.</p>
  <script>
  (function () {
    var link = ${JSON.stringify(shareUrl)};
    var text = ${JSON.stringify(caption)};
    var copy = document.getElementById('copyLink');
    copy.addEventListener('click', function () {
      var done = function () { copy.textContent = 'Link copied!'; setTimeout(function () { copy.textContent = 'Copy link'; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, function () { prompt('Copy this link:', link); });
      else prompt('Copy this link:', link);
    });
    var native = document.getElementById('nativeShare');
    if (navigator.share) {
      native.hidden = false;
      native.addEventListener('click', function () { navigator.share({ title: document.title, text: text, url: link }).catch(function () {}); });
    }
  })();
  </script>`;

  return new Response(page({ title, description, imageUrl, shareUrl, body }), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" },
  });
};

export const config = {
  path: "/c/:edition",
};
