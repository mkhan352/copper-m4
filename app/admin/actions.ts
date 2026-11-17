"use server";

// Admin Server Actions: sign in, sign out, approve and reject. Every one that
// changes anything checks the admin cookie first.
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  checkPassword,
  createSessionToken,
  isAdmin,
  isAdminConfigured,
  SESSION_SECONDS,
} from "@/lib/copper/admin/session";
import { decideRefund, type DecideResult } from "@/lib/copper/admin/decide";

export type LoginState = { error?: string };

export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!isAdminConfigured())
    return { error: "The admin password isn't set up yet." };
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) return { error: "That password isn't right." };
  (await cookies()).set(ADMIN_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

/** Approve or reject one pending request. */
export async function decide(formData: FormData): Promise<DecideResult> {
  if (!(await isAdmin())) return { status: "not_signed_in" };
  const decision =
    formData.get("decision") === "approve" ? "approved" : "rejected";
  const result = await decideRefund(
    String(formData.get("id") ?? ""),
    decision,
    String(formData.get("note") ?? "").trim() || null,
  );
  revalidatePath("/admin");
  return result;
}
