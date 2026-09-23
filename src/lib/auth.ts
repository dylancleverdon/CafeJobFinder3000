import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "cjf_session";
const SESSION_DAYS = 180;

export function appPassword(): string | undefined {
  const p = process.env.APP_PASSWORD;
  return p && p.length > 0 ? p : undefined;
}

/** Login is required whenever a password is set, and always in production. */
export function authRequired(): boolean {
  return Boolean(appPassword()) || process.env.NODE_ENV === "production";
}

// The signing key is derived from the password, so there's only one secret to
// set up — and changing the password signs everyone out.
async function key(): Promise<Uint8Array> {
  const data = new TextEncoder().encode(`cafejobfinder3000:${appPassword() ?? ""}`);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ ok: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(await key());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || !appPassword()) return false;
  try {
    await jwtVerify(token, await key());
    return true;
  } catch {
    return false;
  }
}

export function passwordMatches(input: string): boolean {
  const expected = appPassword();
  if (!expected) return false;
  const a = new TextEncoder().encode(input);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
