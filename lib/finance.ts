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
  do_points: number;
  members: Member | null;
  status?: "fixed" | "former_fixed";
};

export type SessionWalkin = {
  id: number;
  session_id: number;
  walkin_number: number;
  fee_type: "session_fee" | "do_fee";
  amount_expected: number;
  is_paid: number;
  amount_collected: number | null;
  collected_by: number | null;
  note: string | null;
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

export const chargeTypeLabels: Record<string, string> = {
  monthly_fixed_fee: "Quỹ cố định tháng",
  monthly_do_fee: "Tiền độ tháng",
  session_giaoluu_fee: "Phí giao lưu buổi",
  session_do_fee: "Tiền độ buổi",
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
    .from("session_do_points")
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

export async function getFeeAmount(
  status: "fixed" | "former_fixed" | "walkin",
  component: "base_fee" | "do_fee",
  date: string
) {
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
