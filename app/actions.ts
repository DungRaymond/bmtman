"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getActiveMembers,
  getDailyScorecard,
  getFeeAmount,
  getMemberStatus,
  getMonthlyMemberCards,
  getMonthlyWalkinCollectionCards,
  normalizeScorecardPayload,
  parseScorePlayerKey,
  todayInputValue,
  walkinPlanFieldPrefix,
  type DailyScorecardPayload,
  type MemberFeeItem,
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

async function assertWalkinNotPlannedForCollection(id: number) {
  const { data, error } = await getSupabaseAdmin()
    .from("walkin_fee_summary_items")
    .select("id,walkin_fee_summaries!inner(status)")
    .eq("session_walkin_id", id)
    .eq("walkin_fee_summaries.status", "planned")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    throw new Error("Khoản vãng lai đã nằm trong kế hoạch thu, hãy sửa kế hoạch tại Tổng hợp.");
  }
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

type SummaryAllocation = {
  charge_id: number;
  component: "fixed" | "stake" | "giao_luu" | "other";
  amount: number;
};

const componentChargeTypes: Record<SummaryAllocation["component"], string[]> = {
  fixed: ["monthly_fixed_fee"],
  stake: ["monthly_stake_fee", "session_stake_fee"],
  giao_luu: ["session_giaoluu_fee"],
  other: ["tournament_fee", "other"],
};

function summaryItemComponent(item: MemberFeeItem): SummaryAllocation["component"] | null {
  if (item.component) return item.component;
  const normalized = item.name.toLocaleLowerCase("vi");
  if (normalized.includes("quỹ")) return "fixed";
  if (normalized.includes("độ")) return "stake";
  if (normalized.includes("giao lưu")) return "giao_luu";
  if (normalized.includes("khác")) return "other";
  return null;
}

function buildSummaryAllocations(
  card: Awaited<ReturnType<typeof getMonthlyMemberCards>>[number],
  items: MemberFeeItem[]
): SummaryAllocation[] {
  const allocations: SummaryAllocation[] = [];
  const usedCharges = new Set<number>();

  for (const item of items) {
    const component = summaryItemComponent(item);
    if (!component || item.amount <= 0) {
      throw new Error("Khoản thu chưa có loại phân bổ hợp lệ.");
    }

    let remaining = item.amount;
    const candidates = card.unpaidItems.filter(
      (charge) =>
        !usedCharges.has(charge.chargeId) &&
        componentChargeTypes[component].includes(charge.chargeType)
    );

    for (const charge of candidates) {
      if (remaining <= 0) break;
      if (remaining < charge.outstanding) {
        throw new Error(
          `Khoản ${item.name} phải thu đủ từng khoản phải thu; hãy điều chỉnh kế hoạch hoặc ghi nhận qua sổ thu.`
        );
      }
      const amount = Math.min(remaining, charge.outstanding);
      if (amount <= 0) continue;
      allocations.push({ charge_id: charge.chargeId, component, amount });
      usedCharges.add(charge.chargeId);
      remaining -= amount;
    }

    if (remaining > 0) {
      throw new Error(
        `Chưa có charge hợp lệ để ghi nhận ${item.name}; hãy tạo khoản phải thu trước.`
      );
    }
  }

  return allocations;
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

async function ensureWalkinSessionFee(input: {
  sessionId: number;
  walkinNumber: number;
  amount: number;
  settlementRunId?: number;
}) {
  const { error } = await getSupabaseAdmin().from("session_walkins").upsert(
    {
      session_id: input.sessionId,
      walkin_number: input.walkinNumber,
      fee_type: "session_fee",
      amount_expected: input.amount,
      is_paid: 0,
      amount_collected: null,
      ...(input.settlementRunId !== undefined
        ? { settlement_run_id: input.settlementRunId }
        : {}),
      note: "Tự tạo khi chốt sổ độ ngày",
    },
    {
      onConflict: "session_id,walkin_number,fee_type",
      ignoreDuplicates: true,
    }
  );
  if (error) throw error;
  if (input.settlementRunId !== undefined) {
    const { error: claimError } = await getSupabaseAdmin()
      .from("session_walkins")
      .update({ settlement_run_id: input.settlementRunId })
      .eq("session_id", input.sessionId)
      .eq("walkin_number", input.walkinNumber)
      .eq("fee_type", "session_fee")
      .is("settlement_run_id", null);
    if (claimError) throw claimError;
  }
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
      if (player.type === "guest") return `g:${player.name?.trim().toLocaleLowerCase("vi")}`;
      return "";
    })
    .filter(Boolean);
  return new Set(keys).size !== keys.length;
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

