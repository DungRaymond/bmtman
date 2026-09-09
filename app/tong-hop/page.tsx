import {
  createMonthlySnapshotAction,
  generateMonthlyFixedFeesAction,
  monthlyCollectionAction,
} from "@/app/actions";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import { MoneyRatio } from "@/app/components/MoneyRatio";
import { ManagementAuthPanel } from "@/app/components/ManagementAuthPanel";
import { ConfirmCollectionButton } from "@/app/tong-hop/ConfirmCollectionButton";
import {
  currentMonthValue,
  chargeTypeLabels,
  formatDateVN,
  getMonthSummary,
  getMonthlyMemberCards,
  getMonthlyWalkinCollectionCards,
  getMemberFeeSummaries,
  getMemberPaymentsByMonth,
  getWalkinFeeSummaries,
  getWalkinsByMonth,
  money,
  todayInputValue,
  walkinPlanFieldPrefix,
  walkinSessionDate,
  type WalkinByDay,
  type MonthlyMemberPayment,
  type MonthlyWalkinCollectionCard,
  type WalkinFeeSummary,
} from "@/lib/finance";
import { isThuRouteAuthenticated } from "@/lib/thuAuth";
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

function paymentCharge(payment: MonthlyMemberPayment) {
  return Array.isArray(payment.charges) ? payment.charges[0] : payment.charges;
}

function paymentMember(payment: MonthlyMemberPayment) {
  const charge = paymentCharge(payment);
  if (!charge) return null;
  return Array.isArray(charge.members) ? charge.members[0] : charge.members;
}

