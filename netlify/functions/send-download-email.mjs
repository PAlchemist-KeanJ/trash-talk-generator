// Emails the visitor their finished "Recycled Trash Talk" design.
//
// The browser posts the customer's email plus their created design (and, when
// it can build them, small composited product mockups). This function sends a
// confirmation email through Resend that shows the design they made, the
// product mockups with prices so they can order from this email, and
// a reminder that they're free to share the image.
//
// Auth uses the RESEND_API_KEY environment variable.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM_EMAIL = "donotreply@mail.trashtalk.live";
const DEFAULT_SITE_URL = "https://trashtalkrecyclingstation.netlify.app";
const DEFAULT_ORDER_BASE_URL = "https://preview--trash-talk-recycled.base44.app/";
const DEFAULT_ORDER_FALLBACK_URL = "https://trashtalk.live/treasure-talks#treasure-talk";

// Social channels we invite the customer to follow from the email.
const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61590484888659";
const INSTAGRAM_URL = "https://www.instagram.com/trashtalk.live/";

// Shown when the browser could not composite mockups (e.g. cross-origin
// images) so the customer still sees what's available and the prices.
const FALLBACK_PRODUCTS = [
  { name: "White T-Shirt Free Size", priceLabel: "US$25" },
  { name: "Grey T-Shirt Free Size", priceLabel: "US$25" },
  { name: "Phone Case", priceLabel: "US$22" },
  { name: "Tote Bag", priceLabel: "US$20" },
  { name: "Canvas Wall Art", priceLabel: "from US$20" },
];

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Splits a `data:` URL into its content type and raw base64 payload.
function splitDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]*)$/);
  if (!match) return null;
  return { contentType: match[1], base64: match[2] };
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getMockupFileName(mockup, designFileName, index) {
  const baseName = String(designFileName || "RecycledTrashTalk").replace(/\.png$/i, "");
  const suffixes = {
    canvas_wall: "_CanvasWallArt.png",
    tshirt_grey: "_GreyTShirtFreeSize.png",
    phonecase: "_PhoneCase.png",
    totebag: "_ToteBag.png",
    tshirt_white: "_WhiteTShirtFreeSize.png",
  };
  if (mockup && typeof mockup.fileName === "string" && mockup.fileName.endsWith(".png")) {
    return mockup.fileName;
  }
  const suffix = suffixes[mockup && mockup.id] || `_Mockup${index + 1}.png`;
  return `${baseName}${suffix}`;
}

