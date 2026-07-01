"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getFeeAmount, getMemberStatus } from "@/lib/finance";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { assertCanWrite } from "@/lib/security";

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function intValue(formData: FormData, key: string, fallback = 0) {
  const raw = String(formData.get(key) || "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Invalid number for ${key}`);
  return Math.max(0, Math.round(value));
}

async function ensureSession(date: string) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: findError } = await supabase
    .from("sessions")
    .select("*")
    .eq("session_date", date)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("sessions")
    .insert({ session_date: date, is_cancelled: 0 })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function upsertSessionCharge(input: {
  memberId: number;
  sessionId: number;
  chargeType: "session_giaoluu_fee" | "session_do_fee";
  amount: number;
  note?: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: findError } = await supabase
    .from("charges")
    .select("charge_id")
    .eq("member_id", input.memberId)
    .eq("charge_type", input.chargeType)
    .eq("session_id", input.sessionId)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase
      .from("charges")
      .update({ amount: input.amount, note: input.note || null })
      .eq("charge_id", existing.charge_id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("charges").insert({
    member_id: input.memberId,
    charge_type: input.chargeType,
    amount: input.amount,
    session_id: input.sessionId,
    note: input.note || null,
  });
  if (error) throw error;
}

export async function createSessionAction(formData: FormData) {
  assertCanWrite(formData);
  const date = requiredString(formData, "date");
  await ensureSession(date);
  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function setSessionCancelledAction(formData: FormData) {
  assertCanWrite(formData);
  const date = requiredString(formData, "date");
  const sessionId = intValue(formData, "session_id");
  const isCancelled = formData.get("is_cancelled") === "1" ? 1 : 0;
  const note = String(formData.get("note") || "").trim() || null;
  const { error } = await getSupabaseAdmin()
    .from("sessions")
    .update({ is_cancelled: isCancelled, note })
    .eq("session_id", sessionId);
  if (error) throw error;
  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function addMemberToSessionAction(formData: FormData) {
  assertCanWrite(formData);
  const date = requiredString(formData, "date");
  const session = await ensureSession(date);
  const memberId = intValue(formData, "member_id");
  const doPoints = intValue(formData, "do_points");
  const status = await getMemberStatus(memberId, date);
  if (!status) throw new Error("Member is not active on this date.");

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("session_do_points").upsert(
    {
      session_id: session.session_id,
      member_id: memberId,
      do_points: doPoints,
    },
    { onConflict: "session_id,member_id" }
  );
  if (error) throw error;

  if (status === "former_fixed") {
    const baseFee = await getFeeAmount("former_fixed", "base_fee", date);
    await upsertSessionCharge({
      memberId,
      sessionId: session.session_id,
      chargeType: "session_giaoluu_fee",
      amount: baseFee,
      note: "Tự tạo từ buổi giao lưu",
    });
    await upsertSessionCharge({
      memberId,
      sessionId: session.session_id,
      chargeType: "session_do_fee",
      amount: doPoints,
      note: "Tự tạo từ độ buổi",
    });
  }

  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function updateSessionDoAction(formData: FormData) {
  assertCanWrite(formData);
  const date = requiredString(formData, "date");
  const id = intValue(formData, "id");
  const memberId = intValue(formData, "member_id");
  const sessionId = intValue(formData, "session_id");
  const doPoints = intValue(formData, "do_points");
  const status = await getMemberStatus(memberId, date);

  const { error } = await getSupabaseAdmin()
    .from("session_do_points")
    .update({ do_points: doPoints })
    .eq("id", id);
  if (error) throw error;

  if (status === "former_fixed") {
    await upsertSessionCharge({
      memberId,
      sessionId,
      chargeType: "session_do_fee",
      amount: doPoints,
      note: "Tự cập nhật từ độ buổi",
    });
  }

  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function addWalkinAction(formData: FormData) {
  assertCanWrite(formData);
  const date = requiredString(formData, "date");
  const session = await ensureSession(date);
  const walkinNumber = intValue(formData, "walkin_number");
  const amount = await getFeeAmount("walkin", "base_fee", date);

  const { error } = await getSupabaseAdmin().from("session_walkins").upsert(
    {
      session_id: session.session_id,
      walkin_number: walkinNumber,
      fee_type: "session_fee",
      amount_expected: amount,
      is_paid: 0,
      amount_collected: null,
    },
    { onConflict: "session_id,walkin_number,fee_type" }
  );
  if (error) throw error;

  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function toggleWalkinPaidAction(formData: FormData) {
  assertCanWrite(formData);
  const date = requiredString(formData, "date");
  const id = intValue(formData, "id");
  const { data, error: findError } = await getSupabaseAdmin()
    .from("session_walkins")
    .select("*")
    .eq("id", id)
    .single();
  if (findError) throw findError;

  const isPaid = data.is_paid ? 0 : 1;
  const { error } = await getSupabaseAdmin()
    .from("session_walkins")
    .update({
      is_paid: isPaid,
      amount_collected: isPaid ? data.amount_expected : null,
    })
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function addWalkinDoFeeAction(formData: FormData) {
  assertCanWrite(formData);
  const date = requiredString(formData, "date");
  const session = await ensureSession(date);
  const walkinNumber = intValue(formData, "walkin_number");
  const amount = intValue(formData, "amount");
  if (amount <= 0) throw new Error("Tiền độ vãng lai phải lớn hơn 0.");

  const { error } = await getSupabaseAdmin().from("session_walkins").upsert(
    {
      session_id: session.session_id,
      walkin_number: walkinNumber,
      fee_type: "do_fee",
      amount_expected: amount,
      is_paid: 1,
      amount_collected: amount,
      note: "Tiền độ vãng lai",
    },
    { onConflict: "session_id,walkin_number,fee_type" }
  );
  if (error) throw error;

  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function createManualChargeAction(formData: FormData) {
  assertCanWrite(formData);
  const memberId = intValue(formData, "member_id");
  const chargeType = requiredString(formData, "charge_type");
  const amount = intValue(formData, "amount");
  const periodMonth = String(formData.get("period_month") || "").trim() || null;
  const eventName = String(formData.get("event_name") || "").trim() || null;
  const note = String(formData.get("note") || "").trim() || null;

  const { error } = await getSupabaseAdmin().from("charges").insert({
    member_id: memberId,
    charge_type: chargeType,
    amount,
    period_month: periodMonth,
    event_name: eventName,
    note,
  });
  if (error) throw error;

  revalidatePath("/thu");
  redirect("/thu");
}

export async function recordPaymentAction(formData: FormData) {
  assertCanWrite(formData);
  const chargeId = intValue(formData, "charge_id");
  const amountPaid = intValue(formData, "amount_paid");
  const paidDate = requiredString(formData, "paid_date");
  const paymentMethod = requiredString(formData, "payment_method");
  const recordedByRaw = String(formData.get("recorded_by") || "").trim();
  const note = String(formData.get("note") || "").trim() || null;

  const { error } = await getSupabaseAdmin().from("payments").insert({
    charge_id: chargeId,
    amount_paid: amountPaid,
    paid_date: paidDate,
    payment_method: paymentMethod,
    recorded_by: recordedByRaw ? Number(recordedByRaw) : null,
    note,
  });
  if (error) throw error;

  revalidatePath("/thu");
  revalidatePath("/tong-hop");
  redirect("/thu");
}

export async function createExpenseAction(formData: FormData) {
  assertCanWrite(formData);
  const expenseDate = requiredString(formData, "expense_date");
  const category = requiredString(formData, "category");
  const amount = intValue(formData, "amount");
  const description = String(formData.get("description") || "").trim() || null;

  const { error } = await getSupabaseAdmin().from("expenses").insert({
    expense_date: expenseDate,
    category,
    amount,
    description,
  });
  if (error) throw error;

  revalidatePath("/chi");
  revalidatePath("/tong-hop");
  redirect(`/chi?month=${expenseDate.slice(0, 7)}`);
}

export async function createMonthlySnapshotAction(formData: FormData) {
  assertCanWrite(formData);
  const periodMonth = requiredString(formData, "period_month");
  const openingBalance = intValue(formData, "opening_balance");
  const closingBalanceRaw = String(formData.get("closing_balance") || "").trim();
  const note = String(formData.get("note") || "").trim() || null;

  const { error } = await getSupabaseAdmin().from("monthly_fund_snapshot").upsert(
    {
      period_month: periodMonth,
      opening_balance: openingBalance,
      closing_balance: closingBalanceRaw ? Number(closingBalanceRaw) : null,
      note,
    },
    { onConflict: "period_month" }
  );
  if (error) throw error;

  revalidatePath("/tong-hop");
  redirect(`/tong-hop?month=${periodMonth}`);
}
