import {
  createMonthlySnapshotAction,
  generateMonthlyFixedFeesAction,
} from "@/app/actions";
import { AdminPinField } from "@/app/components/AdminPinField";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import {
  currentMonthValue,
  formatDateVN,
  getFeeAmount,
  getMonthSummary,
  getWalkinsByMonth,
  money,
  walkinSessionDate,
  type WalkinByDay,
} from "@/lib/finance";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ month?: string }>;
};

function walkinLabel(row: WalkinByDay) {
  return row.fee_type === "session_fee" ? "Phí vãng lai" : "Tiền độ vãng lai";
}

function groupWalkinsByDate(rows: WalkinByDay[]) {
  const groups = new Map<string, WalkinByDay[]>();
  for (const row of rows) {
    const date = walkinSessionDate(row);
    if (!date) continue;
    groups.set(date, [...(groups.get(date) || []), row]);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
}

export default async function TongHopPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const month = params.month || currentMonthValue();
  const [summary, formerFixedFee, walkinFee, walkins] =
    await Promise.all([
      getMonthSummary(month),
      getFeeAmount("former_fixed", "base_fee", `${month}-01`),
      getFeeAmount("walkin", "base_fee", `${month}-01`),
      getWalkinsByMonth(month),
    ]);
  const walkinGroups = groupWalkinsByDate(walkins);
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
        <div className="section-title">Tạo phí cố định tháng</div>
        <form className="grid3" action={generateMonthlyFixedFeesAction}>
          <div>
            <label>Tháng</label>
            <input name="period_month" type="month" defaultValue={month} required />
          </div>
          <AdminPinField />
          <button className="btn-primary" type="submit">
            Tạo phí 500k cho thành viên cố định
          </button>
        </form>
        <p className="muted" style={{ marginTop: 10 }}>
          Có thể bấm lại mà không tạo trùng khoản đã có.
        </p>
      </section>

      <section className="debt-card-grid">
        <div className="debt-summary-card memfee-link-card">
          <div>
            <span>Thẻ tổng kết chi phí thành viên</span>
            <strong>Memfee cards</strong>
          </div>
          <Link className="btn-primary" href={`/tong-hop/memfee-cards?month=${month}`}>
            Mở danh sách
          </Link>
        </div>
      </section>

      <section className="rate-card-grid">
        <div className="rate-card">
          <span>Từng cố định, giờ giao lưu</span>
          <strong>{money(formerFixedFee)}</strong>
          <small>/buổi</small>
        </div>
        <div className="rate-card accent">
          <span>Giao lưu lẻ, chưa từng cố định</span>
          <strong>{money(walkinFee)}</strong>
          <small>/buổi</small>
        </div>
      </section>

      <section className="card">
        <div className="section-title">Thu vãng lai theo ngày</div>
        <div className="walkin-day-list">
          {walkinGroups.length === 0 && (
            <div className="empty">Chưa có khoản vãng lai trong tháng này.</div>
          )}
          {walkinGroups.map(([date, rows]) => {
            const collected = rows.reduce(
              (sum, row) => sum + (row.amount_collected || 0),
              0
            );
            const expected = rows.reduce(
              (sum, row) => sum + (row.amount_expected || 0),
              0
            );
            const isComplete = collected >= expected;
            return (
              <details className="walkin-day-card" key={date}>
                <summary className="walkin-day-head">
                  <div>
                    <strong>{formatDateVN(date)}</strong>
                    <span>{isComplete ? "Đã thu đủ" : "Còn thiếu"}</span>
                  </div>
                  <b className={isComplete ? "complete" : "missing"}>
                    {money(collected)} / {money(expected)} đã thu
                  </b>
                </summary>
                <div className="walkin-day-items">
                  {rows.map((row) => {
                    const rowCollected = row.amount_collected || 0;
                    const rowExpected = row.amount_expected || 0;
                    const rowComplete = rowCollected >= rowExpected;
                    return (
                    <div className="walkin-day-item" key={row.id}>
                      <div>
                        <strong>
                          {row.walkin_name || `Vãng lai #${row.walkin_number}`}
                        </strong>
                        <span>
                          Vãng lai #{row.walkin_number} - {walkinLabel(row)} - {rowComplete ? "Đã thu" : "Còn thiếu"}
                        </span>
                      </div>
                      <b className={rowComplete ? "complete" : "missing"}>
                        {money(rowCollected)} / {money(rowExpected)}
                      </b>
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
            Lưu bản chốt
          </button>
        </form>
      </section>

      <section className="card">
        <div className="section-title">Công nợ cao nhất</div>
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
