import { Dashboard } from "@/app/Dashboard";
import { getMembers } from "@/lib/finance";
import { hasDashboardAccess } from "@/lib/dashboardAuth";
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<{ month?: string; view?: string }> };
type LossRow = { member_id: number; loss_count: number; locked_count: number; paid_count: number };
type MonthlyTotalRow = { month: string; member_fund: number; pig: number; expense: number };

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


export default async function Home({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const date = today();
  const month = validMonth(params.month);
  const view = params.view === "monthly" ? "monthly" : "total";
  const [members, authorized] = await Promise.all([getMembers(), hasDashboardAccess()]);
  if (!hasServerSupabaseConfig) {
    return <main><div className="config-warning">Thiếu cấu hình SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.</div></main>;
  }
  const supabase = getSupabaseAdmin();
  const [lossResult, totalsResult] = await Promise.all([
    supabase.from("daily_member_losses").select("member_id,loss_count,locked_count,paid_count").eq("loss_date", date),
    supabase.from("dashboard_monthly_totals").select("month,member_fund,pig,expense").lte("month", `${month}-01`).order("month", { ascending: true }),
  ]);
  for (const result of [lossResult, totalsResult]) if (result.error) {
    throw new Error(`Dashboard schema missing or query failed: ${result.error.message}`);
  }

  const total = (totalsResult.data || []).reduce((sum, row) => ({
    memberFund: sum.memberFund + Number((row as MonthlyTotalRow).member_fund),
    pig: sum.pig + Number((row as MonthlyTotalRow).pig),
    expense: sum.expense + Number((row as MonthlyTotalRow).expense),
  }), { memberFund: 0, pig: 0, expense: 0 });
  const selected = (totalsResult.data || []).find((row) => row.month === `${month}-01`) as MonthlyTotalRow | undefined;
  const monthly = selected ? { memberFund: Number(selected.member_fund), pig: Number(selected.pig), expense: Number(selected.expense) } : { memberFund: 0, pig: 0, expense: 0 };

  return <Dashboard
    date={date}
    month={month}
    view={view}
    members={members.map(({ member_id, name }) => ({ member_id, name }))}
    losses={(lossResult.data || []) as LossRow[]}
    chart={{ total, monthly }}
    authorized={authorized}
  />;
}
