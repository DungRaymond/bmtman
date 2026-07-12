import "server-only";

import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/supabaseServer";

export type Member = {
  member_id: number;
  name: string;
  joined_date: string | null;
  note: string | null;
};

export type Session = {
  session_id: number;
  session_date: string;
  is_cancelled: number;
  note: string | null;
};

export type SessionParticipant = {
  id: number;
  session_id: number;
  member_id: number;
  stake_points: number;
  members: Member | null;
  status?: "fixed" | "former_fixed";
};

export type SessionWalkin = {
  id: number;
  session_id: number;
  walkin_number: number;
  walkin_name: string | null;
  fee_type: "session_fee" | "stake_fee";
  amount_expected: number;
  is_paid: number;
  amount_collected: number | null;
  collected_by: number | null;
  note: string | null;
};

export type ScorePlayer = {
  type: "empty" | "member" | "walkin";
  memberId?: number;
  walkinNumber?: number;
};

export type ScoreSet = {
  id: string;
  amount: number;
  winner: "A" | "B" | null;
  locked: boolean;
  players: [ScorePlayer, ScorePlayer, ScorePlayer, ScorePlayer];
};

export type DailyScorecardPayload = {
  sets: ScoreSet[];
};

export type DailyScorecard = {
  score_date: string;
  payload: DailyScorecardPayload;
  settled_at: string | null;
  updated_at: string | null;
};

export type WalkinReceivable = SessionWalkin & {
  sessions?: { session_date: string } | { session_date: string }[] | null;
};

export type WalkinByDay = SessionWalkin & {
  sessions?: { session_date: string } | { session_date: string }[] | null;
};

export type Charge = {
  charge_id: number;
  member_id: number;
  charge_type: string;
  amount: number;
  period_month: string | null;
  session_id: number | null;
  event_name: string | null;
  created_at: string;
  note: string | null;
  members: Member | null;
  payments?: { amount_paid: number }[];
};

export type MonthlyMemberPayment = {
  payment_id: number;
  amount_paid: number;
  paid_date: string;
  payment_method: string | null;
  note: string | null;
  charges:
    | {
        charge_id: number;
        charge_type: string;
        amount: number;
        period_month: string | null;
        members: Member | Member[] | null;
      }
    | {
        charge_id: number;
        charge_type: string;
        amount: number;
        period_month: string | null;
        members: Member | Member[] | null;
      }[];
};

export type Expense = {
  expense_id: number;
  expense_date: string;
  category: string;
  amount: number;
  description: string | null;
};

export type MemberBalance = {
  member_id: number;
  name: string;
  total_charged: number;
  total_paid: number;
  outstanding_debt: number;
};

export type MonthlyMemberCard = {
  memberId: number;
  memberNumber: string;
  name: string;
  status: "fixed" | "former_fixed";
  fixedFee: number;
  stakeFee: number;
  giaoLuuFee: number;
  otherFee: number;
  totalDue: number;
  totalPaid: number;
  outstanding: number;
  previousDebt: number;
  currentUnpaid: number;
  unpaidItems: {
    chargeId: number;
    label: string;
    amount: number;
    paid: number;
    outstanding: number;
    period: string;
  }[];
  chargeCount: number;
};

export type MemberFeeItem = {
  name: string;
  amount: number;
};

export type MemberFeeSummary = {
  memberId: number;
  memberNumber: string;
  name: string;
  status: "fixed" | "former_fixed";
  items: MemberFeeItem[];
  totalDue: number;
  totalPaid: number;
  outstanding: number;
};

type ActiveMemberRow = {
  member_id: number;
  status: "fixed" | "former_fixed";
  members: Member | Member[];
};

type AmountPaidRow = {
  amount_paid: number | null;
};

type AmountCollectedRow = {
  amount_collected: number | null;
};

type AmountRow = {
  amount: number | null;
};

type MonthlyChargeRow = Charge & {
  payments?: { amount_paid: number | null }[];
  sessions?: { session_date: string } | { session_date: string }[] | null;
};

type DailyScorecardRow = {
  score_date: string;
  payload: unknown;
  settled_at: string | null;
  updated_at: string | null;
};

export const chargeTypeLabels: Record<string, string> = {
  monthly_fixed_fee: "Quỹ cố định tháng",
  monthly_stake_fee: "Tiền độ tháng",
  session_giaoluu_fee: "Phí giao lưu buổi",
  session_stake_fee: "Tiền độ buổi",
  tournament_fee: "Phí giải",
  other: "Khác",
};

