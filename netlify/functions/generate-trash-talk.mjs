// Generates the short "trash talk" quote for the card design.
// The browser builds the full instruction prompt (language lock + creative
// direction + the user's message) and posts it here.
//
// Provider order: DeepSeek first (DEEPSEEK_API_KEY env var), then Claude through
// the Netlify AI Gateway as a fallback. Keeping both server-side means no API
// keys ever live in client-side code.

const DEEPSEEK_MODEL = "deepseek-chat";
const CLAUDE_MODEL = "claude-haiku-4-5";

async function callDeepSeek(prompt) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return "";
  try {
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: 200,
        temperature: 1,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) return "";
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text.trim() : "";
  } catch {
    return "";
  }
}

async function callClaude(prompt) {
  const base = process.env.NETLIFY_AI_GATEWAY_BASE_URL;
  const key = process.env.NETLIFY_AI_GATEWAY_KEY;
  // If the gateway is unavailable, return empty so the client falls back gracefully.
  if (!base || !key) return "";
  try {
    const resp = await fetch(`${base}/anthropic/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 200,
        temperature: 1,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) return "";
    const data = await resp.json();
    return Array.isArray(data.content)
      ? data.content
          .map((block) => (block && typeof block.text === "string" ? block.text : ""))
          .join("")
          .trim()
      : "";
  } catch {
    return "";
  }
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let prompt = "";
  try {
    const body = await req.json();
    prompt = body && typeof body.prompt === "string" ? body.prompt : "";
  } catch {
    return Response.json({ result: "" }, { status: 400 });
  }
  if (!prompt.trim()) {
    return Response.json({ result: "" }, { status: 400 });
  }

  // DeepSeek first, Claude as the fallback.
  let result = await callDeepSeek(prompt);
  if (!result) {
    result = await callClaude(prompt);
  }

  return Response.json({ result });
};

export const config = {
  path: "/api/generate-trash-talk",
};
