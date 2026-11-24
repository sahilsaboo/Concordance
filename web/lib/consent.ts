// Educational-use acknowledgment. Enforced on the server (proxy.ts), so no page content is sent until the
// visitor has explicitly accepted. The cookie is HMAC-signed so it can't be forged from the browser console.
// Uses Web Crypto only, so it runs in the proxy and in route handlers alike.

/** Bump this whenever the acknowledgment text changes; everyone must accept the new version. */
export const CONSENT_VERSION = "2026-11-23";
export const CONSENT_COOKIE = "concordance_ack";
/** Ask again after 30 days. */
export const CONSENT_MAX_AGE_S = 60 * 60 * 24 * 30;
export const ACCEPT_PATH = "/accept";
export const ACCEPT_API_PATH = "/api/accept";

const DEV_ONLY_SECRET = "dev-only-insecure-consent-secret";

/**
 * Signing secret. Required in production (set CONSENT_SECRET in the host's environment variables).
 * Returns null if it's missing in production, and callers then fail closed: nobody gets in.
 */
export function consentSecret(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.CONSENT_SECRET;
  if (s && s.length >= 32) return s;
  return env.NODE_ENV === "production" ? null : DEV_ONLY_SECRET;
}

const enc = new TextEncoder();

function toB64Url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toB64Url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time string compare, so signature checks don't leak timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Cookie value: `<version>.<issuedAtSeconds>.<signature>` */
export async function signConsent(secret: string, nowS = Math.floor(Date.now() / 1000)): Promise<string> {
  const payload = `${CONSENT_VERSION}.${nowS}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function isValidConsent(
  value: string | undefined,
  secret: string | null,
  nowS = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!value || !secret) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [version, issuedRaw, sig] = parts;
  if (version !== CONSENT_VERSION) return false;
  const issued = Number(issuedRaw);
  if (!Number.isInteger(issued) || issued > nowS + 60 || nowS - issued > CONSENT_MAX_AGE_S) return false;
  return safeEqual(sig, await hmac(secret, `${version}.${issuedRaw}`));
}

/**
 * Where to send the visitor after accepting. Only same-site relative paths are allowed, so the accept
 * page can't be used to bounce people to another website (open redirect).
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.startsWith(ACCEPT_PATH) || raw.startsWith(ACCEPT_API_PATH)) return "/";
  try {
    const u = new URL(raw, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return "/";
    return u.pathname + u.search;
  } catch {
    return "/";
  }
}