export const expenseCategoryLabels: Record<string, string> = {
  court: "Sân / bảo vệ",
  shuttlecock: "Cầu",
  shirt: "Áo",
  party: "Liên hoan",
  medal: "Huy chương",
  other: "Khác",
};

export function money(value: number | null | undefined) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function todayInputValue() {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
}

export function currentMonthValue() {
  return todayInputValue().slice(0, 7);
}

export function formatDateVN(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function paidAmount(charge: Charge) {
  return (charge.payments || []).reduce((sum, p) => sum + (p.amount_paid || 0), 0);
}

export function outstandingAmount(charge: Charge) {
  return Math.max(charge.amount - paidAmount(charge), 0);
}

export function walkinCollectedAmount(walkin: SessionWalkin) {
  return walkin.amount_collected || 0;
}

export function walkinOutstandingAmount(walkin: SessionWalkin) {
  return Math.max(walkin.amount_expected - walkinCollectedAmount(walkin), 0);
}

export function walkinSessionDate(walkin: WalkinReceivable) {
  const session = Array.isArray(walkin.sessions)
    ? walkin.sessions[0]
    : walkin.sessions;
  return session?.session_date || "";
}

export function emptyScorePlayer(): ScorePlayer {
  return { type: "empty" };
}

export function emptyScoreSet(index: number): ScoreSet {
  return {
    id: `set-${index}`,
    amount: 0,
    winner: null,
    locked: false,
    players: [
      emptyScorePlayer(),
      emptyScorePlayer(),
      emptyScorePlayer(),
      emptyScorePlayer(),
    ],
  };
}

export function normalizeScorecardPayload(raw: unknown): DailyScorecardPayload {
  const source = isRecord(raw) && Array.isArray(raw.sets) ? raw.sets : [];
  const sets = source.slice(0, 12).map((item, index) => normalizeScoreSet(item, index));
  return { sets };
}

export function scorePlayerKey(player: ScorePlayer) {
  if (player.type === "member" && player.memberId) return `member:${player.memberId}`;
  if (player.type === "walkin" && player.walkinNumber) {
    return `walkin:${player.walkinNumber}`;
  }
  return "";
}

export function parseScorePlayerKey(value: string): ScorePlayer {
  const [type, rawId] = value.split(":");
  const id = Number(rawId);
  if (type === "member" && Number.isFinite(id) && id > 0) {
    return { type: "member", memberId: Math.round(id) };
  }
  if (type === "walkin" && Number.isFinite(id) && id > 0) {
    return { type: "walkin", walkinNumber: Math.round(id) };
  }
  return emptyScorePlayer();
}

function normalizeScoreSet(raw: unknown, index: number): ScoreSet {
  const row = isRecord(raw) ? raw : {};
  const players = Array.isArray(row.players) ? row.players : [];
  return {
    id: typeof row.id === "string" && row.id ? row.id : `set-${index + 1}`,
    amount: normalizeNumber(row.amount),
    winner: row.winner === "A" || row.winner === "B" ? row.winner : null,
    locked: row.locked === true,
    players: [
      normalizeScorePlayer(players[0]),
      normalizeScorePlayer(players[1]),
      normalizeScorePlayer(players[2]),
      normalizeScorePlayer(players[3]),
    ],
  };
}

function normalizeScorePlayer(raw: unknown): ScorePlayer {
  if (!isRecord(raw)) return emptyScorePlayer();
  if (raw.type === "member") return parseScorePlayerKey(`member:${String(raw.memberId || "")}`);
  if (raw.type === "walkin") return parseScorePlayerKey(`walkin:${String(raw.walkinNumber || "")}`);
  return emptyScorePlayer();
}

function normalizeNumber(raw: unknown) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function getMembers() {
  if (!hasServerSupabaseConfig) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("members")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as Member[];
}

export async function getActiveMembers(date: string) {
  if (!hasServerSupabaseConfig) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("member_status_periods")
    .select("member_id,status,members(member_id,name,joined_date,note)")
    .lte("start_date", date)
    .or(`end_date.is.null,end_date.gte.${date}`)
    .order("status", { ascending: true });
  if (error) throw error;

  return ((data || []) as ActiveMemberRow[]).map((row) => ({
    member_id: row.member_id,
    status: row.status,
    member: Array.isArray(row.members) ? row.members[0] : row.members,
  }));
}

export async function getMemberStatus(memberId: number, date: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("member_status_periods")
    .select("status")
    .eq("member_id", memberId)
    .lte("start_date", date)
    .or(`end_date.is.null,end_date.gte.${date}`)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.status as "fixed" | "former_fixed" | undefined;
}

export async function getSessionByDate(date: string) {
  if (!hasServerSupabaseConfig) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("sessions")
    .select("*")
    .eq("session_date", date)
    .maybeSingle();
  if (error) throw error;
  return data as Session | null;
}

export async function getSessionParticipants(sessionId: number, date: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("session_stake_points")
    .select("*,members(member_id,name,joined_date,note)")
    .eq("session_id", sessionId)
    .order("id", { ascending: true });
  if (error) throw error;

  const rows = (data || []) as SessionParticipant[];
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      status: await getMemberStatus(row.member_id, date),
    }))
  );
}

