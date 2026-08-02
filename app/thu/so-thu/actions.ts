"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { createWalkinReceivables } from "@/lib/walkinReceivables";

const chargeTypes = new Set([
  "monthly_fixed_fee",
  "monthly_stake_fee",
  "session_giaoluu_fee",
  "session_stake_fee",
  "tournament_fee",
  "other",
]);
const paymentMethods = new Set(["cash", "bank_transfer", "e_wallet", "other"]);

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function positiveInt(formData: FormData, key: string) {
  const value = Number(textValue(formData, key));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} phải là số nguyên lớn hơn 0.`);
  }
  return value;
}

function optionalInt(formData: FormData, key: string) {
  const raw = textValue(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${key} phải là số nguyên không âm.`);
  }
  return value;
}

function dateValue(formData: FormData, key: string) {
  const value = textValue(formData, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Ngày không hợp lệ.");
  return value;
}

function monthValue(formData: FormData) {
  const value = textValue(formData, "period_month");
  if (value && !/^\d{4}-\d{2}$/.test(value)) throw new Error("Tháng không hợp lệ.");
  return value || null;
}

function returnPath(formData: FormData) {
  const value = textValue(formData, "return_to");
  return value.startsWith("/thu/so-thu") ? value : "/thu/so-thu";
}

function revalidateLedger() {
  revalidatePath("/thu");
  revalidatePath("/thu/so-thu");
  revalidatePath("/tong-hop");
  revalidatePath("/tong-hop/memfee-cards");
}

async function assertChargeNotLinkedToCollection(chargeId: number) {
  const { data: charge, error: chargeError } = await getSupabaseAdmin()
    .from("charges")
    .select("settlement_run_id")
    .eq("charge_id", chargeId)
    .maybeSingle();
  if (chargeError) throw chargeError;
  if (charge?.settlement_run_id) {
    throw new Error("Khoản thu do chốt sổ độ tạo, hãy mở lại ngày trước khi sửa.");
  }
  const { data, error } = await getSupabaseAdmin()
    .from("member_fee_summary_allocations")
    .select("id")
    .eq("charge_id", chargeId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    throw new Error("Khoản thu đã được phân bổ vào kế hoạch tháng, không thể sửa trực tiếp.");
  }
}

async function assertWalkinNotSettlement(id: number) {
  const { data, error } = await getSupabaseAdmin()
    .from("session_walkins")
    .select("settlement_run_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (data?.settlement_run_id) {
    throw new Error("Khoản vãng lai do chốt sổ độ tạo, hãy mở lại ngày trước khi sửa.");
  }

  const { data: plannedItem, error: plannedError } = await getSupabaseAdmin()
    .from("walkin_fee_summary_items")
    .select("id,walkin_fee_summaries!inner(status)")
    .eq("session_walkin_id", id)
    .eq("walkin_fee_summaries.status", "planned")
    .limit(1)
    .maybeSingle();
  if (plannedError) throw plannedError;
  if (plannedItem) {
    throw new Error("Khoản vãng lai đã nằm trong kế hoạch thu, hãy sửa kế hoạch tại Tổng hợp.");
  }
}

async function assertPaymentNotLinkedToCollection(paymentId: number) {
  const { data, error } = await getSupabaseAdmin()
    .from("payments")
    .select("member_fee_summary_id")
    .eq("payment_id", paymentId)
    .maybeSingle();
  if (error) throw error;
  if (data?.member_fee_summary_id) {
    throw new Error("Khoản thu đã được xác nhận từ tổng hợp, không thể sửa/xóa trực tiếp.");
  }
}

function chargeInput(formData: FormData) {
  const chargeType = textValue(formData, "charge_type");
  if (!chargeTypes.has(chargeType)) throw new Error("Loại khoản thu không hợp lệ.");
  return {
    member_id: positiveInt(formData, "member_id"),
    charge_type: chargeType,
    amount: positiveInt(formData, "amount"),
    period_month: monthValue(formData),
    created_at: dateValue(formData, "created_at"),
    note: textValue(formData, "note") || null,
  };
}

function paymentInput(formData: FormData) {
  const paymentMethod = textValue(formData, "payment_method");
  if (!paymentMethods.has(paymentMethod)) throw new Error("Hình thức thu không hợp lệ.");
  return {
    charge_id: positiveInt(formData, "charge_id"),
    amount_paid: positiveInt(formData, "amount_paid"),
    paid_date: dateValue(formData, "paid_date"),
    payment_method: paymentMethod,
    recorded_by: optionalInt(formData, "recorded_by"),
    note: textValue(formData, "note") || null,
  };
}

async function ensureSession(date: string) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: findError } = await supabase
    .from("sessions")
    .select("session_id")
    .eq("session_date", date)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.session_id as number;

  const { data, error } = await supabase
    .from("sessions")
    .insert({ session_date: date, is_cancelled: 0 })
    .select("session_id")
    .single();
  if (error) throw error;
  return data.session_id as number;
}

