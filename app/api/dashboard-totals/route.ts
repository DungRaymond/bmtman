import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/supabaseServer";

type Row = { month: string; member_fund: number; pig: number; expense: number };

export async function GET(request: Request) {
  if (!hasServerSupabaseConfig) return Response.json({ error: "Dashboard unavailable" }, { status: 503 });
  const month = new URL(request.url).searchParams.get("month") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: "Invalid month" }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from("dashboard_monthly_totals")
    .select("month,member_fund,pig,expense").lte("month", `${month}-01`).order("month");
  if (error) return Response.json({ error: "Dashboard totals unavailable" }, { status: 500 });
  const rows = (data || []) as Row[];
  const total = rows.reduce((sum, row) => ({
    memberFund: sum.memberFund + Number(row.member_fund),
    pig: sum.pig + Number(row.pig),
    expense: sum.expense + Number(row.expense),
  }), { memberFund: 0, pig: 0, expense: 0 });
  const row = rows.find((item) => item.month === `${month}-01`);
  const monthly = row ? { memberFund: Number(row.member_fund), pig: Number(row.pig), expense: Number(row.expense) } : { memberFund: 0, pig: 0, expense: 0 };
  return Response.json({ total, monthly }, { headers: { "Cache-Control": "no-store" } });
}