function getLocalizedEmailCopy(inputLanguage) {
  const english = {
    lang: "en",
    title: "Your Recycled Trash Talk is ready!",
    intro: "Here's the one-of-a-kind design you just created. It's yours to download, keep, and share with anyone, anywhere.",
    productsTitle: "Want it on something real?",
    productsIntro: "Here's how your design looks on our products. When you're ready, use the button below to order this design.",
    cta: "Order now",
    footer: "This mailbox is not monitored, but you can use the order button whenever you're ready to purchase.",
    subjectKeepShare: "yours to keep & share",
    followTitle: "Follow the movement",
    followIntro: "Tag us when you wear or share your design — follow along for new drops, trash-to-treasure stories and more.",
  };
  const localized = {
    traditionalChinese: { lang: "zh-Hant", title: "你的 Recycled Trash Talk 已準備好！", intro: "這是你剛剛創作的獨一無二設計。你可以下載、保存，也可以自由分享給任何人。", productsTitle: "想把它做成實物嗎？", productsIntro: "下面是你的設計放在產品上的效果。準備好時，使用下方按鈕訂購這個設計。", cta: "立即訂購", footer: "此信箱不作回覆，但你可以隨時使用訂購按鈕購買。", followTitle: "追蹤我們", followIntro: "穿上或分享你的設計時記得標註我們，追蹤我們看更多新作與環保故事。" },
    simplifiedChinese: { lang: "zh-Hans", title: "你的 Recycled Trash Talk 已准备好！", intro: "这是你刚刚创作的独一无二设计。你可以下载、保存，也可以自由分享给任何人。", productsTitle: "想把它做成实物吗？", productsIntro: "下面是你的设计放在产品上的效果。准备好时，使用下方按钮订购这个设计。", cta: "立即订购", footer: "此邮箱不作回复，但你可以随时使用订购按钮购买。", followTitle: "关注我们", followIntro: "穿上或分享你的设计时记得标注我们，关注我们看更多新作与环保故事。" },
    japanese: { lang: "ja", title: "あなたの Recycled Trash Talk が完成しました！", intro: "これは、あなたが作った世界にひとつだけのデザインです。ダウンロードして保存し、自由にシェアできます。", productsTitle: "実物アイテムにしてみますか？", productsIntro: "あなたのデザインを商品に載せたイメージです。注文したくなったら、下のボタンからこのデザインを注文できます。", cta: "今すぐ注文", footer: "このメールボックスは返信を確認していません。購入したい時は注文ボタンを使ってください。", followTitle: "フォローしてね", followIntro: "デザインを着たりシェアするときはタグ付けしてね。新作やエコな取り組みもこちらでチェック。" },
    korean: { lang: "ko", title: "당신의 Recycled Trash Talk 디자인이 준비됐어요!", intro: "방금 만든 단 하나뿐인 디자인입니다. 다운로드하고 보관하고 자유롭게 공유할 수 있어요.", productsTitle: "실물 상품으로 만들어볼까요?", productsIntro: "아래는 당신의 디자인을 상품에 올린 모습입니다. 준비되면 아래 버튼으로 이 디자인을 주문할 수 있습니다.", cta: "지금 주문", footer: "이 메일함은 모니터링되지 않습니다. 구매할 준비가 되면 주문 버튼을 사용해 주세요.", followTitle: "팔로우하기", followIntro: "디자인을 입거나 공유할 때 태그해 주세요. 새로운 소식과 업사이클 이야기를 함께 나눠요." },
  };
  return { english, local: localized[inputLanguage] || null };
}

