import { createMonthlySnapshotAction } from "@/app/actions";
import { AdminPinField } from "@/app/components/AdminPinField";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import {
  currentMonthValue,
  getMonthSummary,
  money,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ month?: string }>;
};

export default async function TongHopPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const month = params.month || currentMonthValue();
  const summary = await getMonthSummary(month);
  const totalDebt = summary.balances.reduce(
    (sum, row) => sum + row.outstanding_debt,
    0
  );

  return (
    <main>
      <ConfigWarning />

      <section className="page-title">
        <div>
          <h1>Tổng hợp</h1>
          <p>Chốt quỹ tháng, xem thu chi và công nợ còn lại.</p>
        </div>
        <form className="inline-form" action="/tong-hop" method="get">
          <input type="month" name="month" defaultValue={month} />
          <button className="btn-secondary" type="submit">
            Xem tháng
          </button>
        </form>
      </section>

      <section className="summary-grid">
        <div className="metric">
          <span>Tồn đầu tháng</span>
          <strong>{money(summary.openingBalance)}</strong>
        </div>
        <div className="metric">
          <span>Thu thành viên</span>
          <strong>{money(summary.paymentsTotal)}</strong>
        </div>
        <div className="metric">
          <span>Thu vãng lai</span>
          <strong>{money(summary.walkinsTotal)}</strong>
        </div>
        <div className="metric">
          <span>Tổng chi</span>
          <strong>{money(summary.expensesTotal)}</strong>
        </div>
        <div className="metric highlight">
          <span>Ước tính tồn cuối</span>
          <strong>{money(summary.closingEstimate)}</strong>
        </div>
        <div className="metric danger">
          <span>Công nợ còn lại</span>
          <strong>{money(totalDebt)}</strong>
        </div>
      </section>

      <section className="card">
        <div className="section-title">Chốt số dư tháng</div>
        <form className="grid3" action={createMonthlySnapshotAction}>
          <div>
            <label>Tháng</label>
            <input name="period_month" type="month" defaultValue={month} required />
          </div>
          <div>
            <label>Tồn đầu tháng</label>
            <input
              name="opening_balance"
              type="number"
              defaultValue={summary.openingBalance}
              required
            />
          </div>
          <div>
            <label>Tồn cuối đã chốt</label>
            <input name="closing_balance" type="number" />
          </div>
          <div className="span-2">
            <label>Ghi chú</label>
            <input name="note" />
          </div>
          <AdminPinField />
          <button className="btn-primary" type="submit">
            Lưu snapshot
          </button>
        </form>
      </section>

      <section className="card">
        <div className="section-title">Top công nợ</div>
        <div className="table-list">
          {summary.balances
            .filter((row) => row.outstanding_debt > 0)
            .slice(0, 10)
            .map((row) => (
              <div className="data-row" key={row.member_id}>
                <div>
                  <strong>{row.name}</strong>
                  <div className="muted">
                    Đã thu {money(row.total_paid)} / phải thu{" "}
                    {money(row.total_charged)}
                  </div>
                </div>
                <strong className="lose-text">{money(row.outstanding_debt)}</strong>
              </div>
            ))}
          {summary.balances.every((row) => row.outstanding_debt <= 0) && (
            <div className="empty">Không còn công nợ.</div>
          )}
        </div>
      </section>
    </main>
  );
}