export async function createLedgerChargeAction(formData: FormData) {
  await assertAdmin();
  const { error } = await getSupabaseAdmin().from("charges").insert(chargeInput(formData));
  if (error) throw new Error(`Không tạo được khoản phải thu (${error.code}): ${error.message}`);
  revalidateLedger();
  redirect(returnPath(formData));
}

export async function updateLedgerChargeAction(formData: FormData) {
  await assertAdmin();
  const chargeId = positiveInt(formData, "charge_id");
  await assertChargeNotLinkedToCollection(chargeId);
  const { error } = await getSupabaseAdmin()
    .from("charges")
    .update(chargeInput(formData))
    .eq("charge_id", chargeId);
  if (error) throw new Error(`Không sửa được khoản phải thu (${error.code}): ${error.message}`);
  revalidateLedger();
  redirect(returnPath(formData));
}

export async function deleteLedgerChargeAction(formData: FormData) {
  await assertAdmin();
  const chargeId = positiveInt(formData, "charge_id");
  await assertChargeNotLinkedToCollection(chargeId);
  const supabase = getSupabaseAdmin();
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("payment_id")
    .eq("charge_id", chargeId)
    .limit(1)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (payment) {
    throw new Error("Khoản này đã có thanh toán. Hãy xóa các lần thanh toán trước.");
  }
  const { error } = await supabase.from("charges").delete().eq("charge_id", chargeId);
  if (error) throw error;
  revalidateLedger();
  redirect(returnPath(formData));
}

export async function markLedgerChargeUnpaidAction(formData: FormData) {
  await assertAdmin();
  const chargeId = positiveInt(formData, "charge_id");
  await assertChargeNotLinkedToCollection(chargeId);
  const { error } = await getSupabaseAdmin()
    .from("payments")
    .delete()
    .eq("charge_id", chargeId);
  if (error) throw new Error(`Không đặt lại được trạng thái chưa thu (${error.code}): ${error.message}`);
  revalidateLedger();
  redirect(returnPath(formData));
}

export async function createLedgerPaymentAction(formData: FormData) {
  await assertAdmin();
  const { error } = await getSupabaseAdmin().from("payments").insert(paymentInput(formData));
  if (error) throw new Error(`Không tạo được lần thanh toán (${error.code}): ${error.message}`);
  revalidateLedger();
  redirect(returnPath(formData));
}

export async function updateLedgerPaymentAction(formData: FormData) {
  await assertAdmin();
  const paymentId = positiveInt(formData, "payment_id");
  await assertPaymentNotLinkedToCollection(paymentId);
  const { error } = await getSupabaseAdmin()
    .from("payments")
    .update(paymentInput(formData))
    .eq("payment_id", paymentId);
  if (error) throw new Error(`Không sửa được lần thanh toán (${error.code}): ${error.message}`);
  revalidateLedger();
  redirect(returnPath(formData));
}

export async function deleteLedgerPaymentAction(formData: FormData) {
  await assertAdmin();
  const paymentId = positiveInt(formData, "payment_id");
  await assertPaymentNotLinkedToCollection(paymentId);
  const { error } = await getSupabaseAdmin().from("payments").delete().eq("payment_id", paymentId);
  if (error) throw error;
  revalidateLedger();
  redirect(returnPath(formData));
}

export async function createLedgerWalkinAction(formData: FormData) {
  await assertAdmin();
  const date = dateValue(formData, "session_date");
  const sessionId = await ensureSession(date);
  const name = textValue(formData, "walkin_name") || null;
  const amount = positiveInt(formData, "amount_expected");
  await createWalkinReceivables({
    sessionId,
    count: 1,
    name,
    amount,
  });
  revalidateLedger();
  redirect(returnPath(formData));
}

export async function updateLedgerWalkinAction(formData: FormData) {
  await assertAdmin();
  const id = positiveInt(formData, "id");
  await assertWalkinNotSettlement(id);
  const amountExpected = positiveInt(formData, "amount_expected");
  const amountCollected = optionalInt(formData, "amount_collected");
  const isPaid = textValue(formData, "is_paid") === "1";
  const walkinName = textValue(formData, "walkin_name") || null;
  if (walkinName && walkinName.length > 80) {
    throw new Error("Tên vãng lai không được quá 80 ký tự.");
  }
  const { error } = await getSupabaseAdmin()
    .from("session_walkins")
    .update({
      walkin_name: walkinName,
      amount_expected: amountExpected,
      amount_collected: isPaid ? amountCollected ?? 0 : null,
      is_paid: isPaid ? 1 : 0,
      note: textValue(formData, "note") || null,
    })
    .eq("id", id);
  if (error) throw new Error(`Không sửa được khoản vãng lai (${error.code}): ${error.message}`);
  revalidateLedger();
  redirect(returnPath(formData));
}

export async function deleteLedgerWalkinAction(formData: FormData) {
  await assertAdmin();
  const id = positiveInt(formData, "id");
  await assertWalkinNotSettlement(id);
  const { error } = await getSupabaseAdmin().from("session_walkins").delete().eq("id", id);
  if (error) throw error;
  revalidateLedger();
  redirect(returnPath(formData));
}