function localizedParagraphs(copy) {
  if (!copy.local) {
    return copy.english;
  }
  const e = copy.english;
  const l = copy.local;
  return {
    title: e.title + '<br><span style="font-size:16px;font-weight:700;opacity:.92;">' + escapeHtml(l.title) + '</span>',
    intro: e.intro + '<br><br><span lang="' + l.lang + '">' + escapeHtml(l.intro) + '</span>',
    productsTitle: e.productsTitle + '<br><span lang="' + l.lang + '" style="font-size:14px;font-weight:700;">' + escapeHtml(l.productsTitle) + '</span>',
    productsIntro: e.productsIntro + '<br><br><span lang="' + l.lang + '">' + escapeHtml(l.productsIntro) + '</span>',
    cta: e.cta + ' / ' + escapeHtml(l.cta),
    footer: e.footer + '<br><span lang="' + l.lang + '">' + escapeHtml(l.footer) + '</span>',
    subjectKeepShare: e.subjectKeepShare,
    followTitle: e.followTitle + ' / ' + escapeHtml(l.followTitle),
    followIntro: e.followIntro + '<br><span lang="' + l.lang + '">' + escapeHtml(l.followIntro) + '</span>',
  };
}

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const apiKey = Netlify.env.get("RESEND_API_KEY") || Netlify.env.get("Resend_API");
  if (!apiKey) {
    // Nothing we can do without a key — fail soft so the client download flow
    // (which fires this fire-and-forget) is never disrupted.
    console.error("send-download-email: RESEND_API_KEY env var is not set");
    return Response.json({ success: false, error: "Email service not configured" }, { status: 200 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const customerEmail = (body.customerEmail || "").trim();
  if (!isValidEmail(customerEmail)) {
    return Response.json({ success: false, error: "Invalid email address" }, { status: 400 });
  }

  const siteUrl = typeof body.siteUrl === "string" && body.siteUrl.startsWith("http")
    ? body.siteUrl
    : DEFAULT_SITE_URL;
  const designFileName = typeof body.designFileName === "string" ? body.designFileName : "RecycledTrashTalk.png";
  const editionMatch = designFileName.match(/RecycledTrashTalk(\d+)/i);
  const edition = editionMatch ? editionMatch[1] : "";
  const orderBaseUrl = typeof body.orderBaseUrl === "string" && body.orderBaseUrl.startsWith("http")
    ? body.orderBaseUrl
    : DEFAULT_ORDER_BASE_URL;
  const orderFallbackUrl = typeof body.orderFallbackUrl === "string" && body.orderFallbackUrl.startsWith("http")
    ? body.orderFallbackUrl
    : DEFAULT_ORDER_FALLBACK_URL;
  const orderUrl = edition
    ? `${orderBaseUrl}${orderBaseUrl.includes("?") ? "&" : "?"}d=${encodeURIComponent(edition)}`
    : orderFallbackUrl;
  const originalMessage = typeof body.originalMessage === "string" ? body.originalMessage : "";
  const aiResponse = typeof body.aiResponse === "string" ? body.aiResponse : "";
  const inputLanguage = typeof body.inputLanguage === "string" ? body.inputLanguage : "english";
  const emailCopy = localizedParagraphs(getLocalizedEmailCopy(inputLanguage));

  // Build inline attachments (referenced from the HTML with cid:).
  const attachments = [];
  const designParsed = splitDataUrl(body.designImageBase64);
  const designCid = "created-design";
  let designSection = "";
  if (designParsed) {
    attachments.push({
      filename: designFileName,
      content: designParsed.base64,
      content_type: designParsed.contentType || "image/png",
      content_id: designCid,
    });
    designSection = `<tr><td align="center" style="padding:2px 28px 22px;">
          <img src="cid:${designCid}" alt="Your generated Recycled Trash Talk design" width="320" style="width:100%;max-width:320px;border-radius:16px;border:1px solid #eee;display:block;background:#fff;" />
        </td></tr>`;
  }

  // Composited product mockups (design shown on each product), if provided.
  const mockups = Array.isArray(body.mockups) ? body.mockups.slice(0, 8) : [];
  const mockupCards = [];
  mockups.forEach((mockup, index) => {
    const name = escapeHtml(mockup && mockup.name ? mockup.name : "Product");
    const priceLabel = escapeHtml(mockup && mockup.priceLabel ? mockup.priceLabel : "");
    const parsed = mockup && splitDataUrl(mockup.imageBase64);
    if (parsed) {
      const cid = `mockup-${index}`;
      attachments.push({
        filename: getMockupFileName(mockup, designFileName, index),
        content: parsed.base64,
        content_type: parsed.contentType || "image/png",
        content_id: cid,
      });
      mockupCards.push(
        `<td align="center" valign="top" style="padding:8px;width:50%;">
          <img src="cid:${cid}" alt="${name}" width="220" style="width:100%;max-width:220px;border-radius:12px;border:1px solid #eee;display:block;" />
          <div style="font:600 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#2A0031;margin-top:8px;">${name}</div>
          <div style="font:700 15px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#FF4757;">${priceLabel}</div>
        </td>`
      );
    }
  });

  // Fall back to a text-only price list if no mockup images came through.
  let productsSection;
  if (mockupCards.length) {
    const rows = [];
    for (let i = 0; i < mockupCards.length; i += 2) {
      rows.push(`<tr>${mockupCards[i]}${mockupCards[i + 1] || '<td style="width:50%;"></td>'}</tr>`);
    }
    productsSection = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rows.join("")}</table>`;
  } else {
    const items = FALLBACK_PRODUCTS.map(
      (p) =>
        `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;font:600 15px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#2A0031;">${escapeHtml(p.name)}</td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #eee;font:700 15px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#FF4757;">${escapeHtml(p.priceLabel)}</td>
        </tr>`
    ).join("");
    productsSection = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${items}</table>`;
  }

  const quoteBlock = aiResponse || originalMessage
    ? `<p style="font:italic 16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#6b4d7a;text-align:center;margin:4px 0 18px;">&ldquo;${escapeHtml(aiResponse || originalMessage)}&rdquo;</p>`
    : "";

  const editionLabel = edition ? ` #${escapeHtml(edition)}` : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4eef7;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4eef7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:92%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 6px 24px rgba(42,0,49,0.12);">
        <tr><td style="background:linear-gradient(135deg,#2A0031,#5a1a6b);padding:26px 28px;text-align:center;">
          <div style="font:800 22px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#fff;">${emailCopy.title}${editionLabel}</div>
        </td></tr>
        <tr><td style="padding:26px 28px 8px;">
          <p style="font:400 16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#2A0031;margin:0 0 16px;">${emailCopy.intro}</p>
          ${quoteBlock}
        </td></tr>
        ${designSection}
        <tr><td style="padding:6px 28px 4px;">
          <div style="font:800 17px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#2A0031;margin:0 0 4px;">${emailCopy.productsTitle}</div>
          <p style="font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#6b4d7a;margin:0 0 14px;">${emailCopy.productsIntro}</p>
        </td></tr>
        <tr><td style="padding:0 20px 8px;">
          ${productsSection}
        </td></tr>
        <tr><td align="center" style="padding:18px 28px 28px;">
          <a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:linear-gradient(135deg,#FFE566,#FAAF40 45%,#FF8C00);color:#2A0031;text-decoration:none;font:800 16px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;padding:15px 30px;border-radius:30px;">${emailCopy.cta} →</a>
        </td></tr>
        <tr><td style="padding:6px 28px 22px;text-align:center;border-top:1px solid #eee;">
          <div style="font:800 16px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#2A0031;margin:16px 0 4px;">${emailCopy.followTitle}</div>
          <p style="font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#6b4d7a;margin:0 0 14px;">${emailCopy.followIntro}</p>
          <a href="${escapeHtml(INSTAGRAM_URL)}" style="display:inline-block;margin:0 6px;background:linear-gradient(135deg,#F58529,#DD2A7B 50%,#8134AF);color:#fff;text-decoration:none;font:800 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;padding:11px 20px;border-radius:24px;">Instagram</a>
          <a href="${escapeHtml(FACEBOOK_URL)}" style="display:inline-block;margin:0 6px;background:#1877F2;color:#fff;text-decoration:none;font:800 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;padding:11px 20px;border-radius:24px;">Facebook</a>
          <div style="font:600 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#8a7a93;margin-top:10px;">@trashtalk.live</div>
        </td></tr>
        <tr><td style="background:#faf6fc;padding:18px 28px;text-align:center;border-top:1px solid #eee;">
          <p style="font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#8a7a93;margin:0;">${emailCopy.footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const subject = `Your Recycled Trash Talk design${editionLabel} - ${emailCopy.subjectKeepShare}`;
  const text = [
    `Your Recycled Trash Talk design${editionLabel} is ready.`,
    "",
    emailCopy.english ? emailCopy.english.intro : "Your generated design is attached and ready to share.",
    "",
    `Order this design: ${orderUrl}`,
    "",
    "Products:",
    ...FALLBACK_PRODUCTS.map((p) => `${p.name}: ${p.priceLabel}`),
    "",
    "Follow us @trashtalk.live:",
    `Instagram: ${INSTAGRAM_URL}`,
    `Facebook: ${FACEBOOK_URL}`,
  ].join("\n");

  const payload = {
    from: FROM_EMAIL,
    to: [customerEmail],
    subject,
    html,
    text,
  };
  if (attachments.length) payload.attachments = attachments;

  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("send-download-email: Resend error", resp.status, detail);
      return Response.json({ success: false, error: "Email provider rejected the request" }, { status: 502 });
    }

    const data = await resp.json().catch(() => ({}));
    return Response.json({ success: true, id: data && data.id ? data.id : null });
  } catch (err) {
    console.error("send-download-email: send failed", err && err.message ? err.message : err);
    return Response.json({ success: false, error: "Failed to send email" }, { status: 500 });
  }
};

export const config = {
  path: "/api/send-download-email",
};
