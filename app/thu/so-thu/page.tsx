import Link from "next/link";
import { MoneyRatio } from "@/app/components/MoneyRatio";
import { loginThuAction } from "@/app/thu/auth-actions";
import {
  createLedgerChargeAction,
  createLedgerPaymentAction,
  createLedgerWalkinAction,
  deleteLedgerChargeAction,
  deleteLedgerPaymentAction,
  deleteLedgerWalkinAction,
  markLedgerChargeUnpaidAction,
  updateLedgerChargeAction,
  updateLedgerPaymentAction,
  updateLedgerWalkinAction,
} from "@/app/thu/so-thu/actions";
import {
  chargeTypeLabels,
  currentMonthValue,
  formatDateVN,
  getCharges,
  getMembers,
  getPayments,
  getWalkinsByMonth,
  money,
  todayInputValue,
  walkinSessionDate,
  type Payment,
} from "@/lib/finance";
import { isThuRouteAuthenticated } from "@/lib/thuAuth";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ month?: string }>;
};

const paymentMethodLabels = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  e_wallet: "Ví điện tử",
  other: "Khác",
};

function paymentCharge(payment: Payment) {
  return Array.isArray(payment.charges) ? payment.charges[0] : payment.charges;
}

function chargeMember(payment: Payment) {
  const charge = paymentCharge(payment);
  if (!charge) return null;
  return Array.isArray(charge.members) ? charge.members[0] : charge.members;
}

function groupChargesByMember(charges: Awaited<ReturnType<typeof getCharges>>) {
  const groups = new Map<number, { name: string; charges: typeof charges }>();
  for (const charge of charges) {
    const memberId = charge.member_id;
    const group = groups.get(memberId) || {
      name: charge.members?.name || "Không rõ",
      charges: [],
    };
    group.charges.push(charge);
    groups.set(memberId, group);
  }
  return Array.from(groups.values());
}

function groupPaymentsByMember(payments: Awaited<ReturnType<typeof getPayments>>) {
  const groups = new Map<number, { name: string; payments: typeof payments }>();
  for (const payment of payments) {
    const member = chargeMember(payment);
    const memberId = member?.member_id || 0;
    const group = groups.get(memberId) || {
      name: member?.name || "Không rõ",
      payments: [],
    };
    group.payments.push(payment);
    groups.set(memberId, group);
  }
  return Array.from(groups.values());
}

