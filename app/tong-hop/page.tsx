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
  return row.fee_type === "session_fee" ? "Phi vang lai" : "Tien do vang lai";
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
          <h1>Tong hop</h1>
          <p>Chot quy thang, xem thu chi va cong no con lai.</p>
        </div>
        <form className="inline-form" action="/tong-hop" method="get">
          <input type="month" name="month" defaultValue={month} />
          <button className="btn-secondary" type="submit">
            Xem thang
          </button>
        </form>
      </section>

      <section className="summary-grid">
        <div className="metric">
          <span>Ton dau thang</span>
          <strong>{money(summary.openingBalance)}</strong>
        </div>
        <div className="metric">
          <span>Thu thanh vien</span>
          <strong>{money(summary.paymentsTotal)}</strong>
        </div>
        <div className="metric">
          <span>Thu vang lai</span>
          <strong>{money(summary.walkinsTotal)}</strong>
        </div>
        <div className="metric">
          <span>Tong chi</span>
          <strong>{money(summary.expensesTotal)}</strong>
        </div>
        <div className="metric highlight">
          <span>Uoc tinh ton cuoi</span>
          <strong>{money(summary.closingEstimate)}</strong>
        </div>
        <div className="metric danger">
          <span>Cong no con lai</span>
          <strong>{money(totalDebt)}</strong>
        </div>
      </section>

      <section className="card">
        <div className="section-title">Tao phi co dinh thang</div>
        <form className="grid3" action={generateMonthlyFixedFeesAction}>
          <div>
            <label>Thang</label>
            <input name="period_month" type="month" defaultValue={month} required />
          </div>
          <AdminPinField />
          <button className="btn-primary" type="submit">
            Tao phi 500k cho thanh vien co dinh
          </button>
        </form>
        <p className="muted" style={{ marginTop: 10 }}>
          Co the bam lai ma khong tao trung khoan da co.
        </p>
      </section>

      <section className="debt-card-grid">
        <div className="debt-summary-card memfee-link-card">
          <div>
            <span>The tong ket chi phi thanh vien</span>
            <strong>Memfee cards</strong>
          </div>
          <Link className="btn-primary" href={`/tong-hop/memfee-cards?month=${month}`}>
            Mo danh sach
          </Link>
        </div>
      </section>

      <section className="rate-card-grid">
        <div className="rate-card">
          <span>Tung co dinh, gio giao luu</span>
          <strong>{money(formerFixedFee)}</strong>
          <small>/buoi</small>
        </div>
        <div className="rate-card accent">
          <span>Giao luu le, chua tung co dinh</span>
          <strong>{money(walkinFee)}</strong>
          <small>/buoi</small>
        </div>
      </section>

      <section className="card">
        <div className="section-title">Thu vang lai theo ngay</div>
        <div className="walkin-day-list">
          {walkinGroups.length === 0 && (
            <div className="empty">Chua co khoan vang lai trong thang nay.</div>
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
                    <span>{isComplete ? "Da thu du" : "Con thieu"}</span>
                  </div>
                  <b className={isComplete ? "complete" : "missing"}>
                    {money(collected)} / {money(expected)} da thu
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
                          {row.walkin_name || `Vang lai #${row.walkin_number}`}
                        </strong>
                        <span>
                          Vang lai #{row.walkin_number} - {walkinLabel(row)} - {rowComplete ? "Da thu" : "Con thieu"}
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
        <div className="section-title">Chot so du thang</div>
        <form className="grid3" action={createMonthlySnapshotAction}>
          <div>
            <label>Thang</label>
            <input name="period_month" type="month" defaultValue={month} required />
          </div>
          <div>
            <label>Ton dau thang</label>
            <input
              name="opening_balance"
              type="number"
              defaultValue={summary.openingBalance}
              required
            />
          </div>
          <div>
            <label>Ton cuoi da chot</label>
            <input name="closing_balance" type="number" />
          </div>
          <div className="span-2">
            <label>Ghi chu</label>
            <input name="note" />
          </div>
          <AdminPinField />
          <button className="btn-primary" type="submit">
            Luu snapshot
          </button>
        </form>
      </section>

      <section className="card">
        <div className="section-title">Top cong no</div>
        <div className="table-list">
          {summary.balances
            .filter((row) => row.outstanding_debt > 0)
            .slice(0, 10)
            .map((row) => (
              <div className="data-row" key={row.member_id}>
                <div>
                  <strong>{row.name}</strong>
                  <div className="muted">
                    Da thu {money(row.total_paid)} / phai thu{" "}
                    {money(row.total_charged)}
                  </div>
                </div>
                <strong className="lose-text">{money(row.outstanding_debt)}</strong>
              </div>
            ))}
          {summary.balances.every((row) => row.outstanding_debt <= 0) && (
            <div className="empty">Khong con cong no.</div>
          )}
        </div>
      </section>
    </main>
  );
}