export async function getSessionWalkins(sessionId: number) {
  const { data, error } = await getSupabaseAdmin()
    .from("session_walkins")
    .select("*")
    .eq("session_id", sessionId)
    .order("walkin_number", { ascending: true })
    .order("fee_type", { ascending: false });
  if (error) throw error;
  return (data || []) as SessionWalkin[];
}

export async function getDailyScorecard(date: string) {
  if (!hasServerSupabaseConfig) {
    return {
      score_date: date,
      payload: { sets: [] },
      settled_at: null,
      updated_at: null,
    } satisfies DailyScorecard;
  }

  const { data, error } = await getSupabaseAdmin()
    .from("daily_scorecards")
    .select("*")
    .eq("score_date", date)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      score_date: date,
      payload: { sets: [] },
      settled_at: null,
      updated_at: null,
    } satisfies DailyScorecard;
  }

  const row = data as DailyScorecardRow;
  return {
    ...row,
    payload: normalizeScorecardPayload(row.payload),
  } satisfies DailyScorecard;
}

export async function getWalkinReceivables() {
  if (!hasServerSupabaseConfig) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("session_walkins")
    .select("*,sessions(session_date)")
    .order("is_paid", { ascending: true })
    .order("id", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []) as WalkinReceivable[];
}

export async function getWalkinsByMonth(month: string) {
  if (!hasServerSupabaseConfig) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("session_walkins")
    .select("*,sessions!inner(session_date)")
    .gte("sessions.session_date", `${month}-01`)
    .lt("sessions.session_date", nextMonth(month))
    .order("session_date", { referencedTable: "sessions", ascending: false })
    .order("walkin_number", { ascending: true })
    .order("fee_type", { ascending: false });
  if (error) throw error;
  return (data || []) as WalkinByDay[];
}

export async function getCharges() {
  if (!hasServerSupabaseConfig) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("charges")
    .select("*,members(member_id,name,joined_date,note),payments(amount_paid)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []) as Charge[];
}

export async function getMemberPaymentsByMonth(month: string) {
  if (!hasServerSupabaseConfig) return [] as MonthlyMemberPayment[];
  const { data, error } = await getSupabaseAdmin()
    .from("payments")
    .select(
      "payment_id,amount_paid,paid_date,payment_method,note,charges!inner(charge_id,charge_type,amount,period_month,members!inner(member_id,name,joined_date,note))"
    )
    .gte("paid_date", `${month}-01`)
    .lt("paid_date", nextMonth(month))
    .order("paid_date", { ascending: false })
    .order("payment_id", { ascending: false });
  if (error) throw error;
  return (data || []) as MonthlyMemberPayment[];
}

export async function getMemberBalances() {
  if (!hasServerSupabaseConfig) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("member_balance")
    .select("*")
    .order("outstanding_debt", { ascending: false });
  if (error) throw error;
  return (data || []) as MemberBalance[];
}

export async function getExpenses(month?: string) {
  if (!hasServerSupabaseConfig) return [];
  let query = getSupabaseAdmin()
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false })
    .limit(200);
  if (month) {
    query = query.gte("expense_date", `${month}-01`).lt("expense_date", nextMonth(month));
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Expense[];
}