function groupMemberPaymentsByDate(rows: MonthlyMemberPayment[]) {
  const groups = new Map<string, MonthlyMemberPayment[]>();
  for (const row of rows) {
    groups.set(row.paid_date, [...(groups.get(row.paid_date) || []), row]);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
}

const collectionComponents = [
  { key: "fixed", label: "Tiền quỹ" },
  { key: "stake", label: "Tiền độ" },
  { key: "giao_luu", label: "Phí giao lưu" },
  { key: "other", label: "Khoản khác" },
] as const;

function savedComponentAmount(
  savedItems: { name: string; amount: number }[] | undefined,
  label: string,
  fallback: number
) {
  if (!savedItems) return fallback;
  return savedItems.find((item) => item.name === label)?.amount || 0;
}

function InteractiveWalkinCollectionCard({
  card,
  saved,
}: {
  card: MonthlyWalkinCollectionCard;
  saved?: WalkinFeeSummary;
}) {
  const prefix = walkinPlanFieldPrefix(card.groupKey);
  const plannedAmount = saved?.totalDue ?? card.totalOutstanding;

  return (
    <article className="monthly-collection-member">
      <div className="monthly-collection-member-head">
        <div>
          <strong>{card.name}</strong>
          <span>Vãng lai</span>
        </div>
        <b>{money(plannedAmount)}</b>
      </div>
      <div className="monthly-collection-options">
        <div className="monthly-collection-option">
          <label>
            <input
              name={`${prefix}_selected`}
              type="checkbox"
              defaultChecked={plannedAmount > 0}
            />
            <span>Vãng lai chưa thu ({card.count} khoản)</span>
          </label>
          <input
            name={`${prefix}_amount`}
            type="number"
            min="0"
            max={card.totalOutstanding}
            step="1000"
            defaultValue={plannedAmount}
            aria-label={`Khoản vãng lai của ${card.name}`}
          />
        </div>
      </div>
      <div className="monthly-collection-status">
        <span>Trạng thái thu</span>
        <strong className={saved?.isSaved ? "partial" : "unpaid"}>
          {saved?.isSaved ? "Đã lên kế hoạch" : "Chưa lưu kế hoạch"}
        </strong>
        {saved?.summaryId && saved.totalDue > 0 && (
          <button
            className="btn-primary small-btn"
            type="submit"
            name="collect_walkin_summary_id"
            value={String(saved.summaryId)}
            data-confirm-collection
          >
            Xác nhận đã thu
          </button>
        )}
      </div>
    </article>
  );
}

export default async function TongHopPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  if (!(await isThuRouteAuthenticated())) {
    return <ManagementAuthPanel nextPath="/tong-hop" />;
  }
  const month = params.month || currentMonthValue();
  const [summary, walkins, memberPayments, monthlyCards, feeSummaries, walkinCollectionCards, walkinFeeSummaries] =
    await Promise.all([
      getMonthSummary(month),
      getWalkinsByMonth(month),
      getMemberPaymentsByMonth(month),
      getMonthlyMemberCards(month),
      getMemberFeeSummaries(month),
      getMonthlyWalkinCollectionCards(month),
      getWalkinFeeSummaries(month),
    ]);
  const walkinGroups = groupWalkinsByDate(walkins);
  const unpaidWalkinGroups = walkinCollectionCards;
  const memberPaymentGroups = groupMemberPaymentsByDate(memberPayments);
  const memberDebt = summary.balances.reduce(
    (sum, row) => sum + row.outstanding_debt,
    0
  );
  const unpaidWalkinTotal = unpaidWalkinGroups.reduce(
    (sum, group) => sum + group.totalOutstanding,
    0
  );
  const totalDebt = memberDebt + unpaidWalkinTotal;
  const feeSummaryByMember = new Map(feeSummaries.map((card) => [card.memberId, card]));
  const walkinSummaryByGroup = new Map(
    walkinFeeSummaries
      .filter((summary) => summary.collectionStatus === "planned")
      .map((summary) => [summary.groupKey, summary])
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
        <form className="inline-form" action="/tong-hop/export" method="get">
          <input type="month" name="from" defaultValue={month} aria-label="Từ tháng" />
          <span>đến</span>
          <input type="month" name="to" defaultValue={month} aria-label="Đến tháng" />
          <button className="btn-secondary" type="submit">
            Xuất Excel
          </button>
        </form>
      </section>

      <section className="summary-grid">
        <div className={summary.openingBalance < 0 ? "metric danger" : "metric"}>
          <span>Tồn đầu tháng</span>
          <strong>{money(summary.openingBalance)}</strong>
        </div>
        <details className="metric summary-money-accordion">
          <summary>
            <div>
              <span>Đã thu thành viên</span>
              <strong>{money(summary.paymentsTotal)}</strong>
            </div>
          </summary>
          <div className="summary-money-details">
            {memberPaymentGroups.length === 0 && (
              <div className="empty">Chưa có khoản thu thành viên trong tháng này.</div>
            )}
            {memberPaymentGroups.map(([date, payments]) => {
              const dayTotal = payments.reduce(
                (sum, payment) =>
                  sum + (payment.excludedFromFund ? 0 : payment.amount_paid || 0),
                0
              );
              return (
                <details className="walkin-day-card" key={date}>
                  <summary className="walkin-day-head">
                    <strong>{formatDateVN(date)}</strong>
                    <b>{money(dayTotal)}</b>
                  </summary>
                  <div className="walkin-day-items">
                    {payments.map((payment) => {
                      const charge = paymentCharge(payment);
                      const member = paymentMember(payment);
                      if (!charge || !member) return null;
                      return (
                        <div className="walkin-day-item" key={payment.payment_id}>
                          <div>
                            <strong>{member.name}</strong>
                            <span>
                              {chargeTypeLabels[charge.charge_type] || charge.charge_type}
                              {payment.excludedFromFund ? " · Không tính vào quỹ" : ""}
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
        </details>
        <details className="metric summary-money-accordion">
          <summary>
            <div>
              <span>Đã thu vãng lai</span>
              <strong>{money(summary.walkinsTotal)}</strong>
            </div>
          </summary>
          <div className="summary-money-details walkin-day-list">
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
              return (
                <details className="walkin-day-card" key={date}>
                  <summary className="walkin-day-head">
                    <div>
                      <strong>{formatDateVN(date)}</strong>
                    </div>
                    <MoneyRatio paid={collected} total={expected} />
                  </summary>
                  <div className="walkin-day-items">
                    {rows.map((row) => {
                      const rowCollected = row.amount_collected || 0;
                      const rowExpected = row.amount_expected || 0;
                      return (
                        <div className="walkin-day-item" key={row.id}>
                          <div>
                            <strong>
                              {row.walkin_name || `Vãng lai #${row.walkin_number}`}
                            </strong>
                            <span>
                              Vãng lai #{row.walkin_number} - {walkinLabel(row)}
                            </span>
                          </div>
                          <MoneyRatio paid={rowCollected} total={rowExpected} />
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        </details>
        <details
          className="metric summary-money-accordion"
          open={unpaidWalkinGroups.length > 0}
        >
          <summary>
            <div>
              <span>Vãng lai chưa thu</span>
              <strong>{money(unpaidWalkinTotal)}</strong>
            </div>
          </summary>
          <div className="summary-money-details">
            {unpaidWalkinGroups.length === 0 && (
              <div className="empty">Không còn khoản vãng lai chưa thu.</div>
            )}
            {unpaidWalkinGroups.map((group) => (
              <div className="walkin-day-item" key={group.groupKey}>
                <div>
                  <strong>{group.name}</strong>
                  <span>{group.count} khoản chưa thu</span>
                </div>
                <b>{money(group.totalOutstanding)}</b>
              </div>
            ))}
          </div>
        </details>
        <div className="metric">
          <span>Tổng chi</span>
          <strong>{money(summary.expensesTotal)}</strong>
        </div>
        <div className={summary.closingEstimate < 0 ? "metric danger" : "metric highlight"}>
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
          <button className="btn-primary" type="submit">
            Tạo phí quỹ và gom tiền độ tháng
          </button>
        </form>
        <p className="muted" style={{ marginTop: 10 }}>
          Có thể bấm lại mà không tạo trùng khoản đã có.
        </p>
      </section>

      <section className="card monthly-collection-card">
        <div className="section-title">Chọn khoản thu tháng</div>
        <p className="muted monthly-collection-help">
          Chọn khoản thực tế cần chốt cho từng thành viên và các khoản vãng lai cần thu.
          Tiền độ và phí giao lưu đã gồm phần còn thiếu từ các tháng trước để có thể thu gộp một lần.
        </p>
        {monthlyCards.length === 0 && unpaidWalkinGroups.length === 0 ? (
          <div className="empty">Chưa có thành viên hoặc chưa cấu hình dữ liệu thu.</div>
        ) : (
          <form action={monthlyCollectionAction}>
            <ConfirmCollectionButton />
            <input type="hidden" name="period_month" value={month} />
            <div className="grid3 monthly-collection-payment-fields">
              <div>
                <label htmlFor="collection-paid-date">Ngày ghi nhận thu</label>
                <input
                  id="collection-paid-date"
                  name="paid_date"
                  type="date"
                  defaultValue={todayInputValue()}
                  required
                />
              </div>
              <div>
                <label htmlFor="collection-payment-method">Hình thức thu</label>
                <select id="collection-payment-method" name="payment_method" defaultValue="cash">
                  <option value="cash">Tiền mặt</option>
                  <option value="bank_transfer">Chuyển khoản</option>
                  <option value="e_wallet">Ví điện tử</option>
                  <option value="other">Khác</option>
                </select>
              </div>
              <div>
                <label htmlFor="collection-payment-note">Ghi chú thu</label>
                <input id="collection-payment-note" name="payment_note" placeholder="Không bắt buộc" />
              </div>
            </div>
            <div className="monthly-collection-grid">
              {monthlyCards.map((card) => {
                const saved = feeSummaryByMember.get(card.memberId);
                const savedItems = saved?.isSaved ? saved.items : undefined;
                const values = {
                  fixed: savedComponentAmount(savedItems, "Tiền quỹ", card.fixedFee),
                  stake: savedComponentAmount(savedItems, "Tiền độ", card.stakeFee),
                  giao_luu: savedComponentAmount(savedItems, "Phí giao lưu", card.giaoLuuFee),
                  other: savedComponentAmount(savedItems, "Khoản khác", card.otherFee),
                };
                const total = Object.values(values).reduce((sum, amount) => sum + amount, 0);
                return (
                  <article
                    className={
                      card.status === "fixed"
                        ? "monthly-collection-member is-fixed-member"
                        : "monthly-collection-member is-former-fixed-member"
                    }
                    key={card.memberId}
                  >
                    <div className="monthly-collection-member-head">
                      <div>
                        <strong>{card.name}</strong>
                        <span>{card.status === "fixed" ? "Cố định" : "Cố định cũ"}</span>
                      </div>
                      <b>{money(total)}</b>
                    </div>
                    <div className="monthly-collection-options">
                      {collectionComponents.map((component) => {
                        const amount = values[component.key];
                        const prefix = `member_${card.memberId}_${component.key}`;
                        return (
                          <div className="monthly-collection-option" key={component.key}>
                            <label>
                              <input
                                name={`${prefix}_selected`}
                                type="checkbox"
                                defaultChecked={amount > 0}
                              />
                              <span>{component.label}</span>
                            </label>
                            <input
                              name={`${prefix}_amount`}
                              type="number"
                              min="0"
                              step="1000"
                              defaultValue={amount}
                              aria-label={`${component.label} của ${card.name}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="monthly-collection-status">
                      <span>Trạng thái thu</span>
                      <strong
                        className={
                          saved?.collectionStatus === "collected"
                            ? "paid"
                            : saved?.collectionStatus === "partially_collected"
                              ? "partial"
                              : "unpaid"
                        }
                      >
                        {saved?.collectionStatus === "collected"
                          ? "Đã thu"
                          : saved?.collectionStatus === "partially_collected"
                            ? "Thu một phần"
                            : saved?.isSaved
                              ? "Đã lên kế hoạch"
                              : "Chưa lưu kế hoạch"}
                      </strong>
                      {saved?.summaryId && saved.outstanding > 0 && saved.collectionStatus !== "collected" && (
                        <button
                          className="btn-primary small-btn"
                          type="submit"
                          name="collect_summary_id"
                          value={String(saved.summaryId)}
                          data-confirm-collection
                        >
                          Xác nhận đã thu
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
              {unpaidWalkinGroups.map((group) => (
                <InteractiveWalkinCollectionCard
                  card={group}
                  saved={walkinSummaryByGroup.get(group.groupKey)}
                  key={group.groupKey}
                />
              ))}
            </div>
            <button className="btn-primary" type="submit">
              Lưu kế hoạch thu
            </button>
          </form>
        )}
      </section>

      <section className="debt-card-grid">
        <div className="debt-summary-card">
          <div>
            <span>Thẻ tổng kết chi phí thành viên</span>
            <strong>Memfee cards</strong>
          </div>
          <Link className="btn-primary" href={`/tong-hop/memfee-cards?month=${month}`}>
            Mở danh sách
          </Link>
        </div>
        <div className="debt-summary-card">
          <div>
            <span>Tạm tính từ các thẻ đã ghi trong tháng</span>
            <strong>Thống kê tiền độ</strong>
          </div>
          <Link className="btn-primary" href={`/tong-hop/tien-do?month=${month}`}>
            Xem thống kê
          </Link>
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
          <button className="btn-primary" type="submit">
            Lưu bản chốt
          </button>
        </form>
      </section>

    </main>
  );
}
