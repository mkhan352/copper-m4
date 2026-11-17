// The admin sign-in: one password from the ADMIN_PASSWORD setting, checked on
// the server. A correct password sets a signed, httpOnly cookie that lasts 8
// hours. Everything under /admin and every admin action checks it.
import { createHash, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "copper_admin";
const HOURS = 8;

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

const secret = () =>
  new TextEncoder().encode(
    process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "",
  );

const digest = (value: string) => createHash("sha256").update(value).digest();

/** True when the typed password matches (compared in constant time). */
export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(digest(input), digest(expected));
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${HOURS}h`)
    .sign(secret());
}

export const SESSION_SECONDS = HOURS * 60 * 60;

/** True when the request carries a valid admin cookie. */
export async function isAdmin(): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === "admin";
  } catch {
    return false;
  }
}
