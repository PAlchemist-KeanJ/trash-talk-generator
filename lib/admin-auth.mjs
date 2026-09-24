// Single-password admin login. The password is the ADMIN_PASSWORD environment
// variable; a signed, HttpOnly session cookie keeps the admin logged in.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "tt_admin";
const SESSION_SECONDS = 7 * 24 * 60 * 60;

function adminPassword() {
  return (Netlify.env.get("ADMIN_PASSWORD") || "").trim();
}

function sign(value, password) {
  const key = createHash("sha256").update(`trash-talk-admin:${password}`).digest();
  return createHmac("sha256", key).update(value).digest("base64url");
}

function sameText(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export function isConfigured() {
  return adminPassword().length > 0;
}

export function checkPassword(candidate) {
  const password = adminPassword();
  return password.length > 0 && sameText(candidate || "", password);
}

export function sessionCookie() {
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  const token = `${expires}.${sign(expires, adminPassword())}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearedCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function isAdmin(req) {
  const password = adminPassword();
  if (!password) return false;
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return false;
  const [expires, signature] = match[1].split(".");
  if (!expires || !signature || Number(expires) * 1000 < Date.now()) return false;
  return sameText(signature, sign(expires, password));
}

export function unauthorized() {
  return Response.json({ error: "Not logged in" }, { status: 401 });
}
