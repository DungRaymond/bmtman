import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "bmt_dashboard_access";
const MAX_AGE = 12 * 60 * 60;

function signature(timestamp: string) {
  const pin = process.env.THU_ACCESS_PIN;
  if (!pin) throw new Error("Missing THU_ACCESS_PIN.");
  return createHmac("sha256", pin).update(timestamp).digest("hex");
}

export async function hasDashboardAccess() {
  const value = (await cookies()).get(COOKIE)?.value || "";
  const [timestamp, supplied] = value.split(".");
  if (!timestamp || !supplied || !/^\d+$/.test(timestamp)) return false;
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (age < 0 || age > MAX_AGE) return false;
  const expected = signature(timestamp);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function assertDashboardAccess() {
  if (!(await hasDashboardAccess())) throw new Error("Cần nhập mã PIN quản lý.");
}

export async function setDashboardAccess(pin: string) {
  const expectedPin = process.env.THU_ACCESS_PIN;
  if (!expectedPin || pin.length !== expectedPin.length || !timingSafeEqual(Buffer.from(pin), Buffer.from(expectedPin))) {
    throw new Error("Mã PIN không đúng.");
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  (await cookies()).set(COOKIE, `${timestamp}.${signature(timestamp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE,
  });
}
