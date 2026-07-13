import { hasServerSupabaseConfig } from "@/lib/supabaseServer";

export function ConfigWarning() {
  if (hasServerSupabaseConfig) return null;

  return (
    <div className="config-warning">
      Chưa cấu hình server Supabase. Trên Vercel cần có{" "}
      <code>SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> và{" "}
      <code>THU_ACCESS_PIN</code>.
    </div>
  );
}
