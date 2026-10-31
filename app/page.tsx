import { Dashboard } from "@/app/Dashboard";
import { getMembers } from "@/lib/finance";
import { hasDashboardAccess } from "@/lib/dashboardAuth";
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<{ month?: string }> };
type LossRow = { member_id: number; loss_count: number; locked_count: number; paid_count: number };
type AmountRow = { amount: number; contribution_type?: "member_fund" | "pig" };

function today() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validMonth(raw?: string) {
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  return today().slice(0, 7);
}

function nextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
}

export default async function Home({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const date = today();
  const month = validMonth(params.month);
  const monthStart = `${month}-01`;
  const [members, authorized] = await Promise.all([getMembers(), hasDashboardAccess()]);
  if (!hasServerSupabaseConfig) {
    return <main><div className="config-warning">Thiếu cấu hình SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.</div></main>;
  }
  const supabase = getSupabaseAdmin();
  const [lossResult, incomeResult, contributionResult, expenseResult] = await Promise.all([
    supabase.from("daily_member_losses").select("member_id,loss_count,locked_count,paid_count").eq("loss_date", date),
    supabase.from("pig_ledger").select("paid_date,amount").gte("paid_date", monthStart).lt("paid_date", nextMonth(month)),
    supabase.from("fund_contributions").select("amount,contribution_type").gte("paid_date", monthStart).lt("paid_date", nextMonth(month)),
    supabase.from("dashboard_expenses").select("expense_date,amount").gte("expense_date", monthStart).lt("expense_date", nextMonth(month)),
  ]);
  for (const result of [lossResult, incomeResult, contributionResult, expenseResult]) if (result.error) {
    throw new Error(`Dashboard schema missing or query failed: ${result.error.message}`);
  }

  const pigTotal = (incomeResult.data || []).reduce((sum, row) => sum + Number((row as AmountRow).amount), 0)
    + (contributionResult.data || []).reduce((sum, row) => sum + (row.contribution_type === "pig" ? Number(row.amount) : 0), 0);
  const memberFundTotal = (contributionResult.data || []).reduce((sum, row) => sum + (row.contribution_type !== "pig" ? Number(row.amount) : 0), 0);
  const expenseTotal = (expenseResult.data || []).reduce((sum, row) => sum + Number((row as AmountRow).amount), 0);

  return <Dashboard
    date={date}
    month={month}
    members={members.map(({ member_id, name }) => ({ member_id, name }))}
    losses={(lossResult.data || []) as LossRow[]}
    chart={{ memberFund: memberFundTotal, pig: pigTotal, expense: expenseTotal }}
    authorized={authorized}
  />;
}
