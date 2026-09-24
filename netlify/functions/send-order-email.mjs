// Emails the customer their order confirmation after checkout.
//
// The browser has always posted to /api/send-order-email, but no function was
// ever deployed behind that path, so every request 404'd and the client silently
// logged "Email send skipped" — order confirmations were never actually sent.
// This function completes that path: it takes the cart the browser submitted and
// sends an itemised confirmation through Resend, with the customer's design
// inlined so they can see exactly what they ordered.
//
// Auth uses the RESEND_API_KEY environment variable. Every confirmation is
// blind-copied to DEFAULT_NOTIFY_EMAIL; set ORDER_NOTIFY_EMAIL to change that.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM_EMAIL = "donotreply@mail.trashtalk.live";
// Who receives a blind copy of each order confirmation.
const DEFAULT_NOTIFY_EMAIL = "happihood@me.com";

const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61590484888659";
const INSTAGRAM_URL = "https://www.instagram.com/trashtalk.live/";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif";

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

// The browser sends plain numbers; anything unparseable is treated as zero so a
// single bad field can never take down the whole confirmation.
function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "US$0.00";
  return `US$${amount.toFixed(2)}`;
}

function toQty(value) {
  const qty = Math.round(Number(value));
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function getLocalizedEmailCopy(inputLanguage) {
  const english = {
    lang: "en",
    title: "Order confirmed — thank you!",
    intro: "We've received your order and we're getting your Recycled Trash Talk design ready. Here's a summary of what you ordered.",
    orderTitle: "Your order",
    shippingTitle: "Shipping to",
    designTitle: "Your design",
    nextTitle: "What happens next",
    nextBody: "We'll be in touch about payment and delivery. Keep this email as your record.",
    footer: "This mailbox is not monitored. Reply to the message we send you about delivery if you need to reach us.",
    followTitle: "Follow the movement",
    followIntro: "Tag us when your order arrives — follow along for new drops, trash-to-treasure stories and more.",
    subtotal: "Subtotal",
    shipping: "Shipping",
    discount: "Discount",
    total: "Total",
    item: "Item",
    qty: "Qty",
    amount: "Amount",
  };
  const localized = {
    traditionalChinese: { lang: "zh-Hant", title: "訂單已確認 — 感謝你！", intro: "我們已收到你的訂單，正在準備你的 Recycled Trash Talk 設計。以下是訂單摘要。", orderTitle: "你的訂單", shippingTitle: "寄送至", designTitle: "你的設計", nextTitle: "接下來", nextBody: "我們會就付款與送達方式與你聯絡。請保留此郵件作為記錄。", footer: "此信箱不作回覆。如需聯絡我們，請回覆我們寄出的送達通知。", followTitle: "追蹤我們", followIntro: "訂單抵達時記得標註我們，追蹤我們看更多新作與環保故事。", subtotal: "小計", shipping: "運費", discount: "折扣", total: "總計", item: "商品", qty: "數量", amount: "金額" },
    simplifiedChinese: { lang: "zh-Hans", title: "订单已确认 — 感谢你！", intro: "我们已收到你的订单，正在准备你的 Recycled Trash Talk 设计。以下是订单摘要。", orderTitle: "你的订单", shippingTitle: "寄送至", designTitle: "你的设计", nextTitle: "接下来", nextBody: "我们会就付款与送达方式与你联络。请保留此邮件作为记录。", footer: "此邮箱不作回复。如需联络我们，请回复我们寄出的送达通知。", followTitle: "关注我们", followIntro: "订单抵达时记得标注我们，关注我们看更多新作与环保故事。", subtotal: "小计", shipping: "运费", discount: "折扣", total: "总计", item: "商品", qty: "数量", amount: "金额" },
    japanese: { lang: "ja", title: "ご注文を承りました — ありがとうございます！", intro: "ご注文を受け付けました。あなたの Recycled Trash Talk デザインを準備しています。以下はご注文内容です。", orderTitle: "ご注文内容", shippingTitle: "お届け先", designTitle: "あなたのデザイン", nextTitle: "次のステップ", nextBody: "お支払いと配送についてご連絡します。このメールは控えとして保管してください。", footer: "このメールボックスは返信を確認していません。ご連絡は配送のご案内メールにご返信ください。", followTitle: "フォローしてね", followIntro: "商品が届いたらタグ付けしてね。新作やエコな取り組みもこちらでチェック。", subtotal: "小計", shipping: "送料", discount: "割引", total: "合計", item: "商品", qty: "数量", amount: "金額" },
    korean: { lang: "ko", title: "주문이 확인되었습니다 — 감사합니다!", intro: "주문을 접수했고 당신의 Recycled Trash Talk 디자인을 준비하고 있습니다. 아래는 주문 내역입니다.", orderTitle: "주문 내역", shippingTitle: "배송지", designTitle: "당신의 디자인", nextTitle: "다음 단계", nextBody: "결제와 배송에 대해 연락드리겠습니다. 이 메일은 기록으로 보관해 주세요.", footer: "이 메일함은 모니터링되지 않습니다. 배송 안내 메일에 답장해 주세요.", followTitle: "팔로우하기", followIntro: "주문이 도착하면 태그해 주세요. 새로운 소식과 업사이클 이야기를 함께 나눠요.", subtotal: "소계", shipping: "배송비", discount: "할인", total: "합계", item: "상품", qty: "수량", amount: "금액" },
  };
  return { english, local: localized[inputLanguage] || null };
}

// Every visitor sees English plus, when we recognise the language they wrote in,
// the same line in their own — matching how the download email reads.
function localizedParagraphs(copy) {
  const e = copy.english;
  const l = copy.local;
  if (!l) return { ...e, english: e };
  const both = (key) => `${e[key]} / ${escapeHtml(l[key])}`;
  return {
    english: e,
    title: `${e.title}<br><span style="font-size:16px;font-weight:700;opacity:.92;">${escapeHtml(l.title)}</span>`,
    intro: `${e.intro}<br><br><span lang="${l.lang}">${escapeHtml(l.intro)}</span>`,
    orderTitle: both("orderTitle"),
    shippingTitle: both("shippingTitle"),
    designTitle: both("designTitle"),
    nextTitle: both("nextTitle"),
    nextBody: `${e.nextBody}<br><span lang="${l.lang}">${escapeHtml(l.nextBody)}</span>`,
    footer: `${e.footer}<br><span lang="${l.lang}">${escapeHtml(l.footer)}</span>`,
    followTitle: both("followTitle"),
    followIntro: `${e.followIntro}<br><span lang="${l.lang}">${escapeHtml(l.followIntro)}</span>`,
    subtotal: both("subtotal"),
    shipping: both("shipping"),
    discount: both("discount"),
    total: both("total"),
    item: both("item"),
    qty: both("qty"),
    amount: both("amount"),
  };
}

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const apiKey = Netlify.env.get("RESEND_API_KEY") || Netlify.env.get("Resend_API");
  if (!apiKey) {
    // Nothing we can do without a key — fail soft, exactly as the download email
    // does, so a missing key never breaks the checkout the customer just went
    // through.
    console.error("send-order-email: RESEND_API_KEY env var is not set");
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

  const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const shippingAddress = typeof body.shippingAddress === "string" ? body.shippingAddress.trim() : "";
  const shippingRegion = typeof body.shippingRegion === "string" ? body.shippingRegion : "";
  const designFileName = typeof body.designFileName === "string" ? body.designFileName : "RecycledTrashTalk.png";
  const editionMatch = designFileName.match(/RecycledTrashTalk(\d+)/i);
  const edition = editionMatch ? editionMatch[1] : "";
  const editionLabel = edition ? ` #${escapeHtml(edition)}` : "";
  const originalMessage = typeof body.originalMessage === "string" ? body.originalMessage : "";
  const aiResponse = typeof body.aiResponse === "string" ? body.aiResponse : "";
  const inputLanguage = typeof body.inputLanguage === "string" ? body.inputLanguage : "english";
  const copy = localizedParagraphs(getLocalizedEmailCopy(inputLanguage));

  const products = Array.isArray(body.products) ? body.products.slice(0, 40) : [];
  const rows = products
    .map((item) => {
      const name = escapeHtml(item && item.name ? item.name : "Product");
      const qty = toQty(item && item.qty);
      const lineTotal = item && item.lineTotal != null ? item.lineTotal : Number(item && item.price) * qty;
      return `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;font:600 15px/1.4 ${FONT};color:#2A0031;">${name}</td>
          <td align="center" style="padding:10px 8px;border-bottom:1px solid #eee;font:400 15px/1.4 ${FONT};color:#6b4d7a;">${qty}</td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #eee;font:700 15px/1.4 ${FONT};color:#2A0031;">${escapeHtml(money(lineTotal))}</td>
        </tr>`;
    })
    .join("");

  const totalLine = (label, value, strong) =>
    `<tr>
        <td colspan="2" style="padding:${strong ? "12px 0 0" : "6px 0 0"};font:${strong ? "800 17px" : "400 14px"}/1.4 ${FONT};color:#2A0031;">${label}</td>
        <td align="right" style="padding:${strong ? "12px 0 0" : "6px 0 0"};font:${strong ? "800 17px" : "600 14px"}/1.4 ${FONT};color:${strong ? "#FF4757" : "#2A0031"};">${escapeHtml(value)}</td>
      </tr>`;

  const discount = body.discount && Number(body.discount.amount) > 0 ? body.discount : null;
  const totals = [
    totalLine(copy.subtotal, money(body.subtotal), false),
    discount
      ? totalLine(
          `${copy.discount}${discount.label ? ` (${escapeHtml(discount.label)})` : ""}`,
          `-${money(discount.amount)}`,
          false
        )
      : "",
    totalLine(
      `${copy.shipping}${shippingRegion ? ` (${escapeHtml(shippingRegion)})` : ""}`,
      money(body.shippingFee),
      false
    ),
    totalLine(copy.total, money(body.total), true),
  ].join("");

  const orderTable = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td style="padding:0 0 6px;font:700 12px/1.4 ${FONT};color:#8a7a93;text-transform:uppercase;letter-spacing:.04em;">${copy.item}</td>
        <td align="center" style="padding:0 8px 6px;font:700 12px/1.4 ${FONT};color:#8a7a93;text-transform:uppercase;letter-spacing:.04em;">${copy.qty}</td>
        <td align="right" style="padding:0 0 6px;font:700 12px/1.4 ${FONT};color:#8a7a93;text-transform:uppercase;letter-spacing:.04em;">${copy.amount}</td>
      </tr>
      ${rows}
      ${totals}
    </table>`;

  // Inline the design (referenced from the HTML with cid:) so the confirmation
  // shows the artwork rather than just naming the file.
  const attachments = [];
  const designParsed = splitDataUrl(body.designImageBase64);
  let designSection = "";
  if (designParsed) {
    attachments.push({
      filename: designFileName,
      content: designParsed.base64,
      content_type: designParsed.contentType || "image/png",
      content_id: "ordered-design",
    });
    designSection = `<tr><td align="center" style="padding:6px 28px 22px;">
          <div style="font:800 17px/1.4 ${FONT};color:#2A0031;margin:0 0 10px;">${copy.designTitle}</div>
          <img src="cid:ordered-design" alt="The Recycled Trash Talk design you ordered" width="300" style="width:100%;max-width:300px;border-radius:16px;border:1px solid #eee;display:block;background:#fff;" />
        </td></tr>`;
  }

  const addressBlock = shippingAddress
    ? `<tr><td style="padding:6px 28px 18px;">
          <div style="font:800 17px/1.4 ${FONT};color:#2A0031;margin:0 0 6px;">${copy.shippingTitle}</div>
          <p style="font:400 14px/1.6 ${FONT};color:#6b4d7a;margin:0;white-space:pre-line;">${escapeHtml(
            [customerName, shippingAddress, phone].filter(Boolean).join("\n")
          )}</p>
        </td></tr>`
    : "";

  const quoteBlock = aiResponse || originalMessage
    ? `<p style="font:italic 16px/1.5 ${FONT};color:#6b4d7a;text-align:center;margin:4px 0 18px;">&ldquo;${escapeHtml(aiResponse || originalMessage)}&rdquo;</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4eef7;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4eef7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:92%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 6px 24px rgba(42,0,49,0.12);">
        <tr><td style="background:linear-gradient(135deg,#2A0031,#5a1a6b);padding:26px 28px;text-align:center;">
          <div style="font:800 22px/1.3 ${FONT};color:#fff;">${copy.title}</div>
        </td></tr>
        <tr><td style="padding:26px 28px 8px;">
          <p style="font:400 16px/1.55 ${FONT};color:#2A0031;margin:0 0 16px;">${copy.intro}</p>
          ${quoteBlock}
        </td></tr>
        ${designSection}
        <tr><td style="padding:6px 28px 4px;">
          <div style="font:800 17px/1.4 ${FONT};color:#2A0031;margin:0 0 12px;">${copy.orderTitle}${editionLabel}</div>
        </td></tr>
        <tr><td style="padding:0 28px 18px;">
          ${orderTable}
        </td></tr>
        ${addressBlock}
        <tr><td style="padding:6px 28px 22px;border-top:1px solid #eee;">
          <div style="font:800 16px/1.4 ${FONT};color:#2A0031;margin:16px 0 4px;">${copy.nextTitle}</div>
          <p style="font:400 14px/1.5 ${FONT};color:#6b4d7a;margin:0;">${copy.nextBody}</p>
        </td></tr>
        <tr><td style="padding:6px 28px 22px;text-align:center;border-top:1px solid #eee;">
          <div style="font:800 16px/1.4 ${FONT};color:#2A0031;margin:16px 0 4px;">${copy.followTitle}</div>
          <p style="font:400 13px/1.5 ${FONT};color:#6b4d7a;margin:0 0 14px;">${copy.followIntro}</p>
          <a href="${escapeHtml(INSTAGRAM_URL)}" style="display:inline-block;margin:0 6px;background:linear-gradient(135deg,#F58529,#DD2A7B 50%,#8134AF);color:#fff;text-decoration:none;font:800 14px/1 ${FONT};padding:11px 20px;border-radius:24px;">Instagram</a>
          <a href="${escapeHtml(FACEBOOK_URL)}" style="display:inline-block;margin:0 6px;background:#1877F2;color:#fff;text-decoration:none;font:800 14px/1 ${FONT};padding:11px 20px;border-radius:24px;">Facebook</a>
          <div style="font:600 12px/1.5 ${FONT};color:#8a7a93;margin-top:10px;">@trashtalk.live</div>
        </td></tr>
        <tr><td style="background:#faf6fc;padding:18px 28px;text-align:center;border-top:1px solid #eee;">
          <p style="font:400 13px/1.5 ${FONT};color:#8a7a93;margin:0;">${copy.footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `${copy.english.title} (Recycled Trash Talk${edition ? ` #${edition}` : ""})`,
    "",
    copy.english.intro,
    "",
    `${copy.english.orderTitle}:`,
    ...products.map((item) => {
      const qty = toQty(item && item.qty);
      const lineTotal = item && item.lineTotal != null ? item.lineTotal : Number(item && item.price) * qty;
      return `${item && item.name ? item.name : "Product"} x${qty}: ${money(lineTotal)}`;
    }),
    `${copy.english.subtotal}: ${money(body.subtotal)}`,
    discount ? `${copy.english.discount}: -${money(discount.amount)}` : null,
    `${copy.english.shipping}: ${money(body.shippingFee)}`,
    `${copy.english.total}: ${money(body.total)}`,
    "",
    shippingAddress ? `${copy.english.shippingTitle}:` : null,
    shippingAddress ? [customerName, shippingAddress, phone].filter(Boolean).join("\n") : null,
    shippingAddress ? "" : null,
    copy.english.nextBody,
    "",
    "Follow us @trashtalk.live:",
    `Instagram: ${INSTAGRAM_URL}`,
    `Facebook: ${FACEBOOK_URL}`,
  ]
    // Only the conditional lines above are dropped; the deliberate "" entries
    // are the paragraph breaks and have to survive.
    .filter((line) => line !== null)
    .join("\n");

  const payload = {
    from: FROM_EMAIL,
    to: [customerEmail],
    subject: `Your Recycled Trash Talk order${editionLabel} is confirmed`,
    html,
    text,
  };
  if (attachments.length) payload.attachments = attachments;

  // Shop copy, so a confirmed order is visible to a human without digging
  // through logs. Skipped when the customer is that same address, since Resend
  // would then deliver it twice.
  const notifyEmail = (Netlify.env.get("ORDER_NOTIFY_EMAIL") || DEFAULT_NOTIFY_EMAIL).trim();
  if (isValidEmail(notifyEmail) && notifyEmail.toLowerCase() !== customerEmail.toLowerCase()) {
    payload.bcc = [notifyEmail];
  }

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
      console.error("send-order-email: Resend error", resp.status, detail);
      return Response.json({ success: false, error: "Email provider rejected the request" }, { status: 502 });
    }

    const data = await resp.json().catch(() => ({}));
    return Response.json({ success: true, id: data && data.id ? data.id : null });
  } catch (err) {
    console.error("send-order-email: send failed", err && err.message ? err.message : err);
    return Response.json({ success: false, error: "Failed to send email" }, { status: 500 });
  }
};

export const config = {
  path: "/api/send-order-email",
};
