import Link from "next/link";
import { saveMemberFeeSummariesAction } from "@/app/actions";
import { AdminPinField } from "@/app/components/AdminPinField";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import {
  currentMonthValue,
  getMemberFeeSummaries,
  money,
  type MemberFeeSummary,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ month?: string }>;
};

function monthLabel(month: string) {
  const [, rawMonth] = month.split("-");
  return `T${Number(rawMonth)}/${month.slice(0, 4)}`;
}

function MemberFeeCard({ card, month }: { card: MemberFeeSummary; month: string }) {
  const statusText = card.outstanding === 0 ? "Done" : "Pending";

  return (
    <article className="collection-card">
      <div className="collection-card-kicker">Quỹ nhóm cầu lông - {monthLabel(month)}</div>
      <div className="collection-card-head">
        <div>
          <h2>{card.name}</h2>
          <p>Thành viên #{card.memberNumber}</p>
        </div>
        <span>{card.status === "fixed" ? "Cố định" : "Cố định cũ"}</span>
      </div>

      <div className="collection-card-body">
        {card.items.length === 0 ? (
          <div className="collection-card-empty">Chưa có khoản cần thu trong tháng.</div>
        ) : (
          card.items.map((item) => (
            <div className="collection-card-line" key={item.name}>
              <div><span>{item.name}</span></div>
              <strong>{money(item.amount)}</strong>
            </div>
          ))
        )}
      </div>

      <div className="collection-card-total">
        <span>Tổng phải thu</span>
        <strong>{money(card.totalDue)}</strong>
      </div>
      <div className="collection-card-total collection-card-paid-total">
        <span>Đã thu</span>
        <strong>{money(card.totalPaid)}</strong>
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

export default async function MemfeeCardsPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const month = params.month || currentMonthValue();
  const cards = await getMemberFeeSummaries(month);

  return (
    <main>
      <ConfigWarning />
      <section className="page-title">
        <div>
          <h1>Memfee cards</h1>
          <p>Chi tiết các khoản cần thu của thành viên cố định và cố định cũ.</p>
        </div>
        <div className="memfee-page-actions">
          <Link className="btn-secondary" href={`/tong-hop?month=${month}`}>Tổng hợp</Link>
          <form className="inline-form" action="/tong-hop/memfee-cards" method="get">
            <input type="month" name="month" defaultValue={month} />
            <button className="btn-primary" type="submit">Xem tháng</button>
          </form>
        </div>
      </section>

      {cards.length === 0 ? (
        <div className="empty">Không có thành viên trong tháng này.</div>
      ) : (
        <section className="collection-card-grid">
          {cards.map((card) => (
            <MemberFeeCard key={card.memberId} card={card} month={month} />
          ))}
        </section>
      )}

      <section className="card memfee-save-panel">
        <div>
          <div className="section-title">Cập nhật dữ liệu thẻ</div>
          <p className="muted">Tổng hợp lại các khoản từ cơ sở dữ liệu và lưu vào JSON của tháng.</p>
        </div>
        <form className="inline-form" action={saveMemberFeeSummariesAction}>
          <input type="hidden" name="period_month" value={month} />
          <AdminPinField />
          <button className="btn-primary" type="submit">Cập nhật thẻ</button>
        </form>
      </section>
    </main>
  );
}
