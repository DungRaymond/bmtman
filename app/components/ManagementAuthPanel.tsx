import { loginThuAction } from "@/app/thu/auth-actions";
import { isAllowedManagementPath } from "@/lib/thuAuth";

type ManagementAuthPanelProps = {
  nextPath: string;
};

export function ManagementAuthPanel({ nextPath }: ManagementAuthPanelProps) {
  const safeNextPath = isAllowedManagementPath(nextPath) ? nextPath : "/thu";

  return (
    <main className="thu-auth-page">
      <section className="thu-auth-panel">
        <div>
          <h1>Xác thực quản lý</h1>
          <p>Nhập khóa quản lý thu để mở khu vực tài chính.</p>
        </div>
        <form action={loginThuAction} className="stack-form">
          <input type="hidden" name="next" value={safeNextPath} />
          <div>
            <label htmlFor="management-access-pin">Mã bảo mật</label>
            <input
              id="management-access-pin"
              name="access_pin"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
            />
          </div>
          <button className="btn-primary" type="submit">Mở khu vực quản lý</button>
        </form>
      </section>
    </main>
  );
}
