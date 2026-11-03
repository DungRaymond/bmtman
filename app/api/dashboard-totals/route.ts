import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/supabaseServer";

type Row = { month: string; member_fund: number; pig: number; expense: number };

export async function GET(request: Request) {
  if (!hasServerSupabaseConfig) return Response.json({ error: "Dashboard unavailable" }, { status: 503 });
  const month = new URL(request.url).searchParams.get("month") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: "Invalid month" }, { status: 400 });
  const db = getSupabaseAdmin();
  const monthStart = `${month}-01`;
  const nextMonth = (() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const date = new Date(Date.UTC(year, monthNumber, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  })();
  const [contributions, ledger, expenses, months] = await Promise.all([
    db.from("fund_contributions").select("paid_date,amount,contribution_type").lt("paid_date", nextMonth),
    db.from("pig_ledger").select("paid_date,amount").lt("paid_date", nextMonth),
    db.from("dashboard_expenses").select("expense_date,amount").lt("expense_date", nextMonth),
    db.from("dashboard_monthly_totals").select("month").lte("month", monthStart).order("month"),
  ]);
  for (const result of [contributions, ledger, expenses, months]) {
    if (result.error) return Response.json({ error: "Dashboard totals unavailable" }, { status: 500 });
  }
  const byMonth = new Map<string, Row>();
  const getMonth = (date: string) => `${date.slice(0, 7)}-01`;
  const add = (date: string, kind: "member_fund" | "pig" | "expense", amount: number) => {
    const key = getMonth(date);
    if (key > monthStart) return;
    const row = byMonth.get(key) || { month: key, member_fund: 0, pig: 0, expense: 0 };
    row[kind] += Number(amount);
    byMonth.set(key, row);
  };
  for (const item of contributions.data || []) {
    add(item.paid_date, item.contribution_type === "pig" ? "pig" : "member_fund", item.amount);
  }
  for (const item of ledger.data || []) add(item.paid_date, "pig", item.amount);
  for (const item of expenses.data || []) add(item.expense_date, "expense", item.amount);
  for (const item of months.data || []) {
    if (!byMonth.has(item.month)) byMonth.set(item.month, { month: item.month, member_fund: 0, pig: 0, expense: 0 });
  }
  const rows = Array.from(byMonth.values()).filter((row) => row.month <= monthStart).sort((a, b) => a.month.localeCompare(b.month));
  const total = rows.reduce((sum, row) => ({
    memberFund: sum.memberFund + Number(row.member_fund),
    pig: sum.pig + Number(row.pig),
    expense: sum.expense + Number(row.expense),
  }), { memberFund: 0, pig: 0, expense: 0 });
  const row = rows.find((item) => item.month === monthStart);
  const monthly = row ? { memberFund: row.member_fund, pig: row.pig, expense: row.expense } : { memberFund: 0, pig: 0, expense: 0 };
  return Response.json({ total, monthly }, { headers: { "Cache-Control": "no-store" } });
}
