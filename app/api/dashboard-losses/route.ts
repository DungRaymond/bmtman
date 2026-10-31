import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  if (!hasServerSupabaseConfig) return Response.json({ error: "Dashboard unavailable" }, { status: 503 });
  const date = new URL(request.url).searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Invalid date" }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from("daily_member_losses")
    .select("member_id,loss_count,locked_count,paid_count").eq("loss_date", date);
  if (error) return Response.json({ error: "Dashboard losses unavailable" }, { status: 500 });
  return Response.json(data || [], { headers: { "Cache-Control": "no-store" } });
}
