import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/accept/route";
import { proxy } from "@/proxy";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_S,
  consentSecret,
  isValidConsent,
  safeNextPath,
  signConsent,
} from "./consent";

const SECRET = consentSecret()!; // dev secret in tests
const ORIGIN = "http://localhost:3000";

const get = (path: string, cookie?: string) =>
  new NextRequest(`${ORIGIN}${path}`, { headers: cookie ? { cookie: `${CONSENT_COOKIE}=${cookie}` } : {} });

const post = (fields: Record<string, string>, headers: Record<string, string> = { origin: ORIGIN, "sec-fetch-site": "same-origin" }) =>
  new NextRequest(`${ORIGIN}/api/accept`, { method: "POST", body: new URLSearchParams(fields), headers });

describe("signed consent cookie", () => {
  it("accepts a freshly signed cookie", async () => {
    expect(await isValidConsent(await signConsent(SECRET), SECRET)).toBe(true);
  });

  it("rejects forged, tampered, or hand-made cookies", async () => {
    const real = await signConsent(SECRET);
    const [v, t] = real.split(".");
    for (const fake of ["1", "true", "yes", `${v}.${t}.AAAA`, `${v}.${Number(t) + 1}.${real.split(".")[2]}`, ""]) {
      expect(await isValidConsent(fake, SECRET)).toBe(false);
    }
    expect(await isValidConsent(await signConsent("another-secret-that-is-long-enough-xx"), SECRET)).toBe(false);
  });

  it("expires after the max age and rejects old notice versions", async () => {
    const now = 2_000_000_000;
    const old = await signConsent(SECRET, now - CONSENT_MAX_AGE_S - 1);
    expect(await isValidConsent(old, SECRET, now)).toBe(false);
    const oldVersion = (await signConsent(SECRET)).replace(/^[^.]+/, "2000-01-01");
    expect(await isValidConsent(oldVersion, SECRET)).toBe(false);
  });

  it("fails closed in production without a secret", () => {
    expect(consentSecret({ NODE_ENV: "production" })).toBeNull();
    expect(consentSecret({ NODE_ENV: "production", CONSENT_SECRET: "short" })).toBeNull();
  });

  it("only redirects to same-site paths after accepting", () => {
    expect(safeNextPath("/compare?step=results")).toBe("/compare?step=results");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "/accept", "/api/accept"]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
});

describe("proxy gate", () => {
  it.each(["/", "/compare", "/compare?step=results", "/methodology", "/privacy", "/does-not-exist"])(
    "sends %s to the accept page without a valid cookie",
    async (path) => {
      const res = await proxy(get(path));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/accept");
    },
  );

  it("keeps the intended page so the visitor lands there after accepting", async () => {
    const res = await proxy(get("/compare?step=results"));
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe("/compare?step=results");
  });

  it("blocks client-side navigations and prefetches (RSC requests) too", async () => {
    const res = await proxy(get("/methodology?_rsc=abc"));
    expect(res.status).toBe(307);
  });

  it("rejects a forged cookie and clears it", async () => {
    const res = await proxy(get("/compare", "true"));
    expect(res.status).toBe(307);
    expect(res.headers.get("set-cookie")).toContain(`${CONSENT_COOKIE}=;`);
  });

  it("lets through a valid cookie, and always allows the accept page itself", async () => {
    expect((await proxy(get("/compare", await signConsent(SECRET)))).headers.get("location")).toBeNull();
    expect((await proxy(get("/accept"))).headers.get("location")).toBeNull();
  });
});

describe("accept form handler", () => {
  it("refuses without the checkbox ticked", async () => {
    const res = await POST(post({ next: "/compare" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/accept?error=1");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("sets a valid HttpOnly cookie and returns to the intended page when accepted", async () => {
    const res = await POST(post({ acknowledge: "yes", next: "/compare" }));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/compare");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/i);
    const value = decodeURIComponent(cookie.split(";")[0].split("=")[1]);
    expect(await isValidConsent(value, SECRET)).toBe(true);
  });

  it("refuses posts from other websites (can't accept on someone's behalf)", async () => {
    const res = await POST(post({ acknowledge: "yes" }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("won't redirect off-site after accepting", async () => {
    const res = await POST(post({ acknowledge: "yes", next: "//evil.example/phish" }));
    expect(new URL(res.headers.get("location")!).origin).toBe(ORIGIN);
  });
});
