"use client";

import { useEffect, useRef, useState } from "react";
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
type Totals = { memberFund: number; pig: number; expense: number };
type ChartTotals = { total: Totals; monthly: Totals };

const money = (amount: number) => `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;

function PendingButton({ children, className }: { children: React.ReactNode; className: string }) {
  return <button className={className} type="submit">{children}</button>;
}

export function Dashboard({
  date,
  month,
  view,
  members,
  losses,
  chart,
  authorized,
}: {
  date: string;
  month: string;
  view: "total" | "monthly";
  members: Member[];
  losses: Loss[];
  chart: ChartTotals;
  authorized: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [visibleLosses, setVisibleLosses] = useState(losses);
  const [lossSyncError, setLossSyncError] = useState(false);
  const lossState = useRef(losses);
  const lossVersion = useRef(0);
  const lossQueue = useRef(Promise.resolve());
  const pendingLossChanges = useRef<FormData[]>([]);
  const lossSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lossCacheKey = `dashboard-losses:${date}`;
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [selectedView, setSelectedView] = useState(view);
  const [totals, setTotals] = useState<ChartTotals>(chart);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const held = useRef(new Set<number>());
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      try {
        const cache = JSON.parse(localStorage.getItem("dashboard-monthly-totals") || "{}") as Record<string, ChartTotals>;
        if (active && cache[selectedMonth]) setTotals(cache[selectedMonth]);
      } catch {}
    });
    fetch(`/api/dashboard-totals?month=${selectedMonth}`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Totals unavailable"); return response.json() as Promise<ChartTotals>; })
      .then((fresh) => {
        if (!active) return;
        setTotals(fresh);
        try {
          const cache = JSON.parse(localStorage.getItem("dashboard-monthly-totals") || "{}") as Record<string, ChartTotals>;
          cache[selectedMonth] = fresh;
          localStorage.setItem("dashboard-monthly-totals", JSON.stringify(cache));
        } catch {}
      }).catch(() => {});
    return () => { active = false; };
  }, [selectedMonth]);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      try {
        const cached = localStorage.getItem(lossCacheKey);
        if (active && cached && lossVersion.current === 0) {
          const parsed = JSON.parse(cached) as Loss[];
          lossState.current = parsed;
          setVisibleLosses(parsed);
        }
      } catch {}
    });
    fetch(`/api/dashboard-losses?date=${date}`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Losses unavailable"); return response.json() as Promise<Loss[]>; })
      .then((fresh) => {
        if (!active || lossVersion.current > 0) return;
        lossState.current = fresh;
        setVisibleLosses(fresh);
        try {
          localStorage.setItem(lossCacheKey, JSON.stringify(fresh));
        } catch {}
      }).catch(() => {});
    return () => { active = false; };
  }, [date, lossCacheKey]);
  const lossesByMember = new Map(visibleLosses.map((loss) => [loss.member_id, loss]));
  async function flushLossChanges() {
    const changes = pendingLossChanges.current.splice(0);
    if (!changes.length) return;
    lossQueue.current = lossQueue.current.then(async () => {
      try {
        for (const formData of changes) await changeLossAction(formData);
        const response = await fetch(`/api/dashboard-losses?date=${date}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Losses unavailable");
        const fresh = await response.json() as Loss[];
        lossState.current = fresh;
        lossVersion.current = 0;
        setVisibleLosses(fresh);
        try { localStorage.setItem(lossCacheKey, JSON.stringify(fresh)); } catch {}
        setLossSyncError(false);
      } catch {
        setLossSyncError(true);
      }
    });
  }
  function handleLossChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    pendingLossChanges.current.push(formData);
    if (lossSyncTimer.current) clearTimeout(lossSyncTimer.current);
    lossSyncTimer.current = setTimeout(() => { void flushLossChanges(); }, 2700);
    const memberId = Number(formData.get("member_id"));
    const delta = Number(formData.get("delta"));
    const current = lossState.current.find((loss) => loss.member_id === memberId);
    const optimistic = current
      ? lossState.current.map((loss) => loss.member_id === memberId ? { ...loss, loss_count: loss.loss_count + delta } : loss)
      : [...lossState.current, { member_id: memberId, loss_count: 1, locked_count: 0, paid_count: 0 }];
    lossState.current = optimistic;
    lossVersion.current++;
    setVisibleLosses(optimistic);
    try { localStorage.setItem(lossCacheKey, JSON.stringify(optimistic)); } catch {}
    setLossSyncError(false);
  }
  const shown = totals[selectedView];
  const maxBar = Math.max(1, shown.memberFund + shown.pig, shown.expense);
  const memberFundWidth = shown.memberFund / maxBar * 100;
  const pigWidth = shown.pig / maxBar * 100;
  const expenseWidth = shown.expense / maxBar * 100;

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
          <form onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("month"); if (typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) setSelectedMonth(value); }}><input aria-label="Tháng" type="month" name="month" defaultValue={month} /><button className="secondary-button">Xem</button></form>
        </div>
        <nav className="chart-view-switch" aria-label="Kiểu tổng hợp">
          <button type="button" className={selectedView === "total" ? "active" : ""} onClick={() => setSelectedView("total")}>Tổng đến tháng</button>
          <button type="button" className={selectedView === "monthly" ? "active" : ""} onClick={() => setSelectedView("monthly")}>Theo tháng</button>
        </nav>
        <div className="bar-chart" role="img" aria-label={`${selectedView === "total" ? "Tổng đến hết" : "Tháng"} ${selectedMonth}: quỹ thành viên ${money(shown.memberFund)}, quỹ nuôi lợn ${money(shown.pig)}, chi ${money(shown.expense)}`}>
          <div className="fund-chart-row">
            <div className="fund-chart-label"><span>Quỹ thành viên + nuôi lợn</span><strong>{money(shown.memberFund + shown.pig)}</strong></div>
            <div className="horizontal-bar stacked-bar">
              <i className="bar-member-fund" style={{ width: `${memberFundWidth}%` }} title={`Quỹ thành viên ${money(shown.memberFund)}`} />
              <i className="bar-pig" style={{ width: `${pigWidth}%` }} title={`Quỹ nuôi lợn ${money(shown.pig)}`} />
            </div>
            <div className="chart-breakdown"><span><i className="legend-member-fund" />Quỹ thành viên {money(shown.memberFund)}</span><span><i className="legend-pig" />Nuôi lợn {money(shown.pig)}</span></div>
          </div>
          <div className="fund-chart-row">
            <div className="fund-chart-label"><span>Chi</span><strong>{money(shown.expense)}</strong></div>
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
        {lossSyncError && <p role="alert" className="sync-error">Lưu lượt thất bại. Số hiển thị chưa được lưu.</p>}
        <div className="member-grid">
          {members.map((member) => {
            const loss = lossesByMember.get(member.member_id);
            const count = loss?.loss_count || 0;
            const unpaid = Math.max(0, (loss?.locked_count || 0) - (loss?.paid_count || 0));
            const canRemove = count > (loss?.locked_count || 0);
            const formId = `tap-${member.member_id}`;
            return <div className={`member-tile${editing ? " is-editing" : ""}`} key={member.member_id}>
              <form id={formId} onSubmit={handleLossChange}>
                <input type="hidden" name="date" value={date} /><input type="hidden" name="member_id" value={member.member_id} /><input type="hidden" name="delta" value={editing ? -1 : 1} />
                <button className="member-tap" type="submit" disabled={!authorized || (editing && !canRemove)}
                  onPointerDown={() => !editing && unpaid > 0 && holdStart(member.member_id, member.name, loss?.locked_count || 0)}
                  onPointerUp={() => holdEnd(member.member_id)} onPointerLeave={() => holdEnd(member.member_id)} onPointerCancel={() => holdEnd(member.member_id)}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={(event) => { holdEnd(member.member_id); if (held.current.has(member.member_id)) { held.current.delete(member.member_id); event.preventDefault(); } }}>
                  <span className="loss-count">{count}</span><strong>{member.name}</strong>{loss?.paid_count ? <small>{`Đã thu ${loss.paid_count}/${loss.locked_count}`}</small> : loss?.locked_count ? <small>{`Đã chốt ${loss.locked_count}`}</small> : null}
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
    <input name="pin" type="password" autoComplete="current-password" placeholder="PIN" required />
    <button className="primary-button">Mở dashboard</button>
  </form></div>;
}
