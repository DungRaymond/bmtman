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
  getMonthlyMemberCards,
  getPaidWalkinsByMonth,
  money,
  walkinSessionDate,
  type MonthlyMemberCard,
  type PaidWalkinByDay,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ month?: string }>;
};

function monthLabel(month: string) {
  const [, rawMonth] = month.split("-");
  return `T${Number(rawMonth)}/${month.slice(0, 4)}`;
}

function CardLine({
  label,
  helper,
  value,
}: {
  label: string;
  helper: string;
  value: string;
}) {
  return (
    <div className="collection-card-line">
      <div>
        <span>{label}</span>
        <small>{helper}</small>
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function MemberCollectionCard({
  card,
  month,
}: {
  card: MonthlyMemberCard;
  month: string;
}) {
  const isFixed = card.status === "fixed";
  const statusText =
    card.totalDue === 0 && card.previousDebt === 0
      ? "Chua phat sinh"
      : card.outstanding === 0
        ? "Da thu du"
        : `Con no ${money(card.outstanding)}`;

  return (
    <article className="collection-card">
      <div className="collection-card-kicker">Quy nhom cau long - {monthLabel(month)}</div>
      <div className="collection-card-head">
        <div>
          <h2>{card.name}</h2>
          <p>Thanh vien #{card.memberNumber}</p>
        </div>
        <span>{isFixed ? "Co dinh" : "Co dinh cu"}</span>
      </div>

      <div className="collection-card-body">
        <CardLine
          label="Phi co dinh hang thang"
          helper={isFixed ? "Ap dung cho thanh vien co dinh" : "Khong ap dung"}
          value={isFixed ? money(card.fixedFee) : "-"}
        />
        <CardLine
          label="Tien do"
          helper={
            card.doFee > 0
              ? "Tong do phat sinh trong thang"
              : "Chua co do trong thang"
          }
          value={card.doFee > 0 ? money(card.doFee) : "-"}
        />
        <CardLine
          label="Phi giao luu ngoai lich"
          helper={
            isFixed
              ? "Khong ap dung cho thanh vien co dinh"
              : "Tinh theo tung buoi giao luu"
          }
          value={card.giaoLuuFee > 0 ? money(card.giaoLuuFee) : "-"}
        />
        {card.otherFee > 0 && (
          <CardLine
            label="Khoan khac"
            helper="Giai, ao, hoac khoan phat sinh rieng"
            value={money(card.otherFee)}
          />
        )}
        {card.previousDebt > 0 && (
          <CardLine
            label="No ton tu thang truoc"
            helper="Khoan cu chua thanh toan"
            value={money(card.previousDebt)}
          />
        )}
      </div>

      {card.unpaidItems.length > 0 && (
        <div className="collection-card-unpaid">
          <div>
            <span>Cho thanh toan</span>
            <small>{card.unpaidItems.length} khoan</small>
          </div>
          <strong>{money(card.outstanding)}</strong>
        </div>
      )}

      <div className="collection-card-total">
        <span>Tong phai thu</span>
        <strong>{money(card.totalDue + card.previousDebt)}</strong>
      </div>
      <div className="collection-card-status">
        <span>Trang thai</span>
        <strong className={card.outstanding === 0 ? "paid" : "unpaid"}>
          {statusText}
        </strong>
      </div>
    </article>
  );
}

function walkinLabel(row: PaidWalkinByDay) {
  return row.fee_type === "session_fee" ? "Phi vang lai" : "Tien do vang lai";
}

function groupPaidWalkinsByDate(rows: PaidWalkinByDay[]) {
  const groups = new Map<string, PaidWalkinByDay[]>();
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
  const [summary, memberCards, formerFixedFee, walkinFee, paidWalkins] =
    await Promise.all([
      getMonthSummary(month),
      getMonthlyMemberCards(month),
      getFeeAmount("former_fixed", "base_fee", `${month}-01`),
      getFeeAmount("walkin", "base_fee", `${month}-01`),
      getPaidWalkinsByMonth(month),
    ]);
  const paidWalkinGroups = groupPaidWalkinsByDate(paidWalkins);
  const fixedCards = memberCards.filter((card) => card.status === "fixed");
  const formerFixedCards = memberCards.filter(
    (card) => card.status === "former_fixed"
  );
  const totalDebt = summary.balances.reduce(
    (sum, row) => sum + row.outstanding_debt,
    0
  );
  const fixedDebtTotal = fixedCards.reduce(
    (sum, card) => sum + card.outstanding,
    0
  );
  const formerFixedDebtTotal = formerFixedCards.reduce(
    (sum, card) => sum + card.outstanding,
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
        <div className="debt-summary-card">
          <div>
            <span>Cong no thanh vien co dinh</span>
            <strong>{money(fixedDebtTotal)}</strong>
          </div>
          <small>{fixedCards.filter((card) => card.outstanding > 0).length} nguoi con no</small>
        </div>
        <div className="debt-summary-card">
          <div>
            <span>Cong no co dinh cu</span>
            <strong>{money(formerFixedDebtTotal)}</strong>
          </div>
          <small>
            {formerFixedCards.filter((card) => card.outstanding > 0).length} nguoi con no
          </small>
        </div>
      </section>

      <section className="collection-section">
        <div className="section-title">The tong ket thanh vien co dinh</div>
        {fixedCards.length === 0 ? (
          <div className="empty">Khong co thanh vien co dinh trong thang nay.</div>
        ) : (
          <div className="collection-card-grid">
            {fixedCards.map((card) => (
              <MemberCollectionCard key={card.memberId} card={card} month={month} />
            ))}
          </div>
        )}
      </section>

      <section className="collection-section">
        <div className="section-title">The tong ket co dinh cu</div>
        {formerFixedCards.length === 0 ? (
          <div className="empty">Khong co thanh vien co dinh cu trong thang nay.</div>
        ) : (
          <div className="collection-card-grid">
            {formerFixedCards.map((card) => (
              <MemberCollectionCard key={card.memberId} card={card} month={month} />
            ))}
          </div>
        )}
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
        <div className="section-title">Vang lai da thu theo ngay</div>
        <div className="walkin-day-list">
          {paidWalkinGroups.length === 0 && (
            <div className="empty">Chua co khoan vang lai da thu trong thang nay.</div>
          )}
          {paidWalkinGroups.map(([date, rows]) => {
            const dayTotal = rows.reduce(
              (sum, row) => sum + (row.amount_collected || 0),
              0
            );
            return (
              <div className="walkin-day-card" key={date}>
                <div className="walkin-day-head">
                  <div>
                    <strong>{formatDateVN(date)}</strong>
                    <span>{rows.length} khoan da thu</span>
                  </div>
                  <b>{money(dayTotal)}</b>
                </div>
                <div className="walkin-day-items">
                  {rows.map((row) => (
                    <div className="walkin-day-item" key={row.id}>
                      <div>
                        <strong>Vang lai #{row.walkin_number}</strong>
                        <span>{walkinLabel(row)}</span>
                      </div>
                      <b>{money(row.amount_collected)}</b>
                    </div>
                  ))}
                </div>
              </div>
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
