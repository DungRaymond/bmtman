import {
  createFormerFixedReceivableAction,
  deleteChargeAction,
  deleteWalkinReceivableAction,
  recordPaymentAction,
  recordWalkinPaymentAction,
} from "@/app/actions";
import { ManualChargeForm } from "@/app/thu/ManualChargeForm";
import { WalkinReceivableForm } from "@/app/thu/WalkinReceivableForm";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import { loginThuAction } from "@/app/thu/auth-actions";
import { isThuRouteAuthenticated } from "@/lib/thuAuth";
import {
  chargeTypeLabels,
  currentMonthValue,
  formatDateVN,
  getActiveMembers,
  getCharges,
  getFeeAmount,
  getMemberBalances,
  getMemberPaymentsByMonth,
  getMembers,
  getWalkinReceivables,
  money,
  outstandingAmount,
  paidAmount,
  todayInputValue,
  walkinOutstandingAmount,
  walkinSessionDate,
  type MonthlyMemberPayment,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ auth?: string; next?: string }>;
};

const walkinTypeLabels: Record<string, string> = {
  session_fee: "Vãng lai theo buổi",
  stake_fee: "Tiền độ vãng lai",
};

function paymentCharge(payment: MonthlyMemberPayment) {
  return Array.isArray(payment.charges) ? payment.charges[0] : payment.charges;
}

function paymentMember(payment: MonthlyMemberPayment) {
  const charge = paymentCharge(payment);
  if (!charge) return null;
  return Array.isArray(charge.members) ? charge.members[0] : charge.members;
}

function groupPaymentsByMember(payments: MonthlyMemberPayment[]) {
  const groups = new Map<number, { name: string; payments: MonthlyMemberPayment[] }>();
  for (const payment of payments) {
    const member = paymentMember(payment);
    if (!member) continue;
    const group = groups.get(member.member_id) || { name: member.name, payments: [] };
    group.payments.push(payment);
    groups.set(member.member_id, group);
  }
  return Array.from(groups.entries()).sort(([, a], [, b]) =>
    a.name.localeCompare(b.name, "vi")
  );
}

