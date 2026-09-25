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
<link rel="icon" href="/assets/ui/bin-full.png">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #2A0031; color: #fff; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", "PingFang TC", "Noto Sans TC", sans-serif; display: flex; flex-direction: column; align-items: center; padding: 24px 16px 40px; }
  header img { height: 56px; display: block; }
  h1 { margin: 18px 0 4px; font-size: 22px; color: #FFE566; text-align: center; }
  .quote { margin: 0 0 18px; color: #e8d5ee; font-style: italic; text-align: center; max-width: 520px; }
  .card { width: 100%; max-width: 480px; background: #fff; border-radius: 18px; padding: 12px; box-shadow: 0 10px 40px rgba(0,0,0,.35); }
  .card img { width: 100%; display: block; border-radius: 10px; }
  .share { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 20px 0 8px; max-width: 520px; }
  .share a, .share button { font: 700 14px/1 inherit; font-family: inherit; border: none; border-radius: 999px; padding: 11px 16px; color: #fff; text-decoration: none; cursor: pointer; }
  .fb { background: #1877F2; } .x { background: #000; } .wa { background: #25D366; } .line { background: #06C755; }
  .th { background: #333; } .copy { background: #FF4CBC; } .native { background: linear-gradient(135deg, #FF4CBC, #FF6B6B); }
  .cta { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 14px; }
  .cta a { font-weight: 800; text-decoration: none; border-radius: 999px; padding: 13px 22px; }
  .order { background: linear-gradient(135deg, #FFE566, #FAAF40 45%, #FF8C00); color: #2A0031; }
  .make { border: 2px solid #FF4CBC; color: #fff; }
  .note { color: #c9b2d1; font-size: 13px; margin-top: 18px; text-align: center; }
  .note a { color: #FFE566; }
</style>
</head>
<body>
<header><a href="/"><img src="/assets/ui/logo-banner.png" alt="Trash Talk Recycling Station"></a></header>
${body}
</body>
</html>`;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const number = String(context.params.edition || "").replace(/\D/g, "");
  const fileName = number ? `RecycledTrashTalk${number}.png` : "";
  const [card] = fileName
    ? await db().sql`SELECT file_name, reply, updated_at FROM cards WHERE file_name = ${fileName} AND kind = 'card' AND image_bytes IS NOT NULL`
    : [];

  if (!card) {
    const html = page({
      title: "Trash Talk Recycling Station",
      description: "Turn your trash talk into a one-of-a-kind recycled card.",
      shareUrl: url.origin,
      body: `<h1>This card isn't here (yet)</h1>
        <p class="quote">It may still be saving — try again in a moment.</p>
        <div class="cta"><a class="make" href="/">Make your own Recycled Trash Talk</a></div>`,
    });
    return new Response(html, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  const shareUrl = `${url.origin}/c/${number}`;
  const imageUrl = `${url.origin}/api/public/image/${encodeURIComponent(card.file_name)}?v=${new Date(card.updated_at).getTime()}`;
  const title = `Recycled Trash Talk #${number}`;
  const quote = String(card.reply || "").replace(/\s+/g, " ").trim();
  const description = quote ? `“${quote.slice(0, 180)}” — my trash talk, recycled.` : "My trash talk, recycled. Make yours at Trash Talk Recycling Station.";
  const caption = `🗑️✨ My Trash Talk being Recycled! #${number} ✨🗑️ #trashtalk`;
  const u = encodeURIComponent(shareUrl);
  const t = encodeURIComponent(caption);

  const body = `<h1>${esc(title)}</h1>
  ${quote ? `<p class="quote">“${esc(quote)}”</p>` : ""}
  <div class="card"><img src="${esc(imageUrl)}" alt="${esc(title)}"></div>
  <div class="share">
    <button class="native" id="nativeShare" hidden>Share…</button>
    <a class="fb" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${u}">Facebook</a>
    <a class="x" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${u}&text=${t}">X</a>
    <a class="th" target="_blank" rel="noopener" href="https://www.threads.net/intent/post?text=${encodeURIComponent(caption + " " + shareUrl)}">Threads</a>
    <a class="wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(caption + " " + shareUrl)}">WhatsApp</a>
    <a class="line" target="_blank" rel="noopener" href="https://social-plugins.line.me/lineit/share?url=${u}">LINE</a>
    <button class="copy" id="copyLink">Copy link</button>
  </div>
  <div class="cta">
    <a class="order" href="${esc(ORDER_BASE_URL)}#d=${esc(number)}">Order this design →</a>
    <a class="make" href="/">Make your own</a>
  </div>
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
