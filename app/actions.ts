"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getActiveMembers,
  getDailyScorecard,
  getFeeAmount,
  getMemberStatus,
  getMonthlyMemberCards,
  normalizeScorecardPayload,
  parseScorePlayerKey,
  type DailyScorecardPayload,
  type ScoreSet,
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

function scoreSetFromForm(formData: FormData, fallback: ScoreSet) {
  const amount = intValue(formData, "amount");
  const winnerRaw = String(formData.get("winner") || "").trim();
  return {
    ...fallback,
    amount,
    winner: winnerRaw === "A" || winnerRaw === "B" ? winnerRaw : fallback.winner,
    players: [
      parseScorePlayerKey(String(formData.get("player_0") || "")),
      parseScorePlayerKey(String(formData.get("player_1") || "")),
      parseScorePlayerKey(String(formData.get("player_2") || "")),
      parseScorePlayerKey(String(formData.get("player_3") || "")),
    ],
  } satisfies ScoreSet;
}

function scoreSetIsReady(set: ScoreSet) {
  const sideA = set.players.slice(0, 2).filter((player) => player.type !== "empty");
  const sideB = set.players.slice(2, 4).filter((player) => player.type !== "empty");
  return (
    set.amount > 0 &&
    !!set.winner &&
    sideA.length > 0 &&
    sideB.length > 0
  );
}

function scoreSetHasDuplicatePlayers(set: ScoreSet) {
  const keys = set.players
    .map((player) => {
      if (player.type === "member") return `m:${player.memberId}`;
      if (player.type === "walkin") return `w:${player.walkinNumber}`;
      return "";
    })
    .filter(Boolean);
  return new Set(keys).size !== keys.length;
}

function losingPlayers(set: ScoreSet) {
  return set.winner === "A" ? set.players.slice(2, 4) : set.players.slice(0, 2);
}

function presentPlayers(set: ScoreSet) {
  return set.players.filter((player) => player.type !== "empty");
}

function addToMap(map: Map<number, number>, key: number, value: number) {
  map.set(key, (map.get(key) || 0) + value);
}

function assertScorecardIsOpen(settledAt: string | null) {
  if (settledAt) {
    throw new Error("Ngày này đã chốt sổ độ, không thể sửa thêm.");
  }
}

