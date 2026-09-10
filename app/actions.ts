"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {

  getDailyScorecard,
  getFeeAmount,
  getMemberStatus,
  getMonthlyMemberCards,
  normalizeScorecardPayload,
  parseScorePlayerKey,
  scorePlayerKey,
  emptyScorePlayer,
  type DailyScorecardPayload,
  type MemberFeeItem,
  type ScoreSet,
  type ScorePlayer,
} from "@/lib/finance";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { assertAdmin } from "@/lib/security";
import { createWalkinReceivables } from "@/lib/walkinReceivables";

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  if (!value) throw new Error(`Thiếu trường ${key}`);
  return value;
}

function intValue(formData: FormData, key: string, fallback = 0) {
  const raw = String(formData.get(key) || "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Giá trị số không hợp lệ cho ${key}`);
  return Math.max(0, Math.round(value));
}

type FeePlanRow = {
  member_id: number;
  period_month: string;
  member_status: "fixed" | "former_fixed";
  items: MemberFeeItem[];
  total_due: number;
  total_paid: number;
  outstanding: number;
  updated_at: string;
};

function normalizedFeeItems(value: unknown): MemberFeeItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { name: string; amount: number; component?: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { name?: unknown }).name === "string" &&
        Number.isFinite(Number((item as { amount?: unknown }).amount))
    )
    .map((item) => ({
      name: item.name,
      amount: Number(item.amount),
      ...(item.component === "fixed" ||
      item.component === "stake" ||
      item.component === "giao_luu" ||
      item.component === "other"
        ? { component: item.component }
        : {}),
    }));
}

function feeItemsEqual(left: unknown, right: unknown) {
  const leftItems = normalizedFeeItems(left);
  const rightItems = normalizedFeeItems(right);
  if (leftItems.length !== rightItems.length) return false;
  return leftItems.every((item, index) => {
    const other = rightItems[index];
    return (
      item.name === other.name &&
      item.amount === other.amount &&
      (!item.component || !other.component || item.component === other.component)
    );
  });
}

async function saveFeeSummaryPlanRows(rows: FeePlanRow[]) {
  if (rows.length === 0) return;

  const periodMonth = rows[0].period_month;
  const supabase = getSupabaseAdmin();
  const { data: existingRows, error: existingError } = await supabase
    .from("member_fee_summaries")
    .select("member_id,status,items,total_due")
    .eq("period_month", periodMonth);
  if (existingError) throw existingError;

  const existingByMember = new Map(
    (existingRows || []).map((row) => [row.member_id, row])
  );
  const writableRows: Array<FeePlanRow & { status: "planned" }> = [];

  for (const row of rows) {
    const existing = existingByMember.get(row.member_id);
    if (existing && existing.status && existing.status !== "planned") {
      if (existing.total_due !== row.total_due || !feeItemsEqual(existing.items, row.items)) {
        throw new Error("Kế hoạch đã có tiền thu, không thể sửa lại từ màn hình tổng hợp.");
      }
      continue;
    }
    writableRows.push({ ...row, status: "planned" });
  }

  if (writableRows.length === 0) return;
  const { error } = await supabase
    .from("member_fee_summaries")
    .upsert(writableRows, { onConflict: "member_id,period_month" });
  if (error) throw error;
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
  chargeType: "session_giaoluu_fee" | "session_stake_fee";
  amount: number;
  note?: string;
  settlementRunId?: number;
}) {
  const { error } = await getSupabaseAdmin().from("charges").upsert(
    {
      member_id: input.memberId,
      charge_type: input.chargeType,
      amount: input.amount,
      session_id: input.sessionId,
      ...(input.settlementRunId !== undefined
        ? { settlement_run_id: input.settlementRunId }
        : {}),
      note: input.note || null,
    },
    { onConflict: "member_id,charge_type,session_id" }
  );
  if (error) throw error;
}

async function saveDailyScorecard(date: string, payload: DailyScorecardPayload) {
  const { error } = await getSupabaseAdmin().from("daily_scorecards").upsert(
    {
      score_date: date,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "score_date" }
  );
  if (error) throw error;
}

function scoreEntryPlayer(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  if (value === "custom") {
    const name = String(formData.get(`${key}_custom`) || "").trim().replace(/\s+/g, " ");
    return parseScorePlayerKey(`guest:${name}`);
  }
  return parseScorePlayerKey(value);
}

export type ConfirmScoreEntryState = {
  successKey: number;
  error: string;
};

function playerIdentity(player: ScorePlayer) {
  return scorePlayerKey(player).trim().toLocaleLowerCase("vi");
}

