import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

type CreateWalkinInput = {
  sessionId: number;
  count: number;
  name: string | null;
  amount: number;
  settlementRunId?: number;
};

function canUseLegacyFallback(code?: string) {
  return code === "PGRST202" || code === "PGRST205" || code === "42703" || code === "42883";
}

export async function createWalkinReceivables(input: CreateWalkinInput) {
  const supabase = getSupabaseAdmin();
  const rpcParams = input.settlementRunId
    ? {
        p_session_id: input.sessionId,
        p_walkin_count: input.count,
        p_walkin_name: input.name,
        p_amount: input.amount,
        p_settlement_run_id: input.settlementRunId,
      }
    : {
        p_session_id: input.sessionId,
        p_walkin_count: input.count,
        p_walkin_name: input.name,
        p_amount: input.amount,
      };
  const { error: rpcError } = await supabase.rpc("create_walkin_receivables", rpcParams);
  if (!rpcError) return;
  if (!canUseLegacyFallback(rpcError.code)) {
    throw new Error(`Không tạo được khoản vãng lai (${rpcError.code}): ${rpcError.message}`);
  }

  // Hỗ trợ database cũ chưa chạy migration walkin_people.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: latest, error: findError } = await supabase
      .from("session_walkins")
      .select("walkin_number")
      .eq("session_id", input.sessionId)
      .order("walkin_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;

    const firstNumber = (latest?.walkin_number || 0) + 1;
    const rows = Array.from({ length: input.count }, (_, index) => ({
      session_id: input.sessionId,
      walkin_number: firstNumber + index,
      walkin_name: input.name,
      fee_type: "session_fee",
      amount_expected: input.amount,
      is_paid: 0,
      amount_collected: null,
      ...(input.settlementRunId
        ? { settlement_run_id: input.settlementRunId }
        : {}),
    }));
    const { error } = await supabase.from("session_walkins").insert(rows);
    if (!error) return;
    if (error.code !== "23505" || attempt === 2) {
      throw new Error(`Không tạo được khoản vãng lai (${error.code}): ${error.message}`);
    }
  }
}
