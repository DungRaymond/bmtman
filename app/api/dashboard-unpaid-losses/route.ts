import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/supabaseServer";

type Row = { member_id: number; loss_count: number; locked_count: number; paid_count: number };
type UnpaidLoss = { member_id: number; loss_count: number; locked_count: number; paid_count: number };

export async function GET() {
  if (!hasServerSupabaseConfig) return Response.json({ error: "Dashboard unavailable" }, { status: 503 });
  const { data, error } = await getSupabaseAdmin().from("daily_member_losses").select("member_id,loss_count,locked_count,paid_count");
  if (error) return Response.json({ error: "Unpaid losses unavailable" }, { status: 500 });

  const totals = new Map<number, UnpaidLoss>();
  for (const row of (data || []) as Row[]) {
    const current = totals.get(row.member_id) || { member_id: row.member_id, loss_count: 0, locked_count: 0, paid_count: 0 };
    current.loss_count += Math.max(0, Number(row.loss_count) - Number(row.paid_count));
    current.locked_count += Math.max(0, Number(row.locked_count) - Number(row.paid_count));
    current.paid_count += Number(row.paid_count);
    totals.set(row.member_id, current);
  }
  return Response.json(
    Array.from(totals.values()), 
    { headers: { "Cache-Control": "no-store" } },
  );
}