function scoreSetIsReady(set: ScoreSet) {
  return set.amount > 0 && !!set.loser && set.loser.type !== "empty";
}

function scoreSetHasDuplicatePlayers(set: ScoreSet) {
  const loser = set.loser && playerIdentity(set.loser);
  const recipient = set.recipient && playerIdentity(set.recipient);
  return !!loser && !!recipient && loser === recipient;
}

export async function confirmScoreEntryAction(
  previousState: ConfirmScoreEntryState,
  formData: FormData
): Promise<ConfirmScoreEntryState> {
  try {
    const date = requiredString(formData, "date");
    const card = await getDailyScorecard(date);

    const payload = normalizeScorecardPayload(card.payload);
    if (payload.sets.length >= 12) throw new Error("Má»™t ngÃ y tá»‘i Ä‘a 12 tháº» ghi Ä‘á»™.");

    const set: ScoreSet = {
      id: globalThis.crypto.randomUUID(),
      amount: intValue(formData, "amount"),
      winner: null,
      locked: true,
      loser: scoreEntryPlayer(formData, "loser"),
      recipient: scoreEntryPlayer(formData, "recipient"),
      players: [emptyScorePlayer(), emptyScorePlayer(), emptyScorePlayer(), emptyScorePlayer()],
    };

    if (set.amount < 5000) throw new Error("Má»©c Ä‘á»™ pháº£i tá»« 5.000Ä‘.");
    if (!scoreSetIsReady(set)) throw new Error("Cáº§n chá»n ngÆ°á»i thua Ä‘á»™.");
    if (scoreSetHasDuplicatePlayers(set)) throw new Error("NgÆ°á»i thua vÃ  ngÆ°á»i nháº­n khÃ´ng Ä‘Æ°á»£c trÃ¹ng nhau.");

    payload.sets.push(set);
    await saveDailyScorecard(date, payload);
    revalidatePath("/");
    return { successKey: previousState.successKey + 1, error: "" };
  } catch (error) {
    return {
      successKey: previousState.successKey,
      error: error instanceof Error ? error.message : "KhÃ´ng ghi Ä‘Æ°á»£c tháº» Ä‘á»™.",
    };
  }
}
export async function updateScoreEntryAction(
  previousState: ConfirmScoreEntryState,
  formData: FormData
): Promise<ConfirmScoreEntryState> {
  try {
    const date = requiredString(formData, "date");
    const setId = requiredString(formData, "set_id");
    const card = await getDailyScorecard(date);

    const payload = normalizeScorecardPayload(card.payload);
    const index = payload.sets.findIndex((set) => set.id === setId);
    if (index < 0) throw new Error("KhÃ´ng tÃ¬m tháº¥y lÆ°á»£t Ä‘á»™.");

    const updated: ScoreSet = {
      ...payload.sets[index],
      amount: intValue(formData, "amount"),
      winner: null,
      locked: true,
      loser: scoreEntryPlayer(formData, "loser"),
      recipient: scoreEntryPlayer(formData, "recipient"),
      players: [emptyScorePlayer(), emptyScorePlayer(), emptyScorePlayer(), emptyScorePlayer()],
    };

    if (updated.amount < 5000) throw new Error("Má»©c Ä‘á»™ pháº£i tá»« 5.000Ä‘.");
    if (!scoreSetIsReady(updated)) throw new Error("Cáº§n chá»n ngÆ°á»i thua Ä‘á»™.");
    if (scoreSetHasDuplicatePlayers(updated)) throw new Error("NgÆ°á»i thua vÃ  ngÆ°á»i nháº­n khÃ´ng Ä‘Æ°á»£c trÃ¹ng nhau.");

    payload.sets[index] = updated;
    await saveDailyScorecard(date, payload);
    revalidatePath("/");
    revalidatePath("/tong-hop/tien-do");
    return { successKey: previousState.successKey + 1, error: "" };
  } catch (error) {
    return {
      successKey: previousState.successKey,
      error: error instanceof Error ? error.message : "KhÃ´ng sá»­a Ä‘Æ°á»£c lÆ°á»£t Ä‘á»™.",
    };
  }
}
export async function deleteScoreSetAction(formData: FormData) {
  const date = requiredString(formData, "date");
  const setId = requiredString(formData, "set_id");
  const card = await getDailyScorecard(date);

  const payload = normalizeScorecardPayload(card.payload);
  if (!payload.sets.some((set) => set.id === setId)) {
    throw new Error("Không tìm thấy lượt độ.");
  }
  payload.sets = payload.sets.filter((set) => set.id !== setId);
  await saveDailyScorecard(date, payload);
  revalidatePath("/");
  revalidatePath("/tong-hop/tien-do");
  redirect(`/?date=${date}`);
}export async function setSessionCancelledAction(formData: FormData) {
  await assertAdmin();
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
  await assertAdmin();
  const date = requiredString(formData, "date");
  const session = await ensureSession(date);
  const memberId = intValue(formData, "member_id");
  const stakePoints = intValue(formData, "stake_points");
  const status = await getMemberStatus(memberId, date);
  if (!status) throw new Error("Thành viên không hoạt động trong ngày này.");

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("session_stake_points").upsert(
    {
      session_id: session.session_id,
      member_id: memberId,
      stake_points: stakePoints,
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
      chargeType: "session_stake_fee",
      amount: stakePoints,
      note: "Tự tạo từ độ buổi",
    });
  }

  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function updateSessionStakeAction(formData: FormData) {
  await assertAdmin();
  const date = requiredString(formData, "date");
  const id = intValue(formData, "id");
  const memberId = intValue(formData, "member_id");
  const sessionId = intValue(formData, "session_id");
  const stakePoints = intValue(formData, "stake_points");
  const status = await getMemberStatus(memberId, date);

  const { error } = await getSupabaseAdmin()
    .from("session_stake_points")
    .update({ stake_points: stakePoints })
    .eq("id", id);
  if (error) throw error;

  if (status === "former_fixed") {
    await upsertSessionCharge({
      memberId,
      sessionId,
      chargeType: "session_stake_fee",
      amount: stakePoints,
      note: "Tự cập nhật từ độ buổi",
    });
  }

  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function addWalkinAction(formData: FormData) {
  await assertAdmin();
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

export async function createWalkinReceivableAction(formData: FormData) {
  await assertAdmin();
  const date = requiredString(formData, "date");
  const session = await ensureSession(date);
  const walkinCount = intValue(formData, "walkin_count", 1);
  const walkinName = String(formData.get("walkin_name") || "").trim() || null;
  const amount = intValue(formData, "amount");
  if (walkinCount < 1 || walkinCount > 30) {
    throw new Error("Số người vãng lai phải từ 1 đến 30.");
  }
  if (walkinCount > 1 && walkinName) {
    throw new Error("Chỉ có thể đặt tên khi tạo 1 người vãng lai.");
  }
  if (walkinName && walkinName.length > 80) {
    throw new Error("Tên vãng lai không được quá 80 ký tự.");
  }
  if (amount < 5000 || amount % 5000 !== 0) {
    throw new Error("Mức thu vãng lai phải là bội số của 5.000đ.");
  }

  await createWalkinReceivables({
    sessionId: session.session_id,
    count: walkinCount,
    name: walkinName,
    amount,
  });

  revalidatePath("/thu");
  revalidatePath("/tong-hop");
  redirect("/thu");
}

export async function createFormerFixedReceivableAction(formData: FormData) {
  await assertAdmin();
  const date = requiredString(formData, "date");
  const memberId = intValue(formData, "member_id");
  if (memberId <= 0) throw new Error("Thành viên không hợp lệ.");

  const status = await getMemberStatus(memberId, date);
  if (status !== "former_fixed") {
    throw new Error("Người được chọn không phải thành viên cố định cũ tại ngày này.");
  }

  const configuredAmount = await getFeeAmount("former_fixed", "base_fee", date);
  const requestedAmount = intValue(formData, "amount");
  const amount = requestedAmount > 0 ? requestedAmount : configuredAmount;
  if (amount <= 0) throw new Error("Chưa cấu hình phí giao lưu cho cố định cũ.");

  const session = await ensureSession(date);
  await upsertSessionCharge({
    memberId,
    sessionId: session.session_id,
    chargeType: "session_giaoluu_fee",
    amount,
    note: "Tạo từ quản lý thu - cố định cũ đến giao lưu",
  });

  revalidatePath("/thu");
  revalidatePath("/tong-hop");
  revalidatePath("/tong-hop/memfee-cards");
  redirect("/thu");
}

export async function toggleWalkinPaidAction(formData: FormData) {
  await assertAdmin();
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

export async function recordWalkinPaymentAction(formData: FormData) {
  await assertAdmin();
  const id = intValue(formData, "id");
  const amountCollected = intValue(formData, "amount_collected");
  if (amountCollected <= 0) throw new Error("Số tiền thu phải lớn hơn 0.");
  const note = String(formData.get("note") || "").trim() || null;

  const { error } = await getSupabaseAdmin()
    .from("session_walkins")
    .update({
      is_paid: 1,
      amount_collected: amountCollected,
      note,
    })
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/thu");
  revalidatePath("/tong-hop");
  redirect("/thu");
}

export async function addWalkinStakeFeeAction(formData: FormData) {
  await assertAdmin();
  const date = requiredString(formData, "date");
  const session = await ensureSession(date);
  const walkinNumber = intValue(formData, "walkin_number");
  const amount = intValue(formData, "amount");
  if (amount <= 0) throw new Error("Tiền độ vãng lai phải lớn hơn 0.");

  const { error } = await getSupabaseAdmin().from("session_walkins").upsert(
    {
      session_id: session.session_id,
      walkin_number: walkinNumber,
      fee_type: "stake_fee",
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
  await assertAdmin();
  const memberId = intValue(formData, "member_id");
  const chargeType = requiredString(formData, "charge_type");
  const amount = intValue(formData, "amount");
  const collectionDate = requiredString(formData, "collection_date");
  const periodMonth =
    String(formData.get("period_month") || "").trim() || collectionDate.slice(0, 7);
  const note = String(formData.get("note") || "").trim() || null;

  if (memberId <= 0) throw new Error("Thành viên không hợp lệ.");
  if (amount <= 0) throw new Error("Số tiền phải lớn hơn 0.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(collectionDate)) throw new Error("Ngày thu không hợp lệ.");
  if (!/^\d{4}-\d{2}$/.test(periodMonth)) throw new Error("Tháng áp dụng không hợp lệ.");

  const { error } = await getSupabaseAdmin().from("charges").insert({
    member_id: memberId,
    charge_type: chargeType,
    amount,
    period_month: periodMonth,
    created_at: collectionDate,
    note,
  });
  if (error) {
    throw new Error(`Không tạo được khoản thu (${error.code}): ${error.message}`);
  }

  revalidatePath("/thu");
  revalidatePath("/tong-hop");
  redirect(`/thu?month=${periodMonth}`);
}

export async function recordPaymentAction(formData: FormData) {
  await assertAdmin();
  const chargeId = intValue(formData, "charge_id");
  const amountPaid = intValue(formData, "amount_paid");
  if (amountPaid <= 0) throw new Error("Số tiền thu phải lớn hơn 0.");
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

export async function deleteChargeAction(formData: FormData) {
  await assertAdmin();
  const chargeId = intValue(formData, "charge_id");
  const supabase = getSupabaseAdmin();

  const { data: linkedPayments, error: paymentsError } = await supabase
    .from("payments")
    .select("payment_id")
    .eq("charge_id", chargeId)
    .limit(1);
  if (paymentsError) throw paymentsError;
  if (linkedPayments && linkedPayments.length > 0) {
    throw new Error("Khoản thu đã có thanh toán; không thể xoá để bảo toàn lịch sử thu và tồn quỹ.");
  }

  const { error } = await supabase
    .from("charges")
    .delete()
    .eq("charge_id", chargeId);
  if (error) throw error;

  revalidatePath("/thu");
  revalidatePath("/tong-hop");
  redirect("/thu");
}

export async function deleteWalkinReceivableAction(formData: FormData) {
  await assertAdmin();
  const id = intValue(formData, "id");
  const { error } = await getSupabaseAdmin()
    .from("session_walkins")
    .delete()
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/thu");
  revalidatePath("/tong-hop");
  redirect("/thu");
}

export async function createExpenseAction(formData: FormData) {
  await assertAdmin();
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
  await assertAdmin();
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

export async function saveMemberFeeSummariesAction(formData: FormData) {
  await assertAdmin();
  const periodMonth = requiredString(formData, "period_month");
  const cards = await getMonthlyMemberCards(periodMonth);
  const rows = cards.map((card) => {
    const items: MemberFeeItem[] = [];
    if (card.fixedFee > 0) items.push({ name: "Tiền quỹ", amount: card.fixedFee, component: "fixed" });
    if (card.stakeFee > 0) items.push({ name: "Tiền độ", amount: card.stakeFee, component: "stake" });
    if (card.giaoLuuFee > 0) items.push({ name: "Phí giao lưu", amount: card.giaoLuuFee, component: "giao_luu" });
    if (card.otherFee > 0) items.push({ name: "Khoản khác", amount: card.otherFee, component: "other" });
    return {
      member_id: card.memberId,
      period_month: periodMonth,
      member_status: card.status,
      items,
      total_due: items.reduce((sum, item) => sum + item.amount, 0),
      total_paid: card.totalPaid,
      outstanding: card.outstanding,
      updated_at: new Date().toISOString(),
    };
  });

  await saveFeeSummaryPlanRows(rows);

  revalidatePath("/tong-hop/memfee-cards");
  redirect(`/tong-hop/memfee-cards?month=${periodMonth}`);
}
