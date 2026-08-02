import Link from "next/link";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import { ManagementAuthPanel } from "@/app/components/ManagementAuthPanel";
import {
  currentMonthValue,
  formatDateVN,
  getMonthlyStakePeople,
  money,
} from "@/lib/finance";
import { isThuRouteAuthenticated } from "@/lib/thuAuth";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ month?: string }>;
};

export default async function StakeSummaryPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  if (!(await isThuRouteAuthenticated())) {
    return <ManagementAuthPanel nextPath="/tong-hop/tien-do" />;
  }
  const month = /^\d{4}-\d{2}$/.test(params.month || "")
    ? params.month as string
    : currentMonthValue();
  const people = await getMonthlyStakePeople(month);
  const grandTotal = people.reduce((sum, person) => sum + person.total, 0);
  const turnCount = people.reduce(
    (sum, person) => sum + person.days.reduce((daySum, day) => daySum + day.turns.length, 0),
    0
  );

  return (
    <main>
      <ConfigWarning />

      <section className="page-title">
        <div>
          <h1>Thống kê tiền độ</h1>
          <p>Tạm tính trực tiếp từ các thẻ độ đã ghi trong tháng.</p>
        </div>
        <div className="memfee-page-actions">
          <Link className="btn-secondary" href={`/tong-hop?month=${month}`}>
            Tổng kết
          </Link>
          <form className="inline-form" action="/tong-hop/tien-do" method="get">
            <input type="month" name="month" defaultValue={month} />
            <button className="btn-primary" type="submit">Xem tháng</button>
          </form>
        </div>
      </section>

      <section className="stake-overview">
        <div className="metric">
          <span>Tổng tiền độ tạm tính</span>
          <strong>{money(grandTotal)}</strong>
        </div>
        <div className="metric">
          <span>Số người phát sinh</span>
          <strong>{people.length}</strong>
        </div>
        <div className="metric">
          <span>Tổng lượt phải trả</span>
          <strong>{turnCount}</strong>
        </div>
      </section>

      {people.length === 0 ? (
        <div className="empty">Chưa có lượt độ nào trong tháng này.</div>
      ) : (
        <section className="stake-person-list">
          {people.map((person) => {
            const personTurns = person.days.reduce((sum, day) => sum + day.turns.length, 0);
            return (
              <details className="stake-person-card" key={person.key}>
                <summary className="stake-person-head">
                  <div>
                    <strong>{person.name}</strong>
                    <span>{person.days.length} ngày · {personTurns} lượt</span>
                  </div>
                  <b>{money(person.total)}</b>
                </summary>
                <div className="stake-person-days">
                  {person.days.map((day) => (
                    <section className="stake-day-group" key={day.date}>
                      <div className="stake-day-head">
                        <div>
                          <strong>{formatDateVN(day.date)}</strong>
                          <span className={day.settled ? "settled" : "unsettled"}>
                            {day.settled ? "Đã chốt" : "Chưa chốt"}
                          </span>
                        </div>
                        <b>{money(day.total)}</b>
                      </div>
                      <div className="stake-turn-list">
                        {day.turns.map((turn) => (
                          <div className="stake-turn-row" key={`${day.date}:${turn.setId}`}>
                            <div>
                              <strong>Lượt {turn.setNumber} · Bên {turn.losingSide} thua</strong>
                              {turn.winnerNames && <span>Thắng: {turn.winnerNames}</span>}
                            </div>
                            <b>{money(turn.amount)}</b>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </details>
            );
          })}
        </section>
      )}
    </main>
  );
}
