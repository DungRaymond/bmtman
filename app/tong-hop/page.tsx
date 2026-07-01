import {
  createMonthlySnapshotAction,
  generateMonthlyFixedFeesAction,
} from "@/app/actions";
import { AdminPinField } from "@/app/components/AdminPinField";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import {
  currentMonthValue,
  getFeeAmount,
  getMonthSummary,
  getMonthlyMemberCards,
  money,
  type MonthlyMemberCard,
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
      ? "Chưa phát sinh"
      : card.outstanding === 0
        ? "Đã thu đủ"
        : `Còn nợ ${money(card.outstanding)}`;

  return (
    <article className="collection-card">
      <div className="collection-card-kicker">Quỹ nhóm cầu lông · {monthLabel(month)}</div>
      <div className="collection-card-head">
        <div>
          <h2>{card.name}</h2>
          <p>Thành viên #{card.memberNumber}</p>
        </div>
        <span>{isFixed ? "Cố định" : "Cố định cũ"}</span>
      </div>

      <div className="collection-card-body">
        <CardLine
          label="Phí cố định hàng tháng"
          helper={isFixed ? "Áp dụng cho thành viên cố định" : "Không áp dụng"}
          value={isFixed ? money(card.fixedFee) : "—"}
        />
        <CardLine
          label="Tiền độ"
          helper={
            card.doFee > 0
              ? "Tổng độ phát sinh trong tháng"
              : "Chưa có độ trong tháng"
          }
          value={card.doFee > 0 ? money(card.doFee) : "—"}
        />
        <CardLine
          label="Phí giao lưu ngoài lịch"
          helper={
            isFixed
              ? "Không áp dụng — thành viên cố định"
              : "Tính theo từng buổi giao lưu"
          }
          value={card.giaoLuuFee > 0 ? money(card.giaoLuuFee) : "—"}
        />
        {card.otherFee > 0 && (
          <CardLine
            label="Khoản khác"
            helper="Giải, áo, hoặc khoản phát sinh riêng"
            value={money(card.otherFee)}
          />
        )}
        {card.previousDebt > 0 && (
          <CardLine
            label="Nợ tồn từ tháng trước"
            helper="Khoản cũ chưa thanh toán"
            value={money(card.previousDebt)}
          />
        )}
      </div>

      {card.unpaidItems.length > 0 && (
        <div className="collection-card-unpaid">
          <div>
            <span>Chờ thanh toán</span>
            <small>{card.unpaidItems.length} khoản</small>
          </div>
          <strong>{money(card.outstanding)}</strong>
        </div>
      )}

      <div className="collection-card-total">
        <span>Tổng phải thu</span>
        <strong>{money(card.totalDue + card.previousDebt)}</strong>
      </div>
      <div className="collection-card-status">
        <span>Trạng thái</span>
        <strong className={card.outstanding === 0 ? "paid" : "unpaid"}>
          {statusText}
        </strong>
      </div>
    </article>
  );
}

export default async function TongHopPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const month = params.month || currentMonthValue();
  const [summary, memberCards, formerFixedFee, walkinFee] = await Promise.all([
    getMonthSummary(month),
    getMonthlyMemberCards(month),
    getFeeAmount("former_fixed", "base_fee", `${month}-01`),
    getFeeAmount("walkin", "base_fee", `${month}-01`),
  ]);
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
        <div className="debt-summary-card">
          <div>
            <span>Công nợ thành viên cố định</span>
            <strong>{money(fixedDebtTotal)}</strong>
          </div>
          <small>{fixedCards.filter((card) => card.outstanding > 0).length} người còn nợ</small>
        </div>
        <div className="debt-summary-card">
          <div>
            <span>Công nợ cố định cũ</span>
            <strong>{money(formerFixedDebtTotal)}</strong>
          </div>
          <small>
            {formerFixedCards.filter((card) => card.outstanding > 0).length} người còn nợ
          </small>
        </div>
      </section>

      <section className="collection-section">
        <div className="section-title">Thẻ tổng kết thành viên cố định</div>
        {fixedCards.length === 0 ? (
          <div className="empty">Không có thành viên cố định trong tháng này.</div>
        ) : (
          <div className="collection-card-grid">
            {fixedCards.map((card) => (
              <MemberCollectionCard key={card.memberId} card={card} month={month} />
            ))}
          </div>
        )}
      </section>

      <section className="collection-section">
        <div className="section-title">Thẻ tổng kết cố định cũ</div>
        {formerFixedCards.length === 0 ? (
          <div className="empty">Không có thành viên cố định cũ trong tháng này.</div>
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
