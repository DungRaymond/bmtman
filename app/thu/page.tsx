import {
  createWalkinReceivableAction,
  deleteChargeAction,
  deleteWalkinReceivableAction,
  recordPaymentAction,
  recordWalkinPaymentAction,
} from "@/app/actions";
import { ManualChargeForm } from "@/app/thu/ManualChargeForm";
import { AdminPinField } from "@/app/components/AdminPinField";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import {
  chargeTypeLabels,
  formatDateVN,
  getCharges,
  getMemberBalances,
  getMembers,
  getWalkinReceivables,
  money,
  outstandingAmount,
  paidAmount,
  todayInputValue,
  walkinOutstandingAmount,
  walkinSessionDate,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

const walkinTypeLabels: Record<string, string> = {
  session_fee: "Vang lai theo buoi",
  stake_fee: "Tien do vang lai",
};

export default async function ThuPage() {
  const [charges, balances, members, walkins] = await Promise.all([
    getCharges(),
    getMemberBalances(),
    getMembers(),
    getWalkinReceivables(),
  ]);
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
          <h1>Quan ly thu</h1>
          <p>Theo doi khoan phai thu, ghi nhan thanh toan va cong no.</p>
        </div>
      </section>

      <section className="summary-grid">
        <div className="metric">
          <span>No thanh vien</span>
          <strong>{money(totalMemberDebt)}</strong>
        </div>
        <div className="metric">
          <span>Khoan thanh vien chua thu</span>
          <strong>{unpaidCharges.length}</strong>
        </div>
        <div className="metric">
          <span>Vang lai chua thu</span>
          <strong>{money(totalWalkinDebt)}</strong>
        </div>
      </section>

      <section className="card">
        <div className="section-title">Tao khoan thu vang lai theo buoi</div>
        <form className="grid3" action={createWalkinReceivableAction}>
          <div>
            <label>Ngay buoi choi</label>
            <input name="date" type="date" defaultValue={todayInputValue()} required />
          </div>
          <div>
            <label>So thu tu vang lai</label>
            <input
              name="walkin_number"
              type="number"
              min="1"
              defaultValue={unpaidWalkins.length + 1}
              required
            />
          </div>
          <div>
            <label>Ten thanh vien vang lai</label>
            <input
              name="walkin_name"
              type="text"
              maxLength={80}
              placeholder="Nhap ten nguoi choi"
              required
            />
          </div>
          <div>
            <label>Muc thu</label>
            <input value="80.000d / buoi" readOnly />
          </div>
          <AdminPinField />
          <button className="btn-primary" type="submit">
            Tao khoan vang lai
          </button>
        </form>
      </section>

      <section className="card">
        <div className="section-title">Tao khoan phai thu thu cong</div>
        <ManualChargeForm
          members={members}
          chargeTypes={Object.entries(chargeTypeLabels).map(([value, label]) => ({
            value,
            label,
          }))}
          initialDate={todayInputValue()}
          adminPinField={<AdminPinField />}
        />
      </section>

      <section className="card">
        <div className="section-title">Vang lai chua thu</div>
        <div className="table-list">
          {unpaidWalkins.length === 0 && (
            <div className="empty">Khong con khoan vang lai chua thu.</div>
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
                    {walkin.walkin_name || `Vang lai #${walkin.walkin_number}`}
                  </strong>
                  <div className="muted">
                    Vang lai #{walkin.walkin_number} - {walkinTypeLabels[walkin.fee_type] || walkin.fee_type}
                    {sessionDate ? ` - ${formatDateVN(sessionDate)}` : ""}
                  </div>
                  <div className="muted">Phai thu {money(walkin.amount_expected)}</div>
                </div>
                <div>
                  <label>So tien thu</label>
                  <input
                    name="amount_collected"
                    type="number"
                    min="1"
                    defaultValue={walkinOutstandingAmount(walkin)}
                  />
                </div>
                <AdminPinField />
                <button className="btn-primary small-btn" type="submit">
                  Xac nhan thu
                </button>
                <button
                  className="btn-secondary small-btn"
                  formAction={deleteWalkinReceivableAction}
                  type="submit"
                >
                  Xoa
                </button>
              </form>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Khoan thanh vien chua thu</div>
        <div className="table-list">
          {unpaidCharges.length === 0 && (
            <div className="empty">Khong con khoan thanh vien chua thu.</div>
          )}
          {unpaidCharges.map((charge) => (
            <form
              className="data-row pay-row"
              key={charge.charge_id}
              action={recordPaymentAction}
            >
              <input type="hidden" name="charge_id" value={charge.charge_id} />
              <div>
                <strong>{charge.members?.name || "Khong ro"}</strong>
                <div className="muted">
                  {chargeTypeLabels[charge.charge_type] || charge.charge_type}
                  {charge.period_month ? ` - ${charge.period_month}` : ""}
                </div>
                <div className="muted">
                  Da thu {money(paidAmount(charge))} / {money(charge.amount)}
                </div>
              </div>
              <div>
                <label>So tien thu</label>
                <input
                  name="amount_paid"
                  type="number"
                  min="1"
                  defaultValue={outstandingAmount(charge)}
                />
              </div>
              <div>
                <label>Ngay thu</label>
                <input
                  name="paid_date"
                  type="date"
                  defaultValue={todayInputValue()}
                />
              </div>
              <div>
                <label>Hinh thuc</label>
                <select name="payment_method" defaultValue="bank_transfer">
                  <option value="cash">Tien mat</option>
                  <option value="bank_transfer">Chuyen khoan</option>
                  <option value="e_wallet">Vi dien tu</option>
                  <option value="other">Khac</option>
                </select>
              </div>
              <div>
                <label>Nguoi ghi nhan</label>
                <select name="recorded_by">
                  <option value="">Khong chon</option>
                  {members.map((member) => (
                    <option key={member.member_id} value={member.member_id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Ghi chu</label>
                <input name="note" />
              </div>
              <AdminPinField />
              <button className="btn-primary small-btn" type="submit">
                Xac nhan thu
              </button>
              <button
                className="btn-secondary small-btn"
                formAction={deleteChargeAction}
                type="submit"
              >
                Xoa
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Khoan thu gan day</div>
        <div className="table-list">
          {charges.length === 0 && <div className="empty">Chua co khoan thu nao.</div>}
          {charges.slice(0, 30).map((charge) => (
            <form
              className="data-row charge-delete-row"
              key={`recent-${charge.charge_id}`}
              action={deleteChargeAction}
            >
              <input type="hidden" name="charge_id" value={charge.charge_id} />
              <div>
                <strong>{charge.members?.name || "Khong ro"}</strong>
                <div className="muted">
                  {chargeTypeLabels[charge.charge_type] || charge.charge_type}
                  {charge.period_month ? ` - ${charge.period_month}` : ""}
                </div>
                <div className="muted">
                  Da thu {money(paidAmount(charge))} / {money(charge.amount)}
                </div>
              </div>
              <strong>{money(charge.amount)}</strong>
              <AdminPinField />
              <button className="btn-secondary small-btn" type="submit">
                Xoa khoan thu
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Cong no thanh vien</div>
        <div className="stats-table">
          <div className="stats-row stats-head">
            <div className="stats-name">Thanh vien</div>
            <div>Phai thu</div>
            <div>Da thu</div>
            <div>Con no</div>
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