function groupWalkinsByDate(walkins: Awaited<ReturnType<typeof getWalkinsByMonth>>) {
  const groups = new Map<string, { date: string; walkins: typeof walkins }>();
  for (const walkin of walkins) {
    const date = walkinSessionDate(walkin);
    const key = date || "unknown";
    const group = groups.get(key) || { date, walkins: [] };
    group.walkins.push(walkin);
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}

function LedgerChargeRow({
  charge,
  members,
  returnTo,
}: {
  charge: Awaited<ReturnType<typeof getCharges>>[number];
  members: Awaited<ReturnType<typeof getMembers>>;
  returnTo: string;
}) {
  const paid = (charge.payments || []).reduce(
    (sum, payment) => sum + (payment.amount_paid || 0),
    0
  );
  const status = paid <= 0 ? "Chưa thu" : paid < charge.amount ? "Thu một phần" : "Đã thu";
  const statusClass = paid <= 0 ? "unpaid" : paid < charge.amount ? "partial" : "paid";
  const session = Array.isArray(charge.sessions) ? charge.sessions[0] : charge.sessions;
  const chargeDate = session?.session_date
    ? formatDateVN(session.session_date)
    : charge.period_month
      ? `Tháng ${charge.period_month}`
      : formatDateVN(charge.created_at.slice(0, 10));

  return (
    <details className="ledger-row" key={charge.charge_id}>
      <summary>
        <div className="ledger-charge-label">
          <strong>{chargeTypeLabels[charge.charge_type] || charge.charge_type}</strong>
          <span>{chargeDate}</span>
        </div>
        <div className="ledger-row-total">
          <MoneyRatio paid={paid} total={charge.amount} />
          <span className={`ledger-status ${statusClass}`}>{status}</span>
        </div>
      </summary>
      <form className="grid3 ledger-form" action={updateLedgerChargeAction}>
        <input type="hidden" name="charge_id" value={charge.charge_id} />
        <input type="hidden" name="return_to" value={returnTo} />
        <MemberSelect members={members} defaultValue={charge.member_id} />
        <ChargeTypeSelect defaultValue={charge.charge_type} />
        <Field label="Số tiền"><input name="amount" type="number" min="1" defaultValue={charge.amount} required /></Field>
        <Field label="Ngày tạo"><input name="created_at" type="date" defaultValue={charge.created_at} required /></Field>
        <Field label="Tháng áp dụng"><input name="period_month" type="month" defaultValue={charge.period_month || ""} /></Field>
        <Field label="Ghi chú"><input name="note" defaultValue={charge.note || ""} /></Field>
        <div className="ledger-form-actions">
          <button className="btn-primary" type="submit">Lưu thay đổi</button>
          {paid > 0 && (
            <button
              className="btn-warning"
              type="submit"
              formAction={markLedgerChargeUnpaidAction}
              title="Xóa toàn bộ lần thanh toán của khoản này"
            >
              Đặt lại chưa thu
            </button>
          )}
          <button className="btn-danger" type="submit" formAction={deleteLedgerChargeAction}>Xóa khoản</button>
        </div>
      </form>
    </details>
  );
}

function LedgerPaymentRow({
  payment,
  members,
  allCharges,
  returnTo,
}: {
  payment: Awaited<ReturnType<typeof getPayments>>[number];
  members: Awaited<ReturnType<typeof getMembers>>;
  allCharges: Awaited<ReturnType<typeof getCharges>>;
  returnTo: string;
}) {
  const charge = paymentCharge(payment);

  return (
    <details className="ledger-row" key={payment.payment_id}>
      <summary>
        <div>
          <strong>{charge ? chargeTypeLabels[charge.charge_type] || charge.charge_type : "Khoản thu"}</strong>
          <span>{formatDateVN(payment.paid_date)}</span>
        </div>
        <b>{money(payment.amount_paid)}</b>
      </summary>
      <form className="grid3 ledger-form" action={updateLedgerPaymentAction}>
        <input type="hidden" name="payment_id" value={payment.payment_id} />
        <input type="hidden" name="return_to" value={returnTo} />
        <ChargeSelect charges={allCharges} defaultValue={payment.charge_id} />
        <Field label="Số tiền đã thu"><input name="amount_paid" type="number" min="1" defaultValue={payment.amount_paid} required /></Field>
        <Field label="Ngày thu"><input name="paid_date" type="date" defaultValue={payment.paid_date} required /></Field>
        <PaymentMethodSelect defaultValue={payment.payment_method || "bank_transfer"} />
        <RecorderSelect members={members} defaultValue={payment.recorded_by} />
        <Field label="Ghi chú"><input name="note" defaultValue={payment.note || ""} /></Field>
        <div className="ledger-form-actions">
          <button className="btn-primary" type="submit">Lưu thay đổi</button>
          <button className="btn-danger" type="submit" formAction={deleteLedgerPaymentAction}>Xóa thanh toán</button>
        </div>
      </form>
    </details>
  );
}

function LedgerWalkinRow({
  walkin,
  returnTo,
}: {
  walkin: Awaited<ReturnType<typeof getWalkinsByMonth>>[number];
  returnTo: string;
}) {
  return (
    <details className="ledger-row" key={walkin.id}>
      <summary>
        <div>
          <strong>{walkin.walkin_name || `Vãng lai #${walkin.walkin_number}`}</strong>
          <span>{walkin.fee_type === "stake_fee" ? "Tiền độ" : "Phí buổi"}</span>
        </div>
        <MoneyRatio paid={walkin.amount_collected || 0} total={walkin.amount_expected} />
      </summary>
      <form className="grid3 ledger-form" action={updateLedgerWalkinAction}>
        <input type="hidden" name="id" value={walkin.id} />
        <input type="hidden" name="return_to" value={returnTo} />
        <Field label="Tên (không bắt buộc)"><input name="walkin_name" maxLength={80} defaultValue={walkin.walkin_name || ""} /></Field>
        <Field label="Số tiền phải thu"><input name="amount_expected" type="number" min="1" defaultValue={walkin.amount_expected} required /></Field>
        <Field label="Số tiền đã thu"><input name="amount_collected" type="number" min="0" defaultValue={walkin.amount_collected ?? ""} /></Field>
        <Field label="Trạng thái"><select name="is_paid" defaultValue={walkin.is_paid ? "1" : "0"}><option value="0">Chưa thu</option><option value="1">Đã thu / thu một phần</option></select></Field>
        <Field label="Ghi chú"><input name="note" defaultValue={walkin.note || ""} /></Field>
        <div className="ledger-form-actions">
          <button className="btn-primary" type="submit">Lưu thay đổi</button>
          <button className="btn-danger" type="submit" formAction={deleteLedgerWalkinAction}>Xóa khoản</button>
        </div>
      </form>
    </details>
  );
}

export default async function SoThuPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const month = /^\d{4}-\d{2}$/.test(params.month || "")
    ? params.month as string
    : currentMonthValue();
  const returnTo = `/thu/so-thu?month=${month}`;

  if (!(await isThuRouteAuthenticated())) {
    return (
      <main className="thu-auth-page">
        <section className="thu-auth-panel">
          <div>
            <h1>Xác thực sổ thu</h1>
            <p>Nhập mã bảo mật để xem và chỉnh sửa dữ liệu thu.</p>
          </div>
          <form action={loginThuAction} className="stack-form">
            <input type="hidden" name="next" value={returnTo} />
            <div>
              <label>Mã bảo mật</label>
              <input name="access_pin" type="password" autoComplete="current-password" required />
            </div>
            <button className="btn-primary" type="submit">Mở sổ thu</button>
          </form>
        </section>
      </main>
    );
  }

  const [allCharges, allPayments, walkins, members] = await Promise.all([
    getCharges(),
    getPayments(),
    getWalkinsByMonth(month),
    getMembers(),
  ]);
  const charges = allCharges.filter(
    (charge) => charge.period_month === month || charge.created_at.startsWith(month)
  );
  const chargeGroups = groupChargesByMember(charges);
  const payments = allPayments.filter((payment) => payment.paid_date.startsWith(month));
  const paymentGroups = groupPaymentsByMember(payments);
  const walkinGroups = groupWalkinsByDate(walkins);
  const today = todayInputValue();

  return (
    <main>
      <section className="page-title">
        <div>
          <h1>Sổ thu</h1>
          <p>Sửa các khoản phải thu, lần thanh toán và khoản vãng lai đã ghi nhầm.</p>
        </div>
        <div className="ledger-title-actions">
          <form className="inline-form" action="/thu/so-thu" method="get">
            <input type="month" name="month" defaultValue={month} />
            <button className="btn-secondary" type="submit">Xem tháng</button>
          </form>
          <Link className="btn-secondary" href="/thu">Quản lý thu</Link>
        </div>
      </section>

      <section className="summary-grid">
        <div className="metric"><span>Khoản phải thu</span><strong>{charges.length}</strong></div>
        <div className="metric"><span>Lần thanh toán</span><strong>{payments.length}</strong></div>
        <div className="metric"><span>Khoản vãng lai</span><strong>{walkins.length}</strong></div>
      </section>

      <section className="card ledger-section">
        <div className="section-title">Khoản phải thu thành viên</div>
        <details className="ledger-create">
          <summary>Tạo khoản phải thu</summary>
          <form className="grid3 ledger-form" action={createLedgerChargeAction}>
            <input type="hidden" name="return_to" value={returnTo} />
            <MemberSelect members={members} />
            <ChargeTypeSelect />
            <Field label="Số tiền"><input name="amount" type="number" min="1" required /></Field>
            <Field label="Ngày tạo"><input name="created_at" type="date" defaultValue={today} required /></Field>
            <Field label="Tháng áp dụng"><input name="period_month" type="month" defaultValue={month} /></Field>
            <Field label="Ghi chú"><input name="note" /></Field>
            <button className="btn-primary" type="submit">Tạo khoản</button>
          </form>
        </details>
        <div className="ledger-member-list">
          {chargeGroups.length === 0 && <div className="empty">Không có khoản phải thu trong tháng này.</div>}
          {chargeGroups.map((group) => {
            const totalPaid = group.charges.reduce(
              (sum, charge) => sum + (charge.payments || []).reduce((paid, payment) => paid + Number(payment.amount_paid || 0), 0),
              0
            );
            const totalDue = group.charges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
            return (
              <details className="ledger-member-card" key={group.name}>
                <summary className="ledger-member-summary">
                  <div>
                    <strong>{group.name}</strong>
                    <span>{group.charges.length} khoản phải thu</span>
                  </div>
                  <MoneyRatio paid={totalPaid} total={totalDue} />
                </summary>
                <div className="ledger-member-charges">
                  {group.charges.map((charge) => (
                    <LedgerChargeRow
                      key={charge.charge_id}
                      charge={charge}
                      members={members}
                      returnTo={returnTo}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section className="card ledger-section">
        <div className="section-title">Các lần đã thanh toán</div>
        <details className="ledger-create">
          <summary>Thêm lần thanh toán</summary>
          <form className="grid3 ledger-form" action={createLedgerPaymentAction}>
            <input type="hidden" name="return_to" value={returnTo} />
            <ChargeSelect charges={allCharges} />
            <Field label="Số tiền đã thu"><input name="amount_paid" type="number" min="1" required /></Field>
            <Field label="Ngày thu"><input name="paid_date" type="date" defaultValue={today} required /></Field>
            <PaymentMethodSelect />
            <RecorderSelect members={members} />
            <Field label="Ghi chú"><input name="note" /></Field>
            <button className="btn-primary" type="submit">Thêm thanh toán</button>
          </form>
        </details>
        <div className="ledger-member-list">
          {paymentGroups.length === 0 && <div className="empty">Không có lần thanh toán trong tháng này.</div>}
          {paymentGroups.map((group) => {
            const total = group.payments.reduce((sum, payment) => sum + payment.amount_paid, 0);
            return (
              <details className="ledger-member-card" key={group.name}>
                <summary className="ledger-member-summary">
                  <div>
                    <strong>{group.name}</strong>
                    <span>{group.payments.length} lần thanh toán</span>
                  </div>
                  <b>{money(total)}</b>
                </summary>
                <div className="ledger-member-charges">
                  {group.payments.map((payment) => (
                    <LedgerPaymentRow
                      key={payment.payment_id}
                      payment={payment}
                      members={members}
                      allCharges={allCharges}
                      returnTo={returnTo}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section className="card ledger-section">
        <div className="section-title">Khoản vãng lai</div>
        <details className="ledger-create">
          <summary>Tạo khoản vãng lai</summary>
          <form className="grid3 ledger-form" action={createLedgerWalkinAction}>
            <input type="hidden" name="return_to" value={returnTo} />
            <Field label="Ngày buổi chơi"><input name="session_date" type="date" defaultValue={today} required /></Field>
            <Field label="Tên (không bắt buộc)"><input name="walkin_name" maxLength={80} /></Field>
            <Field label="Số tiền phải thu"><input name="amount_expected" type="number" min="1" step="5000" defaultValue={80000} required /></Field>
            <button className="btn-primary" type="submit">Tạo khoản</button>
          </form>
        </details>
        <div className="ledger-member-list">
          {walkinGroups.length === 0 && <div className="empty">Không có khoản vãng lai trong tháng này.</div>}
          {walkinGroups.map((group) => {
            const totalPaid = group.walkins.reduce(
              (sum, walkin) => sum + Number(walkin.amount_collected || 0),
              0
            );
            const totalDue = group.walkins.reduce(
              (sum, walkin) => sum + Number(walkin.amount_expected || 0),
              0
            );
            return (
              <details className="ledger-member-card" key={group.date || "unknown"}>
                <summary className="ledger-member-summary">
                  <div>
                    <strong>{group.date ? formatDateVN(group.date) : "Không rõ ngày"}</strong>
                    <span>{group.walkins.length} khoản vãng lai</span>
                  </div>
                  <MoneyRatio paid={totalPaid} total={totalDue} />
                </summary>
                <div className="ledger-member-charges">
                  {group.walkins.map((walkin) => (
                    <LedgerWalkinRow key={walkin.id} walkin={walkin} returnTo={returnTo} />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label>{label}</label>{children}</div>;
}

function MemberSelect({ members, defaultValue }: { members: Awaited<ReturnType<typeof getMembers>>; defaultValue?: number }) {
  return <Field label="Thành viên"><select name="member_id" defaultValue={defaultValue || ""} required><option value="">Chọn thành viên</option>{members.map((member) => <option key={member.member_id} value={member.member_id}>{member.name}</option>)}</select></Field>;
}

function ChargeTypeSelect({ defaultValue = "other" }: { defaultValue?: string }) {
  return <Field label="Loại khoản"><select name="charge_type" defaultValue={defaultValue}>{Object.entries(chargeTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>;
}

function ChargeSelect({ charges, defaultValue }: { charges: Awaited<ReturnType<typeof getCharges>>; defaultValue?: number }) {
  return <Field label="Khoản phải thu"><select name="charge_id" defaultValue={defaultValue || ""} required><option value="">Chọn khoản</option>{charges.map((charge) => <option key={charge.charge_id} value={charge.charge_id}>{charge.members?.name || "Không rõ"} · {chargeTypeLabels[charge.charge_type] || charge.charge_type} · {money(charge.amount)}</option>)}</select></Field>;
}

function PaymentMethodSelect({ defaultValue = "bank_transfer" }: { defaultValue?: string }) {
  return <Field label="Hình thức"><select name="payment_method" defaultValue={defaultValue}>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>;
}

function RecorderSelect({ members, defaultValue }: { members: Awaited<ReturnType<typeof getMembers>>; defaultValue?: number | null }) {
  return <Field label="Người ghi nhận"><select name="recorded_by" defaultValue={defaultValue || ""}><option value="">Không chọn</option>{members.map((member) => <option key={member.member_id} value={member.member_id}>{member.name}</option>)}</select></Field>;
}