export async function createSessionAction(formData: FormData) {
  const date = requiredString(formData, "date");
  await ensureSession(date);
  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function addScoreSetAction(formData: FormData) {
  const date = requiredString(formData, "date");
  const card = await getDailyScorecard(date);
  assertScorecardIsOpen(card.settled_at);
  const payload = normalizeScorecardPayload(card.payload);
  if (payload.sets.length >= 12) {
    throw new Error("Một ngày tối đa 12 thẻ ghi độ.");
  }

  payload.sets.push({
    id: globalThis.crypto.randomUUID(),
    amount: 0,
    winner: null,
    locked: false,
    players: [
      { type: "empty" },
      { type: "empty" },
      { type: "empty" },
      { type: "empty" },
    ],
  });

  await saveDailyScorecard(date, payload);
  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function saveScoreSetAction(formData: FormData) {
  const date = requiredString(formData, "date");
  const setId = requiredString(formData, "set_id");
  const intent = String(formData.get("intent") || "save");
  const card = await getDailyScorecard(date);
  assertScorecardIsOpen(card.settled_at);
  const payload = normalizeScorecardPayload(card.payload);
  const index = payload.sets.findIndex((set) => set.id === setId);
  if (index < 0) throw new Error("Không tìm thấy thẻ ghi độ.");

  const existing = payload.sets[index];
  if (existing.locked) {
    redirect(`/?date=${date}`);
  }

  const updated = scoreSetFromForm(formData, existing);
  if (intent === "winner_a") updated.winner = "A";
  if (intent === "winner_b") updated.winner = "B";
  if (intent === "lock") {
    if (!scoreSetIsReady(updated)) {
      throw new Error("Cần có ít nhất 1 người mỗi bên, nhập tiền độ và chọn bên thắng trước khi khóa.");
    }
    if (scoreSetHasDuplicatePlayers(updated)) {
      throw new Error("Một thẻ không được chọn trùng người cho nhiều vị trí.");
    }
    updated.locked = true;
  }

  payload.sets[index] = updated;
  await saveDailyScorecard(date, payload);
  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function unlockScoreSetAction(formData: FormData) {
  await assertAdmin();
  const date = requiredString(formData, "date");
  const setId = requiredString(formData, "set_id");
  const card = await getDailyScorecard(date);
  assertScorecardIsOpen(card.settled_at);
  const payload = normalizeScorecardPayload(card.payload);
  const index = payload.sets.findIndex((set) => set.id === setId);
  if (index < 0) throw new Error("Không tìm thấy thẻ ghi độ.");

  payload.sets[index] = {
    ...payload.sets[index],
    locked: false,
  };
  await saveDailyScorecard(date, payload);
  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function deleteScoreSetAction(formData: FormData) {
  const date = requiredString(formData, "date");
  const setId = requiredString(formData, "set_id");
  const card = await getDailyScorecard(date);
  assertScorecardIsOpen(card.settled_at);
  const payload = normalizeScorecardPayload(card.payload);
  const target = payload.sets.find((set) => set.id === setId);
  if (!target) throw new Error("Không tìm thấy thẻ ghi độ.");
  if (target.locked) throw new Error("Thẻ đã khóa, không thể xóa.");

  payload.sets = payload.sets.filter((set) => set.id !== setId);
  await saveDailyScorecard(date, payload);
  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function settleDailyScorecardAction(formData: FormData) {
  await assertAdmin();
  const date = requiredString(formData, "date");
  const card = await getDailyScorecard(date);
  if (card.settled_at) {
    redirect(`/?date=${date}`);
  }
  const payload = normalizeScorecardPayload(card.payload);
  if (payload.sets.length === 0) throw new Error("Chưa có thẻ ghi độ nào.");
  if (payload.sets.some((set) => !set.locked)) {
    throw new Error("Cần khóa tất cả thẻ ghi độ trước khi chốt sổ.");
  }

  const session = await ensureSession(date);
  const memberStakes = new Map<number, number>();
  const walkinStakes = new Map<number, number>();
  const presentMemberIds = new Set<number>();
  const presentWalkinNumbers = new Set<number>();

  for (const set of payload.sets) {
    for (const player of presentPlayers(set)) {
      if (player.type === "member" && player.memberId) {
        presentMemberIds.add(player.memberId);
      }
      if (player.type === "walkin" && player.walkinNumber) {
        presentWalkinNumbers.add(player.walkinNumber);
      }
    }

    for (const player of losingPlayers(set)) {
      if (player.type === "member" && player.memberId) {
        addToMap(memberStakes, player.memberId, set.amount);
      }
      if (player.type === "walkin" && player.walkinNumber) {
        addToMap(walkinStakes, player.walkinNumber, set.amount);
      }
    }
  }

  const supabase = getSupabaseAdmin();
  const walkinFee = await getFeeAmount("walkin", "base_fee", date);

  for (const memberId of presentMemberIds) {
    const status = await getMemberStatus(memberId, date);
    if (!status) continue;
    const stakePoints = memberStakes.get(memberId) || 0;

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
        note: "Tự tạo khi chốt sổ độ ngày",
      });
      await upsertSessionCharge({
        memberId,
        sessionId: session.session_id,
        chargeType: "session_stake_fee",
        amount: stakePoints,
        note: "Tự tổng hợp từ thẻ ghi độ ngày",
      });
    }
  }

  for (const walkinNumber of presentWalkinNumbers) {
    const { error } = await supabase.from("session_walkins").upsert(
      {
        session_id: session.session_id,
        walkin_number: walkinNumber,
        fee_type: "session_fee",
        amount_expected: walkinFee,
        is_paid: 0,
        amount_collected: null,
        note: "Tự tạo khi chốt sổ độ ngày",
      },
      { onConflict: "session_id,walkin_number,fee_type" }
    );
    if (error) throw error;
  }

  for (const [walkinNumber, amount] of walkinStakes.entries()) {
    const { error } = await supabase.from("session_walkins").upsert(
      {
        session_id: session.session_id,
        walkin_number: walkinNumber,
        fee_type: "stake_fee",
        amount_expected: amount,
        is_paid: 1,
        amount_collected: amount,
        note: "Tự tổng hợp từ thẻ ghi độ ngày",
      },
      { onConflict: "session_id,walkin_number,fee_type" }
    );
    if (error) throw error;
  }

  const { error } = await supabase
    .from("daily_scorecards")
    .update({
      settled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("score_date", date);
  if (error) throw error;

  revalidatePath("/");
  revalidatePath("/thu");
  revalidatePath("/tong-hop");
  redirect(`/?date=${date}`);
}

export async function setSessionCancelledAction(formData: FormData) {
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

  const amount = await getFeeAmount("former_fixed", "base_fee", date);
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

  const { error } = await getSupabaseAdmin()
    .from("session_walkins")
    .update({
      is_paid: 1,
      amount_collected: amountCollected,
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

  const { error: paymentsError } = await supabase
    .from("payments")
    .delete()
    .eq("charge_id", chargeId);
  if (paymentsError) throw paymentsError;

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

export async function generateMonthlyFixedFeesAction(formData: FormData) {
  await assertAdmin();
  const periodMonth = requiredString(formData, "period_month");
  const applyDate = `${periodMonth}-01`;
  const fixedFee = await getFeeAmount("fixed", "base_fee", applyDate);
  if (fixedFee <= 0) throw new Error("Chưa cấu hình phí cố định trong fee_rules.");

  const fixedMembers = (await getActiveMembers(applyDate)).filter(
    (row) => row.status === "fixed"
  );
  const supabase = getSupabaseAdmin();

  for (const row of fixedMembers) {
    const { data: existing, error: findError } = await supabase
      .from("charges")
      .select("charge_id")
      .eq("member_id", row.member_id)
      .eq("charge_type", "monthly_fixed_fee")
      .eq("period_month", periodMonth)
      .maybeSingle();
    if (findError) throw findError;
    if (existing) continue;

    const { error } = await supabase.from("charges").insert({
      member_id: row.member_id,
      charge_type: "monthly_fixed_fee",
      amount: fixedFee,
      period_month: periodMonth,
      note: `Tự tạo tiền quỹ cố định tháng ${periodMonth}`,
    });
    if (error) throw error;
  }

  revalidatePath("/thu");
  revalidatePath("/tong-hop");
  redirect(`/tong-hop?month=${periodMonth}`);
}

export async function saveMemberFeeSummariesAction(formData: FormData) {
  await assertAdmin();
  const periodMonth = requiredString(formData, "period_month");
  const cards = await getMonthlyMemberCards(periodMonth);
  const rows = cards.map((card) => {
    const items: { name: string; amount: number }[] = [];
    if (card.fixedFee > 0) items.push({ name: "Tiền quỹ", amount: card.fixedFee });
    if (card.stakeFee > 0) items.push({ name: "Tiền độ", amount: card.stakeFee });
    if (card.giaoLuuFee > 0) items.push({ name: "Phí giao lưu", amount: card.giaoLuuFee });
    if (card.otherFee > 0) items.push({ name: "Khoản khác", amount: card.otherFee });
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

  if (rows.length > 0) {
    const { error } = await getSupabaseAdmin()
      .from("member_fee_summaries")
      .upsert(rows, { onConflict: "member_id,period_month" });
    if (error?.code === "23514") {
      throw new Error(
        `Dữ liệu thẻ không vượt qua ràng buộc Supabase (${error.code}): ${error.message}`
      );
    }
    if (error) throw error;
  }

  revalidatePath("/tong-hop/memfee-cards");
  redirect(`/tong-hop/memfee-cards?month=${periodMonth}`);
}
