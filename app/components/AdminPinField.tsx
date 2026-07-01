import { shouldAskForAdminPin } from "@/lib/security";

export function AdminPinField() {
  if (!shouldAskForAdminPin) return null;

  return (
    <div>
      <label>Mã quản trị</label>
      <input
        name="admin_pin"
        type="password"
        autoComplete="current-password"
        required
      />
    </div>
  );
}
