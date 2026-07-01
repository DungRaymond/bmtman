import {
  addMemberToSessionAction,
  addWalkinDoFeeAction,
  createSessionAction,
  updateSessionDoAction,
} from "@/app/actions";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import {
  formatDateVN,
  getActiveMembers,
  getSessionByDate,
  getSessionParticipants,
  getSessionWalkins,
  money,
  todayInputValue,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ date?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const date = params.date || todayInputValue();
  const session = await getSessionByDate(date);
  const activeMembers = await getActiveMembers(date);
  const participants = session
    ? await getSessionParticipants(session.session_id, date)
    : [];
  const walkins = session ? await getSessionWalkins(session.session_id) : [];
  const doWalkins = walkins.filter((walkin) => walkin.fee_type === "do_fee");
  const participantByMemberId = new Map(
    participants.map((participant) => [participant.member_id, participant])
  );
  const totalMemberDo = participants.reduce(
    (sum, participant) => sum + participant.do_points,
    0
  );
  const totalWalkinDo = doWalkins.reduce(
    (sum, walkin) => sum + walkin.amount_expected,
    0
  );

  return (
    <main>
      <ConfigWarning />

      <section className="score-hero">
        <div>
          <span>Ghi độ</span>
          <h1>{formatDateVN(date)}</h1>
          <p>{participants.length} thành viên đã ghi độ</p>
        </div>
        <form className="score-date-form" action="/" method="get">
          <input type="date" name="date" defaultValue={date} />
          <button className="btn-secondary" type="submit">
            Xem ngày
          </button>
        </form>
      </section>

      {!session && (
        <section className="card score-start-card">
          <div>
            <div className="section-title">Bắt đầu ghi độ hôm nay</div>
            <p className="muted">Tạo buổi đánh cho ngày đã chọn rồi nhập độ bên dưới.</p>
          </div>
          <form action={createSessionAction}>
            <input type="hidden" name="date" value={date} />
            <button className="btn-primary" type="submit">
              Tạo buổi đánh
            </button>
          </form>
        </section>
      )}

      <section className="score-layout">
        <div className="card">
          <div className="score-section-head">
            <div>
              <div className="section-title">Ghi độ thành viên</div>
              <p className="muted">Nhập số độ của từng người trong ngày đang chọn.</p>
            </div>
            <strong>{money(totalMemberDo)}</strong>
          </div>

          <div className="score-member-grid">
            {activeMembers.map((row) => {
              const participant = participantByMemberId.get(row.member_id);
              return (
                <form
                  className={participant ? "score-member-card active" : "score-member-card"}
                  key={row.member_id}
                  action={participant ? updateSessionDoAction : addMemberToSessionAction}
                >
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="member_id" value={row.member_id} />
                  {participant && (
                    <>
                      <input type="hidden" name="id" value={participant.id} />
                      <input
                        type="hidden"
                        name="session_id"
                        value={participant.session_id}
                      />
                    </>
                  )}
                  <div>
                    <strong>{row.member.name}</strong>
                    <span>{row.status === "fixed" ? "Cố định" : "Cố định cũ"}</span>
                  </div>
                  <label>
                    Độ
                    <input
                      name="do_points"
                      type="number"
                      min="0"
                      defaultValue={participant?.do_points ?? 0}
                    />
                  </label>
                  <button
                    className={participant ? "btn-secondary small-btn" : "btn-primary small-btn"}
                    type="submit"
                  >
                    {participant ? "Cập nhật" : "Ghi độ"}
                  </button>
                </form>
              );
            })}
          </div>
        </div>

        <aside className="card">
          <div className="section-title">Vãng lai có độ</div>
          <form className="score-walkin-form" action={addWalkinDoFeeAction}>
            <input type="hidden" name="date" value={date} />
            <div>
              <label>Vãng lai số</label>
              <input name="walkin_number" type="number" min="1" required />
            </div>
            <div>
              <label>Tiền độ</label>
              <input name="amount" type="number" min="1" required />
            </div>
            <button className="btn-primary" type="submit">
              Ghi độ vãng lai
            </button>
          </form>

          <div className="score-mini-total">
            <span>Tổng độ vãng lai</span>
            <strong>{money(totalWalkinDo)}</strong>
          </div>

          <div className="score-history-list compact">
            {doWalkins.length === 0 && (
              <div className="empty">Chưa có độ vãng lai trong ngày này.</div>
            )}
            {doWalkins.map((walkin) => (
              <div className="score-history-row" key={walkin.id}>
                <div>
                  <strong>Vãng lai {walkin.walkin_number}</strong>
                  <span>Tiền độ</span>
                </div>
                <b>{money(walkin.amount_expected)}</b>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="card">
        <div className="score-section-head">
          <div>
            <div className="section-title">Lịch sử độ ngày {formatDateVN(date)}</div>
            <p className="muted">Danh sách các khoản độ đã được ghi cho ngày đang chọn.</p>
          </div>
          <strong>{money(totalMemberDo + totalWalkinDo)}</strong>
        </div>

        <div className="score-history-list">
          {participants.length === 0 && doWalkins.length === 0 && (
            <div className="empty">Chưa có lịch sử độ cho ngày này.</div>
          )}
          {participants.map((participant) => (
            <div className="score-history-row" key={participant.id}>
              <div>
                <strong>{participant.members?.name || "Không rõ"}</strong>
                <span>
                  {participant.status === "former_fixed"
                    ? "Cố định cũ"
                    : "Cố định"}
                </span>
              </div>
              <b>{money(participant.do_points)}</b>
            </div>
          ))}
          {doWalkins.map((walkin) => (
            <div className="score-history-row" key={`walkin-${walkin.id}`}>
              <div>
                <strong>Vãng lai {walkin.walkin_number}</strong>
                <span>Tiền độ vãng lai</span>
              </div>
              <b>{money(walkin.amount_expected)}</b>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
