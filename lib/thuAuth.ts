import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const THU_AUTH_COOKIE = "bmt_thu_access";

function configuredPin() {
  return process.env.THU_ACCESS_PIN || "";
}

function accessToken(pin: string) {
  return createHash("sha256").update(`bmt-thu:${pin}`).digest("hex");
}

export function verifyThuAccessPin(submittedPin: string) {
  const pin = configuredPin();
  if (!pin) return false;

  const submitted = Buffer.from(accessToken(submittedPin));
  const expected = Buffer.from(accessToken(pin));
  return submitted.length === expected.length && timingSafeEqual(submitted, expected);
}

export async function isThuRouteAuthenticated() {
  if (process.env.NODE_ENV !== "production") return true;

  const pin = configuredPin();
  if (!pin) return false;
  const storedToken = (await cookies()).get(THU_AUTH_COOKIE)?.value || "";
  const submitted = Buffer.from(storedToken);
  const expected = Buffer.from(accessToken(pin));
  return submitted.length === expected.length && timingSafeEqual(submitted, expected);
}

export async function assertAuthenticatedAdmin() {
  if (!(await isThuRouteAuthenticated())) {
    throw new Error("Phiên quản trị không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.");
  }
}

export function thuAccessCookieValue() {
  const pin = configuredPin();
  if (!pin) throw new Error("Chưa cấu hình THU_ACCESS_PIN trên máy chủ.");
  return accessToken(pin);
}
