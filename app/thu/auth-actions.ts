"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  THU_AUTH_COOKIE,
  thuAccessCookieValue,
  verifyThuAccessPin,
} from "@/lib/thuAuth";

export async function loginThuAction(formData: FormData) {
  const submittedPin = String(formData.get("access_pin") || "");
  const nextPath = String(formData.get("next") || "/thu");
  const safeNextPath = nextPath.startsWith("/thu") ? nextPath : "/thu";
  if (!verifyThuAccessPin(submittedPin)) {
    redirect(`/thu?auth=invalid&next=${encodeURIComponent(safeNextPath)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(THU_AUTH_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/thu",
    maxAge: 0,
  });
  cookieStore.set(THU_AUTH_COOKIE, thuAccessCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect(safeNextPath);
}
