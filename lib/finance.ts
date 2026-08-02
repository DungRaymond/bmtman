import "server-only";

import { cache } from "react";
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
  walkin_person_id: number | null;
  fee_type: "session_fee" | "stake_fee";
  amount_expected: number;
  is_paid: number;
  amount_collected: number | null;
  collected_by: number | null;
  note: string | null;
};

export type ScorePlayer = {
  type: "empty" | "member" | "walkin" | "guest";
  memberId?: number;
  walkinNumber?: number;
  name?: string;
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
  latest_reopen?: {
    reopened_at: string;
    reason: string;
  } | null;
  can_reopen?: boolean;
};

export type MonthlyStakeTurn = {
  setId: string;
  setNumber: number;
  amount: number;
  losingSide: "A" | "B";
  winnerNames: string;
};

export type MonthlyStakeDay = {
  date: string;
  settled: boolean;
  total: number;
  turns: MonthlyStakeTurn[];
};

export type MonthlyStakePerson = {
  key: string;
  name: string;
  total: number;
  days: MonthlyStakeDay[];
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
  sessions?: { session_date: string } | { session_date: string }[] | null;
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

export type Payment = {
  payment_id: number;
  charge_id: number;
  amount_paid: number;
  paid_date: string;
  payment_method: "cash" | "bank_transfer" | "e_wallet" | "other" | null;
  recorded_by: number | null;
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
  previousOutstanding: number;
  currentUnpaid: number;
  unpaidItems: {
    chargeId: number;
    chargeType: string;
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
  component?: "fixed" | "stake" | "giao_luu" | "other";
};

export type MemberFeeCollectionStatus =
  | "planned"
  | "partially_collected"
  | "collected";

export type MemberFeeSummary = {
  summaryId?: number;
  memberId: number;
  memberNumber: string;
  name: string;
  status: "fixed" | "former_fixed";
  items: MemberFeeItem[];
  totalDue: number;
  totalPaid: number;
  outstanding: number;
  collectionStatus: MemberFeeCollectionStatus;
  collectedAt?: string | null;
  isSaved?: boolean;
};

export function resolveMemberFeeCollectionStatus(
  status: unknown,
  totalDue: number,
  totalPaid: number,
  outstanding: number
): MemberFeeCollectionStatus {
  if (status === "collected") return "collected";

  const due = Math.max(Number(totalDue) || 0, 0);
  const paid = Math.max(Number(totalPaid) || 0, 0);
  const debt = Math.max(Number(outstanding) || 0, 0);
  if (due > 0 && (debt <= 0 || paid >= due)) return "collected";
  if (status === "partially_collected" || paid > 0) return "partially_collected";
  return "planned";
}

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

type MonthlyChargeRow = Omit<Charge, "payments"> & {
  payments?: { amount_paid: number | null; paid_date: string }[];
  sessions?: { session_date: string } | { session_date: string }[] | null;
};

type MonthlyStakePointRow = {
  member_id: number;
  stake_points: number | null;
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
  if (player.type === "guest" && player.name) return `guest:${player.name}`;
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
  if (type === "guest") {
    const name = value.slice("guest:".length).trim().replace(/\s+/g, " ");
    if (name) return { type: "guest", name: name.slice(0, 80) };
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
  if (raw.type === "guest") return parseScorePlayerKey(`guest:${String(raw.name || "")}`);
  return emptyScorePlayer();
}

function normalizeNumber(raw: unknown) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const getMembers = cache(async function getMembers() {
  if (!hasServerSupabaseConfig) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("members")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as Member[];
});

export const getNamedWalkinNames = cache(async function getNamedWalkinNames() {
  if (!hasServerSupabaseConfig) return [] as string[];
  const supabase = getSupabaseAdmin();
  const { data: people, error: peopleError } = await supabase
    .from("walkin_people")
    .select("display_name")
    .order("display_name", { ascending: true });

  if (!peopleError) {
    return (people || []).map((row) => row.display_name).filter(Boolean) as string[];
  }
  if (peopleError.code !== "PGRST205" && peopleError.code !== "42P01") {
    throw peopleError;
  }

  const { data: walkins, error: walkinsError } = await supabase
    .from("session_walkins")
    .select("walkin_name")
    .not("walkin_name", "is", null);
  if (walkinsError) throw walkinsError;

  const names = new Map<string, string>();
  for (const row of walkins || []) {
    const name = row.walkin_name?.trim().replace(/\s+/g, " ");
    if (name) names.set(name.toLocaleLowerCase("vi"), name);
  }
  return Array.from(names.values()).sort((a, b) => a.localeCompare(b, "vi"));
});

export const getActiveMembers = cache(async function getActiveMembers(date: string) {
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
});

export const getMemberStatus = cache(async function getMemberStatus(memberId: number, date: string) {
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
});

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

export const getDailyScorecard = cache(async function getDailyScorecard(date: string) {
  if (!hasServerSupabaseConfig) {
    return {
      score_date: date,
      payload: { sets: [] },
      settled_at: null,
      updated_at: null,
    } satisfies DailyScorecard;
  }

  const supabase = getSupabaseAdmin();
  const [scorecardResult, reopenResult, settlementResult] = await Promise.all([
    supabase
      .from("daily_scorecards")
      .select("*")
      .eq("score_date", date)
      .maybeSingle(),
    supabase
      .from("daily_scorecard_reopen_log")
      .select("reopened_at,reason")
      .eq("score_date", date)
      .order("reopened_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("daily_scorecard_settlement_runs")
      .select("run_id")
      .eq("score_date", date)
      .eq("status", "settled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (scorecardResult.error) throw scorecardResult.error;
  const reopenLog = reopenResult.error ? null : reopenResult.data;
  const canReopen = settlementResult.error ? false : !!settlementResult.data;
  const data = scorecardResult.data;
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
    latest_reopen: reopenLog,
    can_reopen: canReopen,
  } satisfies DailyScorecard;
});

export async function getMonthlyStakePeople(month: string) {
  if (!hasServerSupabaseConfig) return [] as MonthlyStakePerson[];

  const supabase = getSupabaseAdmin();
  const [scorecardsResult, members, walkins] = await Promise.all([
    supabase
      .from("daily_scorecards")
      .select("score_date,payload,settled_at,updated_at")
      .gte("score_date", `${month}-01`)
      .lt("score_date", nextMonth(month))
      .order("score_date", { ascending: false }),
    getMembers(),
    getWalkinsByMonth(month),
  ]);
  if (scorecardsResult.error) throw scorecardsResult.error;

  const memberNames = new Map(members.map((member) => [member.member_id, member.name]));
  const walkinNames = new Map<string, string>();
  for (const walkin of walkins) {
    const date = walkinSessionDate(walkin);
    const name = cleanPersonName(walkin.walkin_name || "");
    if (date && name) walkinNames.set(`${date}:${walkin.walkin_number}`, name);
  }

  type MutablePerson = {
    key: string;
    name: string;
    days: Map<string, MonthlyStakeDay>;
  };
  const people = new Map<string, MutablePerson>();

  for (const rawCard of (scorecardsResult.data || []) as DailyScorecardRow[]) {
    const payload = normalizeScorecardPayload(rawCard.payload);
    for (const [setIndex, set] of payload.sets.entries()) {
      if (!set.winner || set.amount <= 0) continue;

      const winnerPlayers = set.winner === "A"
        ? set.players.slice(0, 2)
        : set.players.slice(2, 4);
      const loserPlayers = set.winner === "A"
        ? set.players.slice(2, 4)
        : set.players.slice(0, 2);
      const winnerNames = winnerPlayers
        .map((player) => scorePerson(player, rawCard.score_date, memberNames, walkinNames).name)
        .filter(Boolean)
        .join(" & ");

      for (const player of loserPlayers) {
        const person = scorePerson(player, rawCard.score_date, memberNames, walkinNames);
        if (!person.key || !person.name) continue;

        let personGroup = people.get(person.key);
        if (!personGroup) {
          personGroup = { ...person, days: new Map() };
          people.set(person.key, personGroup);
        }

        let day = personGroup.days.get(rawCard.score_date);
        if (!day) {
          day = {
            date: rawCard.score_date,
            settled: !!rawCard.settled_at,
            total: 0,
            turns: [],
          };
          personGroup.days.set(rawCard.score_date, day);
        }
        day.total += set.amount;
        day.turns.push({
          setId: set.id,
          setNumber: setIndex + 1,
          amount: set.amount,
          losingSide: set.winner === "A" ? "B" : "A",
          winnerNames,
        });
      }
    }
  }

  return Array.from(people.values())
    .map((person) => {
      const days = Array.from(person.days.values()).sort((a, b) => b.date.localeCompare(a.date));
      return {
        key: person.key,
        name: person.name,
        total: days.reduce((sum, day) => sum + day.total, 0),
        days,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi"));
}

function cleanPersonName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function scorePerson(
  player: ScorePlayer,
  date: string,
  memberNames: Map<number, string>,
  walkinNames: Map<string, string>
) {
  if (player.type === "member" && player.memberId) {
    return {
      key: `member:${player.memberId}`,
      name: memberNames.get(player.memberId) || `Thành viên #${player.memberId}`,
    };
  }
  if (player.type === "guest" && player.name) {
    const name = cleanPersonName(player.name);
    return { key: name ? `guest:${name.toLocaleLowerCase("vi")}` : "", name };
  }
  if (player.type === "walkin" && player.walkinNumber) {
    const name = walkinNames.get(`${date}:${player.walkinNumber}`) || "";
    if (name) return { key: `guest:${name.toLocaleLowerCase("vi")}`, name };
    return {
      key: `walkin:${date}:${player.walkinNumber}`,
      name: `Vãng lai #${player.walkinNumber}`,
    };
  }
  return { key: "", name: "" };
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

export const getWalkinsByMonth = cache(async function getWalkinsByMonth(month: string) {
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
});

export const getWalkinsThroughMonth = cache(async function getWalkinsThroughMonth(month: string) {
  if (!hasServerSupabaseConfig) return [] as WalkinByDay[];
  const { data, error } = await getSupabaseAdmin()
    .from("session_walkins")
    .select("*,sessions!inner(session_date)")
    .lt("sessions.session_date", nextMonth(month))
    .order("session_date", { referencedTable: "sessions", ascending: false })
    .order("walkin_number", { ascending: true })
    .order("fee_type", { ascending: false });
  if (error) throw error;
  return (data || []) as WalkinByDay[];
});

export async function getCharges() {
  if (!hasServerSupabaseConfig) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("charges")
    .select("*,members(member_id,name,joined_date,note),payments(amount_paid),sessions(session_date)")
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

export async function getPayments() {
  if (!hasServerSupabaseConfig) return [] as Payment[];
  const { data, error } = await getSupabaseAdmin()
    .from("payments")
    .select(
      "payment_id,charge_id,amount_paid,paid_date,payment_method,recorded_by,note,charges!inner(charge_id,charge_type,amount,period_month,members!inner(member_id,name,joined_date,note))"
    )
    .order("paid_date", { ascending: false })
    .order("payment_id", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data || []) as Payment[];
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

  const [snapshot, payments, walkins, expenses, balances, priorPayments, priorWalkins, priorExpenses] = await Promise.all([
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
    supabase
      .from("payments")
      .select("amount_paid")
      .lt("paid_date", start),
    supabase
      .from("session_walkins")
      .select("amount_collected,sessions!inner(session_date)")
      .eq("is_paid", 1)
      .lt("sessions.session_date", start),
    supabase
      .from("expenses")
      .select("amount")
      .lt("expense_date", start),
  ]);

  for (const result of [
    snapshot,
    payments,
    walkins,
    expenses,
    balances,
    priorPayments,
    priorWalkins,
    priorExpenses,
  ]) {
    if (result.error) throw result.error;
  }

  const calculatedOpeningBalance =
    ((priorPayments.data || []) as AmountPaidRow[]).reduce(
      (sum, row) => sum + (row.amount_paid || 0),
      0
    ) +
    ((priorWalkins.data || []) as AmountCollectedRow[]).reduce(
      (sum, row) => sum + (row.amount_collected || 0),
      0
    ) -
    ((priorExpenses.data || []) as AmountRow[]).reduce(
      (sum, row) => sum + (row.amount || 0),
      0
    );
  const openingBalance = snapshot.data?.opening_balance ?? calculatedOpeningBalance;
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
  const [chargesResult, stakePointsResult] = await Promise.all([
    supabase
      .from("charges")
      .select("*,payments(amount_paid,paid_date),sessions(session_date)")
      .limit(2000),
    supabase
      .from("session_stake_points")
      .select("member_id,stake_points,sessions(session_date)")
      .limit(5000),
  ]);
  if (chargesResult.error) throw chargesResult.error;
  if (stakePointsResult.error) throw stakePointsResult.error;

  const fixedBaseFee = await getFeeAmount("fixed", "base_fee", `${month}-01`);
  const cards = new Map<number, MonthlyMemberCard>();
  const monthlyStakeChargePeriods = new Set<string>();

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
      previousOutstanding: 0,
      currentUnpaid: row.status === "fixed" ? fixedBaseFee : 0,
      unpaidItems: [],
      chargeCount: 0,
    });
  }

  const charges = (chargesResult.data || []) as MonthlyChargeRow[];
  for (const charge of charges) {
    const card = cards.get(charge.member_id);
    if (!card) continue;

    const amount = charge.amount || 0;
    const period = chargePeriod(charge);
    const isCurrentMonth = chargeBelongsToMonth(charge, month);
    const payments = charge.payments || [];
    const paidInMonth = payments.reduce(
      (sum, payment) =>
        payment.paid_date >= `${month}-01` && payment.paid_date < nextMonth(month)
          ? sum + (payment.amount_paid || 0)
          : sum,
      0
    );
    const paidThroughMonth = payments.reduce(
      (sum, payment) =>
        payment.paid_date < nextMonth(month) ? sum + (payment.amount_paid || 0) : sum,
      0
    );
    const outstandingAtMonthEnd = Math.max(amount - paidThroughMonth, 0);

    if (charge.charge_type === "monthly_stake_fee" && period) {
      monthlyStakeChargePeriods.add(`${charge.member_id}:${period}`);
    }

    if (!isCurrentMonth) {
      if (period >= month || outstandingAtMonthEnd <= 0) continue;

      card.previousDebt += outstandingAtMonthEnd;
      card.previousOutstanding += outstandingAtMonthEnd;
      card.currentUnpaid += outstandingAtMonthEnd;
      if (charge.charge_type === "monthly_fixed_fee") {
        card.fixedFee += outstandingAtMonthEnd;
      } else if (
        charge.charge_type === "monthly_stake_fee" ||
        charge.charge_type === "session_stake_fee"
      ) {
        card.stakeFee += outstandingAtMonthEnd;
      } else if (charge.charge_type === "session_giaoluu_fee") {
        card.giaoLuuFee += outstandingAtMonthEnd;
      } else {
        card.otherFee += outstandingAtMonthEnd;
      }
      card.unpaidItems.push({
        chargeId: charge.charge_id,
        chargeType: charge.charge_type,
        label: `${chargeTypeLabels[charge.charge_type] || charge.charge_type} (${period})`,
        amount,
        paid: paidThroughMonth,
        outstanding: outstandingAtMonthEnd,
        period,
      });
      continue;
    }

    if (charge.charge_type === "monthly_fixed_fee") {
      const currentFixedBase = card.status === "fixed" ? fixedBaseFee : 0;
      const carriedFixed = Math.max(card.fixedFee - currentFixedBase, 0);
      card.currentUnpaid = Math.max(card.currentUnpaid - currentFixedBase, 0);
      card.fixedFee = amount + carriedFixed;
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

    card.totalPaid += paidInMonth;
    if (outstandingAtMonthEnd > 0) {
      card.currentUnpaid += outstandingAtMonthEnd;
      card.unpaidItems.push({
        chargeId: charge.charge_id,
        chargeType: charge.charge_type,
        label: chargeTypeLabels[charge.charge_type] || charge.charge_type,
        amount,
        paid: paidThroughMonth,
        outstanding: outstandingAtMonthEnd,
        period,
      });
    }
    card.chargeCount += 1;
  }

  for (const row of (stakePointsResult.data || []) as MonthlyStakePointRow[]) {
    const card = cards.get(row.member_id);
    if (!card || card.status !== "fixed") continue;

    const session = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
    const period = session?.session_date?.slice(0, 7) || "";
    const amount = Math.max(Number(row.stake_points) || 0, 0);
    if (!period || period > month || amount <= 0) continue;
    if (monthlyStakeChargePeriods.has(`${row.member_id}:${period}`)) continue;

    card.stakeFee += amount;
    card.currentUnpaid += amount;
    if (period < month) {
      card.previousDebt += amount;
      card.previousOutstanding += amount;
    }
  }

  for (const card of cards.values()) {
    card.totalDue = card.fixedFee + card.stakeFee + card.giaoLuuFee + card.otherFee;
    card.outstanding = card.currentUnpaid;
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
    .select("id,member_id,member_status,status,collected_at,items,total_due,total_paid,outstanding,members(name)")
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
            ...(item.component === "fixed" ||
            item.component === "stake" ||
            item.component === "giao_luu" ||
            item.component === "other"
              ? { component: item.component }
              : {}),
          }))
        : [];

      const totalDue = Math.max(Number(row.total_due) || 0, 0);
      const totalPaid = Math.min(Math.max(Number(row.total_paid) || 0, 0), totalDue);
      const outstanding = Math.max(totalDue - totalPaid, 0);

      return {
        summaryId: row.id,
        memberId: row.member_id,
        memberNumber: String(row.member_id).padStart(2, "0"),
        name: member?.name || `Thành viên ${row.member_id}`,
        status: row.member_status as "fixed" | "former_fixed",
        items,
        totalDue,
        totalPaid,
        outstanding,
        collectionStatus: resolveMemberFeeCollectionStatus(
          row.status,
          totalDue,
          totalPaid,
          outstanding
        ),
        collectedAt: row.collected_at || null,
        isSaved: true,
      };
    });
  }

  return cards.map(memberCardToFeeSummary);
}

function memberCardToFeeSummary(card: MonthlyMemberCard): MemberFeeSummary {
  const items: MemberFeeItem[] = [];
  if (card.fixedFee > 0) items.push({ name: "Tiền quỹ", amount: card.fixedFee, component: "fixed" });
  if (card.stakeFee > 0) items.push({ name: "Tiền độ", amount: card.stakeFee, component: "stake" });
  if (card.giaoLuuFee > 0) items.push({ name: "Phí giao lưu", amount: card.giaoLuuFee, component: "giao_luu" });
  if (card.otherFee > 0) items.push({ name: "Khoản khác", amount: card.otherFee, component: "other" });
  return {
    summaryId: undefined,
    memberId: card.memberId,
    memberNumber: card.memberNumber,
    name: card.name,
    status: card.status,
    items,
    totalDue: items.reduce((sum, item) => sum + item.amount, 0),
    totalPaid: card.totalPaid,
    outstanding: card.outstanding,
    collectionStatus: "planned",
    collectedAt: null,
    isSaved: false,
  };
}

function memberFeeItemName(name: string) {
  const labels: Record<string, string> = {
    "Tien quy": "Tiền quỹ",
    "Tien do": "Tiền độ",
    "Phi giao luu": "Phí giao lưu",
    "Khoan khac": "Khoản khác",
    "No ton thang truoc": "Khoản từ tháng trước",
    "Nợ tồn tháng trước": "Khoản từ tháng trước",
  };
  return labels[name] || name;
}

export const getFeeAmount = cache(async function getFeeAmount(
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
});

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
