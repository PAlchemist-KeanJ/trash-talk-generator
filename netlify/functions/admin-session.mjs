import { checkPassword, clearedCookie, isAdmin, isConfigured, sessionCookie } from "../../lib/admin-auth.mjs";

export default async (req) => {
  const action = new URL(req.url).pathname.split("/").pop();

  if (action === "session" && req.method === "GET") {
    return Response.json({ loggedIn: isAdmin(req), configured: isConfigured() });
  }

  if (action === "login" && req.method === "POST") {
    if (!isConfigured()) {
      return Response.json({ error: "ADMIN_PASSWORD is not set in the Netlify dashboard yet." }, { status: 503 });
    }
    const body = await req.json().catch(() => ({}));
    if (!checkPassword(body.password)) {
      // Slow down password guessing.
      await new Promise((r) => setTimeout(r, 1000));
      return Response.json({ error: "Wrong password" }, { status: 401 });
    }
    return Response.json({ loggedIn: true }, { headers: { "Set-Cookie": sessionCookie() } });
  }

  if (action === "logout" && req.method === "POST") {
    return Response.json({ loggedIn: false }, { headers: { "Set-Cookie": clearedCookie() } });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
};

export const config = {
  path: ["/api/admin/session", "/api/admin/login", "/api/admin/logout"],
};