export async function getMonthSummary(month: string) {
  if (!hasServerSupabaseConfig) {
    return {
      openingBalance: 0,
      paymentsTotal: 0,
      walkinsTotal: 0,
      expensesTotal: 0,
      closingEstimate: 0,
      balances: [] as MemberBalance[],
    };
  }

  const start = `${month}-01`;
  const end = nextMonth(month);
  const supabase = getSupabaseAdmin();

  const [snapshot, payments, walkins, expenses, balances] = await Promise.all([
    supabase
      .from("monthly_fund_snapshot")
      .select("opening_balance")
      .eq("period_month", month)
      .maybeSingle(),
    supabase
      .from("payments")
      .select("amount_paid")
      .gte("paid_date", start)
      .lt("paid_date", end),
    supabase
      .from("session_walkins")
      .select("amount_collected,sessions!inner(session_date)")
      .eq("is_paid", 1)
      .gte("sessions.session_date", start)
      .lt("sessions.session_date", end),
    supabase
      .from("expenses")
      .select("amount")
      .gte("expense_date", start)
      .lt("expense_date", end),
    supabase
      .from("member_balance")
      .select("*")
      .order("outstanding_debt", { ascending: false }),
  ]);

  for (const result of [snapshot, payments, walkins, expenses, balances]) {
    if (result.error) throw result.error;
  }

  const openingBalance = snapshot.data?.opening_balance || 0;
  const paymentsTotal = ((payments.data || []) as AmountPaidRow[]).reduce(
    (sum, row) => sum + (row.amount_paid || 0),
    0
  );
  const walkinsTotal = ((walkins.data || []) as AmountCollectedRow[]).reduce(
    (sum, row) => sum + (row.amount_collected || 0),
    0
  );
  const expensesTotal = ((expenses.data || []) as AmountRow[]).reduce(
    (sum, row) => sum + (row.amount || 0),
    0
  );

  return {
    openingBalance,
    paymentsTotal,
    walkinsTotal,
    expensesTotal,
    closingEstimate: openingBalance + paymentsTotal + walkinsTotal - expensesTotal,
    balances: (balances.data || []) as MemberBalance[],
  };
}

export async function getMonthlyMemberCards(month: string) {
  if (!hasServerSupabaseConfig) return [] as MonthlyMemberCard[];

  const activeMembers = await getActiveMembers(monthEndDate(month));
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("charges")
    .select("*,payments(amount_paid),sessions(session_date)")
    .limit(1000);
  if (error) throw error;

  const fixedBaseFee = await getFeeAmount("fixed", "base_fee", `${month}-01`);
  const cards = new Map<number, MonthlyMemberCard>();

  for (const row of activeMembers) {
    cards.set(row.member_id, {
      memberId: row.member_id,
      memberNumber: String(row.member_id).padStart(2, "0"),
      name: row.member.name,
      status: row.status,
      fixedFee: row.status === "fixed" ? fixedBaseFee : 0,
      stakeFee: 0,
      giaoLuuFee: 0,
      otherFee: 0,
      totalDue: row.status === "fixed" ? fixedBaseFee : 0,
      totalPaid: 0,
      outstanding: row.status === "fixed" ? fixedBaseFee : 0,
      previousDebt: 0,
      currentUnpaid: 0,
      unpaidItems: [],
      chargeCount: 0,
    });
  }

  for (const charge of (data || []) as MonthlyChargeRow[]) {
    const card = cards.get(charge.member_id);
    if (!card) continue;

    const amount = charge.amount || 0;
    const paid = (charge.payments || []).reduce(
      (sum, payment) => sum + (payment.amount_paid || 0),
      0
    );
    const outstanding = Math.max(amount - paid, 0);
    const period = chargePeriod(charge);
    const isCurrentMonth = chargeBelongsToMonth(charge, month);

    if (outstanding > 0 && period < month) {
      card.previousDebt += outstanding;
      card.unpaidItems.push({
        chargeId: charge.charge_id,
        label: chargeTypeLabels[charge.charge_type] || charge.charge_type,
        amount,
        paid,
        outstanding,
        period,
      });
    }

    if (!isCurrentMonth) continue;

    if (charge.charge_type === "monthly_fixed_fee") {
      card.fixedFee = amount;
    } else if (
      charge.charge_type === "monthly_stake_fee" ||
      charge.charge_type === "session_stake_fee"
    ) {
      card.stakeFee += amount;
    } else if (charge.charge_type === "session_giaoluu_fee") {
      card.giaoLuuFee += amount;
    } else {
      card.otherFee += amount;
    }

    card.totalPaid += paid;
    if (outstanding > 0) {
      card.currentUnpaid += outstanding;
      card.unpaidItems.push({
        chargeId: charge.charge_id,
        label: chargeTypeLabels[charge.charge_type] || charge.charge_type,
        amount,
        paid,
        outstanding,
        period,
      });
    }
    card.chargeCount += 1;
  }

  for (const card of cards.values()) {
    card.totalDue = card.fixedFee + card.stakeFee + card.giaoLuuFee + card.otherFee;
    card.outstanding = card.previousDebt + Math.max(card.totalDue - card.totalPaid, 0);
  }

  return Array.from(cards.values()).sort((a, b) => {
    if (a.status !== b.status) return a.status === "fixed" ? -1 : 1;
    if (b.outstanding !== a.outstanding) return b.outstanding - a.outstanding;
    return a.name.localeCompare(b.name, "vi");
  });
}