function losingPlayers(set: ScoreSet) {
  return set.winner === "A" ? set.players.slice(2, 4) : set.players.slice(0, 2);
}

function presentPlayers(set: ScoreSet) {
  return set.players.filter((player) => player.type !== "empty");
}

function addToMap(map: Map<number, number>, key: number, value: number) {
  map.set(key, (map.get(key) || 0) + value);
}

function guestKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
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

export async function confirmScoreEntryAction(
  previousState: ConfirmScoreEntryState,
  formData: FormData
): Promise<ConfirmScoreEntryState> {
  try {
    const date = requiredString(formData, "date");
    const card = await getDailyScorecard(date);
    assertScorecardIsOpen(card.settled_at);
    const payload = normalizeScorecardPayload(card.payload);
    if (payload.sets.length >= 12) throw new Error("Một ngày tối đa 12 thẻ ghi độ.");

    const winnerValue = String(formData.get("winner") || "");
    const set: ScoreSet = {
      id: globalThis.crypto.randomUUID(),
      amount: intValue(formData, "amount"),
      winner: winnerValue === "A" || winnerValue === "B" ? winnerValue : null,
      locked: true,
      players: [
        scoreEntryPlayer(formData, "player_0"),
        scoreEntryPlayer(formData, "player_1"),
        scoreEntryPlayer(formData, "player_2"),
        scoreEntryPlayer(formData, "player_3"),
      ],
    };

    if (set.amount < 5000) {
      throw new Error("Mức độ phải từ 5.000đ.");
    }
    if (!scoreSetIsReady(set)) {
      throw new Error("Cần chọn người đầu tiên của mỗi bên và bên thắng.");
    }
    if (scoreSetHasDuplicatePlayers(set)) {
      throw new Error("Một thẻ không được chọn trùng người.");
    }

    payload.sets.push(set);
    await saveDailyScorecard(date, payload);
    revalidatePath("/");
    return { successKey: previousState.successKey + 1, error: "" };
  } catch (error) {
    return {
      successKey: previousState.successKey,
      error: error instanceof Error ? error.message : "Không ghi được thẻ độ.",
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
    assertScorecardIsOpen(card.settled_at);
    const payload = normalizeScorecardPayload(card.payload);
    const index = payload.sets.findIndex((set) => set.id === setId);
    if (index < 0) throw new Error("Không tìm thấy lượt độ.");

    const winnerValue = String(formData.get("winner") || "");
    const updated: ScoreSet = {
      ...payload.sets[index],
      amount: intValue(formData, "amount"),
      winner: winnerValue === "A" || winnerValue === "B" ? winnerValue : null,
      locked: true,
      players: [
        scoreEntryPlayer(formData, "player_0"),
        scoreEntryPlayer(formData, "player_1"),
        scoreEntryPlayer(formData, "player_2"),
        scoreEntryPlayer(formData, "player_3"),
      ],
    };

    if (updated.amount < 5000) {
      throw new Error("Mức độ phải từ 5.000đ.");
    }
    if (!scoreSetIsReady(updated)) {
      throw new Error("Cần chọn người đầu tiên của mỗi bên và bên thắng.");
    }
    if (scoreSetHasDuplicatePlayers(updated)) {
      throw new Error("Một thẻ không được chọn trùng người.");
    }

    payload.sets[index] = updated;
    await saveDailyScorecard(date, payload);
    revalidatePath("/");
    revalidatePath("/tong-hop/tien-do");
    return { successKey: previousState.successKey + 1, error: "" };
  } catch (error) {
    return {
      successKey: previousState.successKey,
      error: error instanceof Error ? error.message : "Không sửa được lượt độ.",
    };
  }
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

  payload.sets = payload.sets.filter((set) => set.id !== setId);
  await saveDailyScorecard(date, payload);
  revalidatePath("/");
  revalidatePath("/tong-hop/tien-do");
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
  const presentGuestNames = new Map<string, string>();
  const guestStakes = new Map<string, number>();

  for (const set of payload.sets) {
    for (const player of presentPlayers(set)) {
      if (player.type === "member" && player.memberId) {
        presentMemberIds.add(player.memberId);
      }
      if (player.type === "walkin" && player.walkinNumber) {
        presentWalkinNumbers.add(player.walkinNumber);
      }
      if (player.type === "guest" && player.name) {
        presentGuestNames.set(guestKey(player.name), player.name);
      }
    }

    for (const player of losingPlayers(set)) {
      if (player.type === "member" && player.memberId) {
        addToMap(memberStakes, player.memberId, set.amount);
      }
      if (player.type === "walkin" && player.walkinNumber) {
        addToMap(walkinStakes, player.walkinNumber, set.amount);
      }
      if (player.type === "guest" && player.name) {
        const key = guestKey(player.name);
        guestStakes.set(key, (guestStakes.get(key) || 0) + set.amount);
      }
    }
  }

  const supabase = getSupabaseAdmin();
  const [walkinFee, formerFixedFee, activeMemberRows] = await Promise.all([
    getFeeAmount("walkin", "base_fee", date),
    getFeeAmount("former_fixed", "base_fee", date),
    getActiveMembers(date),
  ]);
  const memberStatusById = new Map(
    activeMemberRows.map((row) => [row.member_id, row.status])
  );

  const { data: runId, error: runError } = await supabase.rpc(
    "create_daily_scorecard_settlement_run",
    { p_score_date: date }
  );
  if (runError || !runId) {
    throw new Error(runError?.message || "Không tạo được settlement batch cho ngày.");
  }
  const settlementRunId = Number(runId);

  try {
    const { data: existingWalkins, error: existingWalkinsError } = await supabase
      .from("session_walkins")
      .select("id,walkin_number,walkin_name,fee_type")
      .eq("session_id", session.session_id);
    if (existingWalkinsError) throw existingWalkinsError;
  const guestNumbers = new Map<string, number>();
  for (const row of existingWalkins || []) {
    if (row.fee_type === "session_fee" && row.walkin_name) {
      guestNumbers.set(guestKey(row.walkin_name), row.walkin_number);
    }
  }

  for (const [key, name] of presentGuestNames) {
    if (!guestNumbers.has(key)) {
      await createWalkinReceivables({
        sessionId: session.session_id,
        count: 1,
        name,
        amount: walkinFee,
        settlementRunId,
      });
      const { data: created, error: createdError } = await supabase
        .from("session_walkins")
        .select("walkin_number")
        .eq("session_id", session.session_id)
        .eq("fee_type", "session_fee")
        .eq("walkin_name", name)
        .order("id", { ascending: false })
        .limit(1)
        .single();
      if (createdError) throw createdError;
      guestNumbers.set(key, created.walkin_number);
    }
    const walkinNumber = guestNumbers.get(key);
    if (walkinNumber && guestStakes.has(key)) {
      addToMap(walkinStakes, walkinNumber, guestStakes.get(key) || 0);
    }
  }

  const memberUpdates = Array.from(presentMemberIds, async (memberId) => {
    const status = memberStatusById.get(memberId);
    if (!status) return;
    const stakePoints = memberStakes.get(memberId) || 0;

    const { error } = await supabase.from("session_stake_points").upsert(
      {
        session_id: session.session_id,
        member_id: memberId,
        stake_points: stakePoints,
        settlement_run_id: settlementRunId,
      },
      { onConflict: "session_id,member_id" }
    );
    if (error) throw error;

    if (status === "former_fixed") {
      await Promise.all([
        upsertSessionCharge({
          memberId,
          sessionId: session.session_id,
          chargeType: "session_giaoluu_fee",
          amount: formerFixedFee,
          note: "Tự tạo khi chốt sổ độ ngày",
          settlementRunId,
        }),
        upsertSessionCharge({
          memberId,
          sessionId: session.session_id,
          chargeType: "session_stake_fee",
          amount: stakePoints,
          note: "Tự tổng hợp từ thẻ ghi độ ngày",
          settlementRunId,
        }),
      ]);
    }
  });

  const walkinFeeUpdates = Array.from(presentWalkinNumbers, (walkinNumber) =>
    ensureWalkinSessionFee({
      sessionId: session.session_id,
      walkinNumber,
      amount: walkinFee,
      settlementRunId,
    })
  );

  const walkinStakeUpdates = Array.from(walkinStakes, async ([walkinNumber, amount]) => {
    const { error } = await supabase.from("session_walkins").upsert(
      {
        session_id: session.session_id,
        walkin_number: walkinNumber,
        fee_type: "stake_fee",
        amount_expected: amount,
        is_paid: 1,
        amount_collected: amount,
        settlement_run_id: settlementRunId,
        note: "Tự tổng hợp từ thẻ ghi độ ngày",
      },
      { onConflict: "session_id,walkin_number,fee_type" }
    );
    if (error) throw error;
  });

  await Promise.all([...memberUpdates, ...walkinFeeUpdates, ...walkinStakeUpdates]);

    const { error: finalizeError } = await supabase.rpc(
      "finalize_daily_scorecard_settlement",
      { p_run_id: settlementRunId, p_score_date: date }
    );
    if (finalizeError) throw finalizeError;
  } catch (error) {
    const { error: abortError } = await supabase.rpc(
      "abort_daily_scorecard_settlement",
      { p_run_id: settlementRunId }
    );
    if (abortError) console.error("Không thể dọn settlement batch lỗi", abortError);
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/thu");
  revalidatePath("/tong-hop");
  redirect(`/?date=${date}`);
}

export async function reopenDailyScorecardAction(formData: FormData) {
  await assertAdmin();
  const date = requiredString(formData, "date");
  const reason = requiredString(formData, "reason");
  if (reason.length > 500) throw new Error("Lý do mở lại không được quá 500 ký tự.");

  const { error } = await getSupabaseAdmin().rpc("reopen_daily_scorecard", {
    p_score_date: date,
    p_reason: reason,
  });
  if (error) throw new Error(`Không thể mở lại ngày: ${error.message}`);

  revalidatePath("/");
  revalidatePath("/tong-hop");
  revalidatePath("/tong-hop/tien-do");
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
  await assertWalkinNotPlannedForCollection(id);
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
  await assertWalkinNotPlannedForCollection(id);
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
  await assertWalkinNotPlannedForCollection(id);
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

  if (fixedMembers.length > 0) {
    const [periodYear, periodNumber] = periodMonth.split("-").map(Number);
    const nextMonthDate = new Date(Date.UTC(periodYear, periodNumber, 1))
      .toISOString()
      .slice(0, 10);
    const { data: stakeRows, error: stakeError } = await supabase
      .from("session_stake_points")
      .select("member_id,stake_points,sessions!inner(session_date)")
      .in("member_id", fixedMembers.map((row) => row.member_id))
      .gte("sessions.session_date", `${periodMonth}-01`)
      .lt("sessions.session_date", nextMonthDate);
    if (stakeError) throw stakeError;

    const stakeByMember = new Map<number, number>();
    for (const row of stakeRows || []) {
      const session = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
      if (!session?.session_date?.startsWith(periodMonth)) continue;
      stakeByMember.set(
        row.member_id,
        (stakeByMember.get(row.member_id) || 0) + Math.max(Number(row.stake_points) || 0, 0)
      );
    }

    for (const row of fixedMembers) {
      const stakeAmount = stakeByMember.get(row.member_id) || 0;
      if (stakeAmount <= 0) continue;
      const { data: existing, error: findError } = await supabase
        .from("charges")
        .select("charge_id")
        .eq("member_id", row.member_id)
        .eq("charge_type", "monthly_stake_fee")
        .eq("period_month", periodMonth)
        .maybeSingle();
      if (findError) throw findError;
      if (existing) continue;

      const { error } = await supabase.from("charges").insert({
        member_id: row.member_id,
        charge_type: "monthly_stake_fee",
        amount: stakeAmount,
        period_month: periodMonth,
        note: `Tự gom tiền độ tháng ${periodMonth}`,
      });
      if (error) throw error;
    }
  }

  revalidatePath("/thu");
  revalidatePath("/tong-hop");
  redirect(`/tong-hop?month=${periodMonth}`);
}

function walkinPlanAllocations(
  card: Awaited<ReturnType<typeof getMonthlyWalkinCollectionCards>>[number],
  plannedAmount: number
) {
  if (plannedAmount <= 0) return [];
  if (plannedAmount > card.totalOutstanding) {
    throw new Error("Kế hoạch vãng lai không được vượt quá số tiền còn phải thu.");
  }

  let remaining = plannedAmount;
  const allocations: { walkin_id: number; amount: number }[] = [];
  for (const item of card.unpaidItems) {
    if (remaining <= 0) break;
    const amount = Math.min(item.outstanding, remaining);
    if (amount <= 0) continue;
    allocations.push({ walkin_id: item.walkinId, amount });
    remaining -= amount;
  }

  if (remaining > 0) {
    throw new Error("Không thể phân bổ đủ số tiền vãng lai đã chọn.");
  }
  return allocations;
}

async function savePlannedWalkinSelections(formData: FormData, periodMonth: string) {
  const cards = await getMonthlyWalkinCollectionCards(periodMonth);
  const supabase = getSupabaseAdmin();

  for (const card of cards) {
    const prefix = walkinPlanFieldPrefix(card.groupKey);
    const selected = formData.get(`${prefix}_selected`) === "on";
    const plannedAmount = selected ? intValue(formData, `${prefix}_amount`) : 0;
    const allocations = walkinPlanAllocations(card, plannedAmount);
    const { error } = await supabase.rpc("save_walkin_fee_summary_plan", {
      p_period_month: periodMonth,
      p_group_key: card.groupKey,
      p_walkin_person_id: card.walkinPersonId,
      p_display_name: card.name,
      p_allocations: allocations,
    });
    if (error) {
      throw new Error(`Không thể lưu kế hoạch vãng lai: ${error.message}`);
    }
  }
}

async function savePlannedFeeSelection(formData: FormData) {
  await assertAdmin();
  const periodMonth = requiredString(formData, "period_month");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth)) {
    throw new Error("Tháng áp dụng không hợp lệ.");
  }

  const cards = await getMonthlyMemberCards(periodMonth);
  const components = [
    { key: "fixed", label: "Tiền quỹ" },
    { key: "stake", label: "Tiền độ" },
    { key: "giao_luu", label: "Phí giao lưu" },
    { key: "other", label: "Khoản khác" },
  ] as const;
  const rows = cards.map((card) => {
    const items = components.flatMap((component) => {
      const prefix = `member_${card.memberId}_${component.key}`;
      if (formData.get(`${prefix}_selected`) !== "on") return [];
      const amount = intValue(formData, `${prefix}_amount`);
      return amount > 0
        ? [{ name: component.label, amount, component: component.key }]
        : [];
    });
    const totalDue = items.reduce((sum, item) => sum + item.amount, 0);
    const totalPaid = Math.min(card.totalPaid, totalDue);
    return {
      member_id: card.memberId,
      period_month: periodMonth,
      member_status: card.status,
      items,
      total_due: totalDue,
      total_paid: totalPaid,
      outstanding: Math.max(totalDue - totalPaid, 0),
      updated_at: new Date().toISOString(),
    };
  });

  await saveFeeSummaryPlanRows(rows);
  await savePlannedWalkinSelections(formData, periodMonth);

  revalidatePath("/tong-hop");
  revalidatePath("/tong-hop/memfee-cards");
  redirect(`/tong-hop?month=${periodMonth}`);
}

