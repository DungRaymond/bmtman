"use server";

import { revalidatePath } from "next/cache";
import { assertDashboardAccess, hasDashboardAccess, setDashboardAccess } from "@/lib/dashboardAuth";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

function value(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function dateValue(raw: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    throw new Error("Ngày không hợp lệ.");
  }
  return raw;
}

function integer(raw: string, label: string, min = 1, max = 100_000_000) {
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} không hợp lệ.`);
  return parsed;
}

async function rpc<T>(name: string, args: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function loginDashboardAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    await setDashboardAccess(value(formData, "pin"));
  } catch {
    return { ok: false, error: "Mã PIN không đúng." };
  }
  return { ok: true };
}

export async function checkDashboardAccessAction() {
  return hasDashboardAccess();
}

export async function changeLossAction(formData: FormData) {
  await assertDashboardAccess();
  const date = dateValue(value(formData, "date"));
  const memberId = integer(value(formData, "member_id"), "Thành viên");
  const delta = integer(value(formData, "delta"), "Thao tác", -1, 1);
  if (delta !== 1 && delta !== -1) throw new Error("Thao tác không hợp lệ.");
  const count = await rpc<number>("dashboard_change_loss", { p_date: date, p_member_id: memberId, p_delta: delta });
  return { memberId, count };
}

export async function lockLossesAction(formData: FormData) {
  await assertDashboardAccess();
  await rpc("dashboard_lock_losses", { p_date: dateValue(value(formData, "date")) });
  revalidatePath("/");
}

export async function deleteLockedLossAction(formData: FormData) {
  await assertDashboardAccess();
  await rpc("dashboard_delete_locked_loss", {
    p_date: dateValue(value(formData, "date")),
    p_member_id: integer(value(formData, "member_id"), "Thành viên"),
  });
  revalidatePath("/");
}

export async function recordPigPaymentAction(formData: FormData) {
  await assertDashboardAccess();
  await rpc("dashboard_record_pig_payment", {
    p_date: dateValue(value(formData, "date")),
    p_member_id: integer(value(formData, "member_id"), "Thành viên"),
  });
  revalidatePath("/");
}

export async function closePigAction(formData: FormData) {
  await assertDashboardAccess();
  const amount = await rpc<number>("dashboard_close_pig", {
    p_date: dateValue(value(formData, "date")),
    p_member_id: integer(value(formData, "member_id"), "Thành viên"),
  });
  revalidatePath("/");
  return amount;
}

export async function addExpenseAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  if (!(await hasDashboardAccess())) return { ok: false, error: "Cần nhập mã PIN quản lý." };
  let expenseDate: string;
  let amount: number;
  try {
    expenseDate = dateValue(value(formData, "expense_date"));
    amount = integer(value(formData, "amount").replace(/[,.\s]/g, ""), "Số tiền");
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Dữ liệu không hợp lệ." };
  }
  const description = value(formData, "description").slice(0, 160);
  if (!description) return { ok: false, error: "Nhập nội dung khoản chi." };
  const { error } = await getSupabaseAdmin().from("dashboard_expenses").insert({
    expense_date: expenseDate,
    amount,
    description,
  });
  if (error) return { ok: false, error: "Không ghi được khoản chi." };
  revalidatePath("/");
  return { ok: true };
}