export async function getMemberFeeSummaries(month: string) {
  const cards = await getMonthlyMemberCards(month);
  if (!hasServerSupabaseConfig) return cards.map(memberCardToFeeSummary);

  const { data: savedRows, error: savedError } = await getSupabaseAdmin()
    .from("member_fee_summaries")
    .select("member_id,member_status,items,total_due,total_paid,outstanding,members(name)")
    .eq("period_month", month);

  if (!savedError && savedRows && savedRows.length > 0) {
    return savedRows.map((row) => {
      const member = Array.isArray(row.members) ? row.members[0] : row.members;
      const items = Array.isArray(row.items)
        ? row.items.filter(
            (item): item is MemberFeeItem =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as MemberFeeItem).name === "string" &&
              Number.isFinite(Number((item as MemberFeeItem).amount))
          ).map((item) => ({
            name: memberFeeItemName(item.name),
            amount: Number(item.amount),
          }))
        : [];

      return {
        memberId: row.member_id,
        memberNumber: String(row.member_id).padStart(2, "0"),
        name: member?.name || `Thành viên ${row.member_id}`,
        status: row.member_status as "fixed" | "former_fixed",
        items,
        totalDue: row.total_due || 0,
        totalPaid: row.total_paid || 0,
        outstanding: row.outstanding || 0,
      };
    });
  }

  return cards.map(memberCardToFeeSummary);
}

function memberCardToFeeSummary(card: MonthlyMemberCard): MemberFeeSummary {
  const items: MemberFeeItem[] = [];
  if (card.fixedFee > 0) items.push({ name: "Tiền quỹ", amount: card.fixedFee });
  if (card.stakeFee > 0) items.push({ name: "Tiền độ", amount: card.stakeFee });
  if (card.giaoLuuFee > 0) items.push({ name: "Phí giao lưu", amount: card.giaoLuuFee });
  if (card.otherFee > 0) items.push({ name: "Khoản khác", amount: card.otherFee });
  if (card.previousDebt > 0) items.push({ name: "Nợ tồn tháng trước", amount: card.previousDebt });
  return {
    memberId: card.memberId,
    memberNumber: card.memberNumber,
    name: card.name,
    status: card.status,
    items,
    totalDue: items.reduce((sum, item) => sum + item.amount, 0),
    totalPaid: card.totalPaid,
    outstanding: card.outstanding,
  };
}

function memberFeeItemName(name: string) {
  const labels: Record<string, string> = {
    "Tien quy": "Tiền quỹ",
    "Tien do": "Tiền độ",
    "Phi giao luu": "Phí giao lưu",
    "Khoan khac": "Khoản khác",
    "No ton thang truoc": "Nợ tồn tháng trước",
  };
  return labels[name] || name;
}

export async function getFeeAmount(
  status: "fixed" | "former_fixed" | "walkin",
  component: "base_fee" | "stake_fee",
  date: string
) {
  if (!hasServerSupabaseConfig) return 0;

  const { data, error } = await getSupabaseAdmin()
    .from("fee_rules")
    .select("amount")
    .eq("member_status", status)
    .eq("fee_component", component)
    .lte("effective_from", date)
    .or(`effective_to.is.null,effective_to.gte.${date}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.amount || 0;
}

export function nextMonth(month: string) {
  const [year, rawMonth] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, rawMonth, 1));
  return d.toISOString().slice(0, 10);
}

function monthEndDate(month: string) {
  const [year, rawMonth] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, rawMonth, 0));
  return d.toISOString().slice(0, 10);
}

function chargeBelongsToMonth(charge: MonthlyChargeRow, month: string) {
  if (charge.period_month === month) return true;

  const session = Array.isArray(charge.sessions)
    ? charge.sessions[0]
    : charge.sessions;
  if (session?.session_date?.startsWith(month)) return true;

  return !charge.period_month && !charge.session_id && charge.created_at.startsWith(month);
}

function chargePeriod(charge: MonthlyChargeRow) {
  if (charge.period_month) return charge.period_month;

  const session = Array.isArray(charge.sessions)
    ? charge.sessions[0]
    : charge.sessions;
  if (session?.session_date) return session.session_date.slice(0, 7);

  return charge.created_at.slice(0, 7);
}