export async function saveMonthlyCollectionSelectionAction(formData: FormData) {
  return savePlannedFeeSelection(formData);
}

export async function markFeeSummaryCollectedAction(formData: FormData) {
  await assertAdmin();
  const summaryId = intValue(formData, "collect_summary_id");
  if (summaryId <= 0) throw new Error("Kế hoạch thu không hợp lệ.");

  const supabase = getSupabaseAdmin();
  const { data: summary, error: summaryError } = await supabase
    .from("member_fee_summaries")
    .select("id,member_id,period_month,status,items,total_due,total_paid,outstanding")
    .eq("id", summaryId)
    .single();
  if (summaryError) throw summaryError;
  const totalDue = Math.max(Number(summary.total_due) || 0, 0);
  const totalPaid = Math.max(Number(summary.total_paid) || 0, 0);
  const outstanding = Math.max(totalDue - totalPaid, 0);
  if (summary.status === "collected" || totalDue <= 0 || outstanding <= 0) {
    revalidatePath("/tong-hop");
    revalidatePath("/tong-hop/memfee-cards");
    redirect(`/tong-hop?month=${summary.period_month}`);
  }

  const cards = await getMonthlyMemberCards(summary.period_month);
  const card = cards.find((row) => row.memberId === summary.member_id);
  if (!card) throw new Error("Không tìm thấy dữ liệu thành viên của kế hoạch thu.");

  const items = normalizedFeeItems(summary.items);
  const allocations = buildSummaryAllocations(card, items);
  if (allocations.length === 0) throw new Error("Kế hoạch thu chưa có khoản cần ghi nhận.");

  const paidDate = String(formData.get("paid_date") || todayInputValue()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
    throw new Error("Ngày thu không hợp lệ.");
  }
  const paymentMethod = String(formData.get("payment_method") || "cash").trim();
  const note = String(formData.get("payment_note") || "").trim() || "Thu từ kế hoạch tháng";

  const { error: rpcError } = await supabase.rpc("mark_fee_summary_collected", {
    p_summary_id: summaryId,
    p_allocations: allocations,
    p_paid_date: paidDate,
    p_payment_method: paymentMethod,
    p_recorded_by: null,
    p_note: note,
  });
  if (rpcError) throw new Error(`Không thể xác nhận đã thu: ${rpcError.message}`);

  revalidatePath("/tong-hop");
  revalidatePath("/tong-hop/memfee-cards");
  revalidatePath("/thu");
  redirect(`/tong-hop?month=${summary.period_month}`);
}