export default async function ThuPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  if (!(await isThuRouteAuthenticated())) {
    return (
      <main className="thu-auth-page">
        <section className="thu-auth-panel">
          <div>
            <h1>Xác thực quản lý thu</h1>
            <p>Nhập mã bảo mật để mở trang quản lý thu.</p>
          </div>
          <form action={loginThuAction} className="stack-form">
            <input
              type="hidden"
              name="next"
              value={params.next?.startsWith("/thu") ? params.next : "/thu"}
            />
            <div>
              <label>Mã bảo mật</label>
              <input
                name="access_pin"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
              />
            </div>
            {params.auth === "invalid" && (
              <p className="thu-auth-error">Mã bảo mật không đúng.</p>
            )}
            <button className="btn-primary" type="submit">Mở quản lý thu</button>
          </form>
        </section>
      </main>
    );
  }

  const month = currentMonthValue();
  const today = todayInputValue();
  const [
    charges,
    balances,
    members,
    walkins,
    memberPayments,
    walkinFee,
    activeMembers,
    formerFixedFee,
  ] = await Promise.all([
    getCharges(),
    getMemberBalances(),
    getMembers(),
    getWalkinReceivables(),
    getMemberPaymentsByMonth(month),
    getFeeAmount("walkin", "base_fee", today),
    getActiveMembers(today),
    getFeeAmount("former_fixed", "base_fee", today),
  ]);
  const formerFixedMembers = activeMembers.filter(
    (row) => row.status === "former_fixed"
  );
  const paymentGroups = groupPaymentsByMember(memberPayments);
  const unpaidCharges = charges.filter((charge) => outstandingAmount(charge) > 0);
  const unpaidWalkins = walkins.filter((walkin) => walkinOutstandingAmount(walkin) > 0);
  const totalMemberDebt = balances.reduce((sum, row) => sum + row.outstanding_debt, 0);
  const totalWalkinDebt = unpaidWalkins.reduce(
    (sum, walkin) => sum + walkinOutstandingAmount(walkin),
    0
  );
  return (
    <main>
      <ConfigWarning />

      <section className="page-title">
        <div>
          <h1>Quản lý thu</h1>
          <p>Theo dõi khoản phải thu, ghi nhận thanh toán và công nợ.</p>
        </div>
      </section>

      <section className="summary-grid">
        <div className="metric">
          <span>Nợ thành viên</span>
          <strong>{money(totalMemberDebt)}</strong>
        </div>
        <div className="metric">
          <span>Khoản thành viên chưa thu</span>
          <strong>{unpaidCharges.length}</strong>
        </div>
        <div className="metric">
          <span>Vãng lai chưa thu</span>
          <strong>{money(totalWalkinDebt)}</strong>
        </div>
      </section>

      <section className="card">
        <div className="section-title">Tạo khoản thu vãng lai theo buổi</div>
        <WalkinReceivableForm
          initialDate={today}
          initialAmount={walkinFee}
        />
        <div className="form-section-divider">
          <div className="section-title">Cố định cũ đến giao lưu</div>
          <form className="compact-receivable-form" action={createFormerFixedReceivableAction}>
            <div className="receivable-date-amount-row">
              <div>
                <label>Ngày</label>
                <input name="date" type="date" defaultValue={today} required />
              </div>
              <div>
                <label>Mức thu</label>
                <input value={`${money(formerFixedFee)} / buổi`} readOnly />
              </div>
            </div>
            <div>
              <label>Thành viên cố định cũ</label>
              <select name="member_id" required>
                <option value="">Chọn thành viên</option>
                {formerFixedMembers.map((row) => (
                  <option key={row.member_id} value={row.member_id}>
                    {row.member.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn-primary"
              type="submit"
              disabled={formerFixedMembers.length === 0}
            >
              Tạo khoản giao lưu
            </button>
          </form>
        </div>
      </section>

      <section className="card">
        <div className="section-title">Tạo khoản phải thu thủ công</div>
        <ManualChargeForm
          members={members}
          chargeTypes={Object.entries(chargeTypeLabels).map(([value, label]) => ({
            value,
            label,
          }))}
          initialDate={todayInputValue()}
        />
      </section>

      <section className="card">
        <div className="section-title">Vãng lai chưa thu</div>
        <div className="table-list">
          {unpaidWalkins.length === 0 && (
            <div className="empty">Không còn khoản vãng lai chưa thu.</div>
          )}
          {unpaidWalkins.map((walkin) => {
            const sessionDate = walkinSessionDate(walkin);
            return (
              <form
                className="data-row walkin-pay-row"
                key={walkin.id}
                action={recordWalkinPaymentAction}
              >
                <input type="hidden" name="id" value={walkin.id} />
                <div>
                  <strong>
                    {walkin.walkin_name || `Vãng lai #${walkin.walkin_number}`}
                  </strong>
                  <div className="muted">
                    Vãng lai #{walkin.walkin_number} - {walkinTypeLabels[walkin.fee_type] || walkin.fee_type}
                    {sessionDate ? ` - ${formatDateVN(sessionDate)}` : ""}
                  </div>
                  <div className="muted">Phải thu {money(walkin.amount_expected)}</div>
                </div>
                <div>
                  <label>Số tiền thu</label>
                  <input
                    name="amount_collected"
                    type="number"
                    min="1"
                    defaultValue={walkinOutstandingAmount(walkin)}
                  />
                </div>
                <button className="btn-primary small-btn" type="submit">
                  Xác nhận thu
                </button>
                <button
                  className="btn-secondary small-btn"
                  formAction={deleteWalkinReceivableAction}
                  type="submit"
                >
                  Xóa
                </button>
              </form>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Khoản thành viên chưa thu</div>
        <div className="table-list">
          {unpaidCharges.length === 0 && (
            <div className="empty">Không còn khoản thành viên chưa thu.</div>
          )}
          {unpaidCharges.map((charge) => (
            <form
              className="data-row pay-row"
              key={charge.charge_id}
              action={recordPaymentAction}
            >
              <input type="hidden" name="charge_id" value={charge.charge_id} />
              <div>
                <strong>{charge.members?.name || "Không rõ"}</strong>
                <div className="muted">
                  {chargeTypeLabels[charge.charge_type] || charge.charge_type}
                  {charge.period_month ? ` - ${charge.period_month}` : ""}
                </div>
                <div className="muted">
                  Đã thu {money(paidAmount(charge))} / {money(charge.amount)}
                </div>
              </div>
              <div>
                <label>Số tiền thu</label>
                <input
                  name="amount_paid"
                  type="number"
                  min="1"
                  defaultValue={outstandingAmount(charge)}
                />
              </div>
              <div>
                <label>Ngày thu</label>
                <input
                  name="paid_date"
                  type="date"
                  defaultValue={todayInputValue()}
                />
              </div>
              <div>
                <label>Hình thức</label>
                <select name="payment_method" defaultValue="bank_transfer">
                  <option value="cash">Tiền mặt</option>
                  <option value="bank_transfer">Chuyển khoản</option>
                  <option value="e_wallet">Ví điện tử</option>
                  <option value="other">Khác</option>
                </select>
              </div>
              <div>
                <label>Người ghi nhận</label>
                <select name="recorded_by">
                  <option value="">Không chọn</option>
                  {members.map((member) => (
                    <option key={member.member_id} value={member.member_id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Ghi chú</label>
                <input name="note" />
              </div>
              <button className="btn-primary small-btn" type="submit">
                Xác nhận thu
              </button>
              <button
                className="btn-secondary small-btn"
                formAction={deleteChargeAction}
                type="submit"
              >
                Xóa
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Đã thu tháng này</div>
        <div className="received-member-list">
          {paymentGroups.length === 0 && (
            <div className="empty">Chưa thu khoản thành viên nào trong tháng này.</div>
          )}
          {paymentGroups.map(([memberId, group]) => {
            const total = group.payments.reduce(
              (sum, payment) => sum + (payment.amount_paid || 0),
              0
            );
            return (
              <details className="received-member-card" key={memberId}>
                <summary className="received-member-summary">
                  <div>
                    <strong>{group.name}</strong>
                    <span>{group.payments.length} lần thu</span>
                  </div>
                  <b>{money(total)}</b>
                </summary>
                <div className="received-payment-list">
                  {group.payments.map((payment) => {
                    const charge = paymentCharge(payment);
                    if (!charge) return null;
                    return (
                      <div className="received-payment-row" key={payment.payment_id}>
                        <div>
                          <strong>
                            {chargeTypeLabels[charge.charge_type] || charge.charge_type}
                          </strong>
                          <span>
                            {formatDateVN(payment.paid_date)}
                            {charge.period_month ? ` - Tháng ${charge.period_month}` : ""}
                          </span>
                        </div>
                        <b>{money(payment.amount_paid)}</b>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Công nợ thành viên</div>
        <div className="stats-table">
          <div className="stats-row stats-head">
            <div className="stats-name">Thành viên</div>
            <div>Phải thu</div>
            <div>Đã thu</div>
            <div>Còn nợ</div>
          </div>
          {balances.map((row) => (
            <div className="stats-row finance-row" key={row.member_id}>
              <div className="stats-name">{row.name}</div>
              <div>{money(row.total_charged)}</div>
              <div>{money(row.total_paid)}</div>
              <div className={row.outstanding_debt > 0 ? "lose-text" : "win-text"}>
                {money(row.outstanding_debt)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
