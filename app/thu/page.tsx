import {
  createManualChargeAction,
  recordPaymentAction,
} from "@/app/actions";
import { AdminPinField } from "@/app/components/AdminPinField";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import {
  chargeTypeLabels,
  currentMonthValue,
  getCharges,
  getMemberBalances,
  getMembers,
  money,
  outstandingAmount,
  paidAmount,
  todayInputValue,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

export default async function ThuPage() {
  const [charges, balances, members] = await Promise.all([
    getCharges(),
    getMemberBalances(),
    getMembers(),
  ]);
  const unpaidCharges = charges.filter((charge) => outstandingAmount(charge) > 0);

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
          <span>Nợ còn lại</span>
          <strong>
            {money(
              balances.reduce((sum, row) => sum + row.outstanding_debt, 0)
            )}
          </strong>
        </div>
        <div className="metric">
          <span>Khoản chưa thu</span>
          <strong>{unpaidCharges.length}</strong>
        </div>
        <div className="metric">
          <span>Thành viên có nợ</span>
          <strong>
            {balances.filter((row) => row.outstanding_debt > 0).length}
          </strong>
        </div>
      </section>

      <section className="card">
        <div className="section-title">Tạo khoản phải thu thủ công</div>
        <form className="grid3" action={createManualChargeAction}>
          <div>
            <label>Thành viên</label>
            <select name="member_id" required>
              <option value="">Chọn người</option>
              {members.map((member) => (
                <option key={member.member_id} value={member.member_id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Loại khoản thu</label>
            <select name="charge_type" required>
              {Object.entries(chargeTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Số tiền</label>
            <input name="amount" type="number" min="1" required />
          </div>
          <div>
            <label>Tháng áp dụng</label>
            <input name="period_month" type="month" defaultValue={currentMonthValue()} />
          </div>
          <div>
            <label>Tên sự kiện</label>
            <input name="event_name" placeholder="VD: Giải nội bộ" />
          </div>
          <div>
            <label>Ghi chú</label>
            <input name="note" />
          </div>
          <AdminPinField />
          <button className="btn-primary" type="submit">
            Tạo khoản thu
          </button>
        </form>
      </section>

      <section className="card">
        <div className="section-title">Khoản chưa thu</div>
        <div className="table-list">
          {unpaidCharges.length === 0 && (
            <div className="empty">Không còn khoản chưa thu.</div>
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
                  {charge.period_month ? ` · ${charge.period_month}` : ""}
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
                  required
                />
              </div>
              <div>
                <label>Ngày thu</label>
                <input
                  name="paid_date"
                  type="date"
                  defaultValue={todayInputValue()}
                  required
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
              <AdminPinField />
              <button className="btn-primary small-btn" type="submit">
                Xác nhận thu
              </button>
            </form>
          ))}
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
