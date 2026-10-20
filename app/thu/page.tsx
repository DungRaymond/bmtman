import {
  deleteChargeAction,
  deleteWalkinReceivableAction,
  recordPaymentAction,
  recordWalkinPaymentAction,
} from "@/app/actions";
import { ManualChargeForm } from "@/app/thu/ManualChargeForm";
import { FormerFixedReceivableForm } from "@/app/thu/FormerFixedReceivableForm";
import { WalkinReceivableForm } from "@/app/thu/WalkinReceivableForm";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import { loginThuAction } from "@/app/thu/auth-actions";
import { isAllowedManagementPath, isThuRouteAuthenticated } from "@/lib/thuAuth";
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
  todayInputValue,
  walkinOutstandingAmount,
  walkinSessionDate,
  type MonthlyMemberPayment,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ auth?: string; next?: string }>;
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
              value={params.next && isAllowedManagementPath(params.next) ? params.next : "/thu"}
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
  const memberDebtRows = balances.filter((row) => row.outstanding_debt > 0);
  const totalMemberDebt = balances.reduce((sum, row) => sum + row.outstanding_debt, 0);
  const totalUnpaidCharges = unpaidCharges.reduce((sum, charge) => sum + outstandingAmount(charge), 0);
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
        <details className="received-member-card">
          <summary className="received-member-summary">
            <div><strong>Nợ thành viên</strong></div>
            <b>{money(totalMemberDebt)}</b>
          </summary>
          <div className="received-payment-list">
            {memberDebtRows.length === 0 && <div className="empty">Không có thành viên đang nợ.</div>}
            {memberDebtRows.map((row) => (
              <div className="received-payment-row" key={row.member_id}>
                <div><strong>{row.name}</strong></div>
                <b>{money(row.outstanding_debt)}</b>
              </div>
            ))}
          </div>
        </details>
        <details className="received-member-card">
          <summary className="received-member-summary">
            <div><strong>Khoản thành viên chưa thu</strong></div>
            <b>{money(totalUnpaidCharges)}</b>
          </summary>
          <div className="received-payment-list">
            {unpaidCharges.length === 0 && <div className="empty">Không còn khoản chưa thu.</div>}
            {unpaidCharges.map((charge) => {
              const session = Array.isArray(charge.sessions)
                ? charge.sessions[0]
                : charge.sessions;
              return (
                <div className="received-payment-row" key={charge.charge_id}>
                  <div>
                    <strong>{charge.members?.name || "Không rõ"}</strong>
                    {session?.session_date && <span>{formatDateVN(session.session_date)}</span>}
                  </div>
                  <b>{money(outstandingAmount(charge))}</b>
                </div>
              );
            })}
          </div>
        </details>
        <details className="received-member-card">
          <summary className="received-member-summary">
            <div><strong>Vãng lai chưa thu</strong></div>
            <b>{money(totalWalkinDebt)}</b>
          </summary>
          <div className="received-payment-list">
            {unpaidWalkins.length === 0 && <div className="empty">Không còn khoản vãng lai chưa thu.</div>}
            {unpaidWalkins.map((walkin) => {
              const sessionDate = walkinSessionDate(walkin);
              return (
                <div className="received-payment-row" key={walkin.id}>
                  <div>
                    <strong>{walkin.walkin_name || `Vãng lai #${walkin.walkin_number}`}</strong>
                    {sessionDate && <span>{formatDateVN(sessionDate)}</span>}
                  </div>
                  <b>{money(walkinOutstandingAmount(walkin))}</b>
                </div>
              );
            })}
          </div>
        </details>
      </section>

      <section className="card">
        <div className="form-title-action-row">
          <div className="section-title">Vãng lai theo buổi</div>
          <button className="btn-primary small-btn" type="submit" form="walkin-receivable-form">
            Tạo
          </button>
        </div>
        <WalkinReceivableForm
          initialDate={today}
          initialAmount={walkinFee}
        />
        <div className="form-section-divider">
          <div className="form-title-action-row">
            <div className="section-title">Cố định cũ đến giao lưu</div>
            <button
              className="btn-primary small-btn"
              type="submit"
              form="former-fixed-receivable-form"
              disabled={formerFixedMembers.length === 0}
            >
              Tạo
            </button>
          </div>
          <FormerFixedReceivableForm
            members={formerFixedMembers.map((row) => ({
              member_id: row.member_id,
              name: row.member.name,
            }))}
            initialDate={today}
            initialAmount={formerFixedFee}
          />
        </div>
      </section>

      <section className="card">
        <div className="form-title-action-row">
          <div className="section-title">Tạo khoản phải thu thủ công</div>
          <button className="btn-primary small-btn" type="submit" form="manual-charge-form">
            Tạo
          </button>
        </div>
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
        <div className="table-list unpaid-collection-list">
          {unpaidWalkins.length === 0 && (
            <div className="empty">Không còn khoản vãng lai chưa thu.</div>
          )}
          {unpaidWalkins.map((walkin) => {
            const sessionDate = walkinSessionDate(walkin);
            return (
              <details className="unpaid-collection-card" key={walkin.id}>
                <summary className="unpaid-collection-summary">
                  <time dateTime={sessionDate || undefined}>
                    {sessionDate ? formatDateVN(sessionDate) : "—"}
                  </time>
                  <strong>
                    {walkin.walkin_name || `Vãng lai #${walkin.walkin_number}`}
                  </strong>
                  <b>{money(walkinOutstandingAmount(walkin))}</b>
                </summary>
                <form
                  className="unpaid-collection-details"
                  action={recordWalkinPaymentAction}
                >
                  <input type="hidden" name="id" value={walkin.id} />
                  <div>
                    <label>Số tiền thu</label>
                    <input
                      name="amount_collected"
                      type="number"
                      min="1"
                      defaultValue={walkinOutstandingAmount(walkin)}
                    />
                  </div>
                  <div>
                    <label>Ghi chú</label>
                    <input name="note" defaultValue="Phí giao lưu buổi" />
                  </div>
                  <div className="pay-actions">
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
                  </div>
                </form>
              </details>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Khoản thành viên chưa thu</div>
        <div className="table-list unpaid-collection-list">
          {unpaidCharges.length === 0 && (
            <div className="empty">Không còn khoản thành viên chưa thu.</div>
          )}
          {unpaidCharges.map((charge) => {
            const session = Array.isArray(charge.sessions)
              ? charge.sessions[0]
              : charge.sessions;
            const chargeDate = session?.session_date || charge.created_at.slice(0, 10);
            return (
              <details className="unpaid-collection-card" key={charge.charge_id}>
                <summary className="unpaid-collection-summary">
                  <time dateTime={chargeDate}>{formatDateVN(chargeDate)}</time>
                  <strong>{charge.members?.name || "Không rõ"}</strong>
                  <b>{money(outstandingAmount(charge))}</b>
                </summary>
                <form
                  className="unpaid-collection-details"
                  action={recordPaymentAction}
                >
                  <input type="hidden" name="charge_id" value={charge.charge_id} />
                  <input type="hidden" name="paid_date" value={todayInputValue()} />
                  <input type="hidden" name="payment_method" value="bank_transfer" />
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
                    <label>Ghi chú</label>
                    <input name="note" defaultValue="Phí giao lưu buổi" />
                  </div>
                  <div className="pay-actions">
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
                  </div>
                </form>
              </details>
            );
          })}
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
