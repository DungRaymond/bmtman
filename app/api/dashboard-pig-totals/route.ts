import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/supabaseServer";

export async function GET() {
  if (!hasServerSupabaseConfig) return Response.json({ error: "Dashboard unavailable" }, { status: 503 });
  const { data, error } = await getSupabaseAdmin().from("pig_ledger").select("member_id,amount");
  if (error) return Response.json({ error: "Dashboard pig totals unavailable" }, { status: 500 });
  const totals: Record<number, number> = {};
  for (const row of data || []) totals[row.member_id] = (totals[row.member_id] || 0) + Number(row.amount);
  return Response.json(totals, { headers: { "Cache-Control": "no-store" } });
}
