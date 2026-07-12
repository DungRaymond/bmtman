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
  const statusText =
    card.totalDue === 0
      ? "Chua phat sinh"
      : card.outstanding === 0
        ? "Da thu du"
        : "Cho thanh toan";

  return (
    <article className="collection-card">
      <div className="collection-card-kicker">Quy nhom cau long - {monthLabel(month)}</div>
      <div className="collection-card-head">
        <div>
          <h2>{card.name}</h2>
          <p>Thanh vien #{card.memberNumber}</p>
        </div>
        <span>{card.status === "fixed" ? "Co dinh" : "Co dinh cu"}</span>
      </div>

      <div className="collection-card-body">
        {card.items.length === 0 ? (
          <div className="collection-card-empty">Chua co khoan can thu trong thang.</div>
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
        <span>Tong phai thu</span>
        <strong>{money(card.totalDue)}</strong>
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
          <p>Chi tiet cac khoan can thu cua thanh vien co dinh va co dinh cu.</p>
        </div>
        <div className="memfee-page-actions">
          <Link className="btn-secondary" href={`/tong-hop?month=${month}`}>Tong hop</Link>
          <form className="inline-form" action="/tong-hop/memfee-cards" method="get">
            <input type="month" name="month" defaultValue={month} />
            <button className="btn-primary" type="submit">Xem thang</button>
          </form>
        </div>
      </section>

      {cards.length === 0 ? (
        <div className="empty">Khong co thanh vien trong thang nay.</div>
      ) : (
        <section className="collection-card-grid">
          {cards.map((card) => (
            <MemberFeeCard key={card.memberId} card={card} month={month} />
          ))}
        </section>
      )}

      <section className="card memfee-save-panel">
        <div>
          <div className="section-title">Cap nhat du lieu the</div>
          <p className="muted">Tong hop lai cac khoan tu database va luu vao JSON cua thang.</p>
        </div>
        <form className="inline-form" action={saveMemberFeeSummariesAction}>
          <input type="hidden" name="period_month" value={month} />
          <AdminPinField />
          <button className="btn-primary" type="submit">Cap nhat cards</button>
        </form>
      </section>
    </main>
  );
}
