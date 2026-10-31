"use client";

import { useRef, useState } from "react";
import {
  addExpenseAction,
  changeLossAction,
  deleteLockedLossAction,
  loginDashboardAction,
  lockLossesAction,
  recordPigPaymentAction,
} from "@/app/actions";

type Member = { member_id: number; name: string };
type Loss = { member_id: number; loss_count: number; locked_count: number; paid_count: number };
type ChartTotals = { memberFund: number; pig: number; expense: number };

const money = (amount: number) => `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;

function PendingButton({ children, className }: { children: React.ReactNode; className: string }) {
  return <button className={className} type="submit">{children}</button>;
}

export function Dashboard({
  date,
  month,
  members,
  losses,
  chart,
  authorized,
}: {
  date: string;
  month: string;
  members: Member[];
  losses: Loss[];
  chart: ChartTotals;
  authorized: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const held = useRef(new Set<number>());
  const lossesByMember = new Map(losses.map((loss) => [loss.member_id, loss]));
  const maxBar = Math.max(1, chart.memberFund + chart.pig, chart.expense);
  const memberFundWidth = chart.memberFund / maxBar * 100;
  const pigWidth = chart.pig / maxBar * 100;
  const expenseWidth = chart.expense / maxBar * 100;

  function holdStart(memberId: number, name: string, count: number) {
    held.current.delete(memberId);
    if (!count) return;
    timers.current.set(memberId, setTimeout(() => {
      held.current.add(memberId);
      if (window.confirm(`Xác nhận đã thu ${money((count - (lossesByMember.get(memberId)?.paid_count || 0)) * 10000)} từ ${name}?`)) {
        const form = document.getElementById(`pay-${memberId}`) as HTMLFormElement | null;
        form?.requestSubmit();
      }
    }, 650));
  }

  function holdEnd(memberId: number) {
    const timer = timers.current.get(memberId);
    if (timer) clearTimeout(timer);
  }

  return (
    <main className="dashboard">
      <section className="dashboard-panel chart-panel">
        <div className="dashboard-heading">
          <div><p className="eyebrow">QUỸ NUÔI LỢN</p><h1>Thu & chi</h1></div>
          <form action="/" method="get"><input aria-label="Tháng" type="month" name="month" defaultValue={month} /><button className="secondary-button">Xem</button></form>
        </div>
        <div className="bar-chart" role="img" aria-label={`Tháng ${month}: quỹ thành viên ${money(chart.memberFund)}, quỹ nuôi lợn ${money(chart.pig)}, chi ${money(chart.expense)}`}>
          <div className="fund-chart-row">
            <div className="fund-chart-label"><span>Quỹ thành viên + nuôi lợn</span><strong>{money(chart.memberFund + chart.pig)}</strong></div>
            <div className="horizontal-bar stacked-bar">
              <i className="bar-member-fund" style={{ width: `${memberFundWidth}%` }} title={`Quỹ thành viên ${money(chart.memberFund)}`} />
              <i className="bar-pig" style={{ width: `${pigWidth}%` }} title={`Quỹ nuôi lợn ${money(chart.pig)}`} />
            </div>
            <div className="chart-breakdown"><span><i className="legend-member-fund" />Quỹ thành viên {money(chart.memberFund)}</span><span><i className="legend-pig" />Nuôi lợn {money(chart.pig)}</span></div>
          </div>
          <div className="fund-chart-row">
            <div className="fund-chart-label"><span>Chi</span><strong>{money(chart.expense)}</strong></div>
            <div className="horizontal-bar"><i className="bar-expense" style={{ width: `${expenseWidth}%` }} /></div>
          </div>
        </div>
        <form className="expense-form" action={addExpenseAction}>
          <input type="hidden" name="expense_date" value={date} />
          <label><span>Khoản chi</span><input required name="description" maxLength={160} placeholder="Nội dung" /></label>
          <label><span>Số tiền</span><input required name="amount" type="number" min="1" step="1000" placeholder="VND" /></label>
          <PendingButton className="primary-button">Thêm chi</PendingButton>
        </form>
      </section>

      <section className="dashboard-panel loss-panel">
        <div className="dashboard-heading">
          <div><p className="eyebrow">{date}</p><h2>Lượt thua hôm nay</h2></div>
          <button className={editing ? "edit-button active" : "edit-button"} type="button" onClick={() => setEditing(!editing)}>{editing ? "Xong sửa" : "Sửa"}</button>
        </div>
        <p className="gesture-hint">Chạm để {editing ? "giảm 1 lượt" : "cộng 1 lượt"} · Nhấn giữ để xác nhận thu</p>
        <div className="member-grid">
          {members.map((member) => {
            const loss = lossesByMember.get(member.member_id);
            const count = loss?.loss_count || 0;
            const unpaid = Math.max(0, (loss?.locked_count || 0) - (loss?.paid_count || 0));
            const canRemove = count > (loss?.locked_count || 0);
            const formId = `tap-${member.member_id}`;
            return <div className={`member-tile${editing ? " is-editing" : ""}`} key={member.member_id}>
              <form id={formId} action={changeLossAction}>
                <input type="hidden" name="date" value={date} /><input type="hidden" name="member_id" value={member.member_id} /><input type="hidden" name="delta" value={editing ? -1 : 1} />
                <button className="member-tap" type="submit" disabled={!authorized || (editing && !canRemove)}
                  onPointerDown={() => !editing && unpaid > 0 && holdStart(member.member_id, member.name, loss?.locked_count || 0)}
                  onPointerUp={() => holdEnd(member.member_id)} onPointerLeave={() => holdEnd(member.member_id)} onPointerCancel={() => holdEnd(member.member_id)}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={(event) => { holdEnd(member.member_id); if (held.current.has(member.member_id)) { held.current.delete(member.member_id); event.preventDefault(); } }}>
                  <span className="loss-count">{count}</span><strong>{member.name}</strong><small>{loss?.paid_count ? `Đã thu ${loss.paid_count}/${loss.locked_count}` : loss?.locked_count ? `Đã chốt ${loss.locked_count}` : "Thành viên"}</small>
                </button>
              </form>
              {unpaid > 0 && <form id={`pay-${member.member_id}`} action={recordPigPaymentAction}><input type="hidden" name="date" value={date} /><input type="hidden" name="member_id" value={member.member_id} /></form>}
              {loss?.locked_count && loss.paid_count === 0 ? <form action={deleteLockedLossAction} className="tile-delete">
                <input type="hidden" name="date" value={date} /><input type="hidden" name="member_id" value={member.member_id} />
                <button type="submit" disabled={!authorized} aria-label={`Xóa lượt đã chốt của ${member.name}`} title="Xóa lượt đã chốt">×</button>
              </form> : null}
            </div>;
          })}
        </div>
        <form action={lockLossesAction} className="lock-form"><input type="hidden" name="date" value={date} /><PendingButton className="primary-button lock-button" >Chốt lượt thua hôm nay</PendingButton></form>
      </section>

      {!authorized && <LoginPanel />}
    </main>
  );
}

function LoginPanel() {
  return <div className="login-overlay"><form className="login-card" action={loginDashboardAction}>
    <p className="eyebrow">QUYỀN QUẢN LÝ</p><h2>Mở quyền ghi</h2><p>Nhập PIN quản lý để ghi lượt, chốt ngày và cập nhật quỹ.</p>
    <input name="pin" type="password" inputMode="numeric" autoComplete="current-password" placeholder="PIN" required />
    <button className="primary-button">Mở dashboard</button>
  </form></div>;
}