export async function markWalkinFeeSummaryCollectedAction(formData: FormData) {
  await assertAdmin();
  const summaryId = intValue(formData, "collect_walkin_summary_id");
  if (summaryId <= 0) throw new Error("Kế hoạch thu vãng lai không hợp lệ.");

  const supabase = getSupabaseAdmin();
  const { data: summary, error: summaryError } = await supabase
    .from("walkin_fee_summaries")
    .select("id,period_month")
    .eq("id", summaryId)
    .single();
  if (summaryError) throw summaryError;

  const paidDate = String(formData.get("paid_date") || todayInputValue()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
    throw new Error("Ngày thu không hợp lệ.");
  }
  const paymentMethod = String(formData.get("payment_method") || "cash").trim();
  const note = String(formData.get("payment_note") || "").trim() || null;

  const { error: rpcError } = await supabase.rpc("mark_walkin_fee_summary_collected", {
    p_summary_id: summaryId,
    p_paid_date: paidDate,
    p_payment_method: paymentMethod,
    p_note: note,
  });
  if (rpcError) {
    throw new Error(`Không thể xác nhận đã thu vãng lai: ${rpcError.message}`);
  }

  revalidatePath("/tong-hop");
  revalidatePath("/thu");
  revalidatePath("/thu/so-thu");
  redirect(`/tong-hop?month=${summary.period_month}`);
}

export async function monthlyCollectionAction(formData: FormData) {
  if (String(formData.get("collect_summary_id") || "").trim()) {
    return markFeeSummaryCollectedAction(formData);
  }
  if (String(formData.get("collect_walkin_summary_id") || "").trim()) {
    return markWalkinFeeSummaryCollectedAction(formData);
  }
  return saveMonthlyCollectionSelectionAction(formData);
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
