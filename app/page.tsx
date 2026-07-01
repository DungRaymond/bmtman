import {
  addMemberToSessionAction,
  addWalkinAction,
  addWalkinDoFeeAction,
  createSessionAction,
  setSessionCancelledAction,
  toggleWalkinPaidAction,
  updateSessionDoAction,
} from "@/app/actions";
import { AdminPinField } from "@/app/components/AdminPinField";
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
  const usedMemberIds = new Set(participants.map((p) => p.member_id));
  const availableMembers = activeMembers.filter(
    (row) => !usedMemberIds.has(row.member_id)
  );
  const maxWalkinNumber = Math.max(
    7,
    ...walkins.map((walkin) => walkin.walkin_number)
  );

  return (
    <main>
      <ConfigWarning />

      <section className="page-title">
        <div>
          <h1>Ghi độ</h1>
          <p>Log buổi đánh, thành viên, vãng lai và các khoản phải thu tự động.</p>
        </div>
        <form className="inline-form" action="/" method="get">
          <input type="date" name="date" defaultValue={date} />
          <button className="btn-secondary" type="submit">
            Chọn ngày
          </button>
        </form>
      </section>

      {!session ? (
        <section className="card">
          <div className="section-title">Buổi {formatDateVN(date)}</div>
          <p className="muted">Chưa có buổi đánh cho ngày này.</p>
          <form className="stack-form" action={createSessionAction}>
            <input type="hidden" name="date" value={date} />
            <AdminPinField />
            <button className="btn-primary" type="submit">
              Tạo buổi đánh
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="section-title">Buổi {formatDateVN(date)}</div>
            <form className="grid2" action={setSessionCancelledAction}>
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="session_id" value={session.session_id} />
              <div>
                <label>Trạng thái</label>
                <select
                  name="is_cancelled"
                  defaultValue={String(session.is_cancelled)}
                >
                  <option value="0">Có đánh</option>
                  <option value="1">Sân nghỉ</option>
                </select>
              </div>
              <div>
                <label>Ghi chú buổi</label>
                <input name="note" defaultValue={session.note || ""} />
              </div>
              <AdminPinField />
              <button className="btn-secondary" type="submit">
                Lưu trạng thái
              </button>
            </form>
          </section>

          <section className="card">
            <div className="section-title">Thành viên có định danh</div>
            <form className="grid3" action={addMemberToSessionAction}>
              <input type="hidden" name="date" value={date} />
              <div>
                <label>Thêm thành viên</label>
                <select name="member_id" required>
                  <option value="">Chọn người</option>
                  {availableMembers.map((row) => (
                    <option key={row.member_id} value={row.member_id}>
                      {row.member.name} ({row.status === "fixed" ? "cố định" : "cố định cũ"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Độ / tiền độ</label>
                <input name="do_points" type="number" min="0" defaultValue="0" />
              </div>
              <AdminPinField />
              <button className="btn-primary" type="submit">
                Thêm vào buổi
              </button>
            </form>

            <div className="table-list">
              {participants.length === 0 && (
                <div className="empty">Chưa có thành viên nào trong buổi.</div>
              )}
              {participants.map((participant) => (
                <form
                  className="data-row"
                  key={participant.id}
                  action={updateSessionDoAction}
                >
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="id" value={participant.id} />
                  <input
                    type="hidden"
                    name="session_id"
                    value={participant.session_id}
                  />
                  <input
                    type="hidden"
                    name="member_id"
                    value={participant.member_id}
                  />
                  <div>
                    <strong>{participant.members?.name || "Không rõ"}</strong>
                    <div className="muted">
                      {participant.status === "former_fixed"
                        ? "Cố định cũ: tạo phí giao lưu trong ngày"
                        : "Cố định: gom phí cuối tháng"}
                    </div>
                  </div>
                  <div>
                    <label>Độ</label>
                    <input
                      name="do_points"
                      type="number"
                      min="0"
                      defaultValue={participant.do_points}
                    />
                  </div>
                  <AdminPinField />
                  <button className="btn-secondary small-btn" type="submit">
                    Cập nhật
                  </button>
                </form>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="section-title">Vãng lai</div>
            <div className="walkin-grid">
              {Array.from({ length: maxWalkinNumber }, (_, index) => index + 1).map(
                (number) => {
                  const sessionFee = walkins.find(
                    (walkin) =>
                      walkin.walkin_number === number &&
                      walkin.fee_type === "session_fee"
                  );
                  return (
                    <form
                      key={number}
                      action={sessionFee ? toggleWalkinPaidAction : addWalkinAction}
                    >
                      <input type="hidden" name="date" value={date} />
                      {sessionFee ? (
                        <input type="hidden" name="id" value={sessionFee.id} />
                      ) : (
                        <input
                          type="hidden"
                          name="walkin_number"
                          value={number}
                        />
                      )}
                      <AdminPinField />
                      <button
                        className={
                          "walkin-button " +
                          (sessionFee?.is_paid ? "paid" : sessionFee ? "unpaid" : "")
                        }
                        type="submit"
                      >
                        <span>Vãng lai {number}</span>
                        <small>
                          {sessionFee
                            ? sessionFee.is_paid
                              ? `Đã thu ${money(sessionFee.amount_collected)}`
                              : `Chưa thu ${money(sessionFee.amount_expected)}`
                            : "Thêm"}
                        </small>
                      </button>
                    </form>
                  );
                }
              )}
            </div>

            <form className="grid3 compact-form" action={addWalkinDoFeeAction}>
              <input type="hidden" name="date" value={date} />
              <div>
                <label>Vãng lai số</label>
                <input name="walkin_number" type="number" min="1" required />
              </div>
              <div>
                <label>Tiền độ</label>
                <input name="amount" type="number" min="1" required />
              </div>
              <AdminPinField />
              <button className="btn-secondary" type="submit">
                Thêm độ vãng lai
              </button>
            </form>

            {walkins.some((walkin) => walkin.fee_type === "do_fee") && (
              <div className="table-list">
                {walkins
                  .filter((walkin) => walkin.fee_type === "do_fee")
                  .map((walkin) => (
                    <div className="data-row" key={walkin.id}>
                      <div>Vãng lai {walkin.walkin_number}</div>
                      <strong>{money(walkin.amount_expected)}</strong>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
