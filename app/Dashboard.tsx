"use client";

import { useEffect, useRef, useState } from "react";
import {
  addExpenseAction,
  changeLossAction,
  closePigAction,
  deleteLockedLossAction,
  loginDashboardAction,
  lockLossesAction,
} from "@/app/actions";

type Member = { member_id: number; name: string };
type Loss = { member_id: number; loss_count: number; locked_count: number; paid_count: number };
type UnpaidLoss = { member_id: number; loss_count: number; locked_count: number; paid_count: number };
type Totals = { memberFund: number; pig: number; expense: number };
type ChartTotals = { total: Totals; monthly: Totals };

const money = (amount: number) => `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
const compactMoney = (amount: number) => amount >= 1_000_000
  ? `${(amount / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`
  : amount >= 1_000
    ? `${Math.round(amount / 1_000)}k`
    : `${amount}đ`;

function PendingButton({ children, className, disabled }: { children: React.ReactNode; className: string; disabled?: boolean }) {
  return <button className={className} type="submit" disabled={disabled}>{children}</button>;
}

export function Dashboard({
  date,
  month,
  view,
  members,
  losses,
  pigTotals: initialPigTotals,
  chart,
  authorized,
}: {
  date: string;
  month: string;
  view: "total" | "monthly";
  members: Member[];
  losses: Loss[];
  pigTotals: Record<number, number>;
  chart: ChartTotals;
  authorized: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [hasAccess, setHasAccess] = useState(authorized);
  const [pinPrompt, setPinPrompt] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pendingPinAction, setPendingPinAction] = useState<(() => void | Promise<void>) | null>(null);
  function requirePin(action: () => void | Promise<void>) {
    if (hasAccess) void action();
    else { setPendingPinAction(() => action); setPinError(""); setPinPrompt(true); }
  }
  async function submitPin(formData: FormData) {
    try {
      await loginDashboardAction(formData);
      setHasAccess(true);
      setPinPrompt(false);
      const action = pendingPinAction;
      setPendingPinAction(null);
      await action?.();
    } catch (error) {
      setPinError(error instanceof Error ? error.message : "Không xác thực được PIN.");
    }
  }
  const [visibleLosses, setVisibleLosses] = useState(losses);
  const [unpaidLosses, setUnpaidLosses] = useState<UnpaidLoss[]>([]);
  const [lossSyncError, setLossSyncError] = useState(false);
  const [syncingLosses, setSyncingLosses] = useState(false);
  const [pigConfirmMemberId, setPigConfirmMemberId] = useState<number | null>(null);
  const [pigConfirmCount, setPigConfirmCount] = useState(0);
  const [resetConfirmMemberId, setResetConfirmMemberId] = useState<number | null>(null);
  const [resetConfirmLocked, setResetConfirmLocked] = useState(0);
  const [resetError, setResetError] = useState("");
  const [holdProgressMemberId, setHoldProgressMemberId] = useState<number | null>(null);
  const [tapFeedbackMemberId, setTapFeedbackMemberId] = useState<number | null>(null);
  const tapFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdGateTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const holdSyncs = useRef(new Map<number, Promise<boolean>>());
  const [pigCloseError, setPigCloseError] = useState("");
  const lossState = useRef(losses);
  const lossVersion = useRef(0);
  const lossQueue = useRef(Promise.resolve());
  const pendingLossChanges = useRef<FormData[]>([]);
  const lossSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lossCacheKey = `dashboard-losses:${date}`;
  const unpaidLossesCacheKey = "dashboard-unpaid-losses";
  const pigTotalsCacheKey = "dashboard-pig-totals";
  const [pigTotals, setPigTotals] = useState<Record<number, number>>(initialPigTotals);
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [selectedView, setSelectedView] = useState(view);
  const [totals, setTotals] = useState<ChartTotals>(chart);
  const [expenseError, setExpenseError] = useState("");
  const [expensePending, setExpensePending] = useState(false);
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
    fetch(`/api/dashboard-totals?month=${selectedMonth}&_=${Date.now()}`, { cache: "no-store" })
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
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      try {
        const cached = localStorage.getItem(unpaidLossesCacheKey);
        if (active && cached) setUnpaidLosses(JSON.parse(cached) as UnpaidLoss[]);
      } catch {}
    });
    fetch("/api/dashboard-unpaid-losses", { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Unpaid losses unavailable"); return response.json() as Promise<UnpaidLoss[]>; })
      .then((fresh) => {
        if (!active) return;
        setUnpaidLosses(fresh);
        try { localStorage.setItem(unpaidLossesCacheKey, JSON.stringify(fresh)); } catch {}
      }).catch(() => {});
    return () => { active = false; };
  }, [unpaidLossesCacheKey]);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      try {
        const cached = localStorage.getItem(pigTotalsCacheKey);
        if (active && cached) setPigTotals(JSON.parse(cached) as Record<number, number>);
      } catch {}
    });
    fetch("/api/dashboard-pig-totals", { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Pig totals unavailable"); return response.json() as Promise<Record<number, number>>; })
      .then((fresh) => {
        if (!active) return;
        setPigTotals(fresh);
        try { localStorage.setItem(pigTotalsCacheKey, JSON.stringify(fresh)); } catch {}
      }).catch(() => {});
    return () => { active = false; };
  }, [pigTotalsCacheKey]);
  async function refreshUnpaidLosses() {
    const response = await fetch("/api/dashboard-unpaid-losses", { cache: "no-store" });
    if (!response.ok) throw new Error("Unpaid losses unavailable");
    const fresh = await response.json() as UnpaidLoss[];
    setUnpaidLosses(fresh);
    try { localStorage.setItem(unpaidLossesCacheKey, JSON.stringify(fresh)); } catch {}
  }
  const unpaidByMember = new Map(unpaidLosses.map((item) => [item.member_id, item]));
  async function refreshLosses() {
    const response = await fetch(`/api/dashboard-losses?date=${date}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Losses unavailable");
    const fresh = await response.json() as Loss[];
    lossState.current = fresh;
    lossVersion.current = 0;
    setVisibleLosses(fresh);
    try { localStorage.setItem(lossCacheKey, JSON.stringify(fresh)); } catch {}
    return fresh;
  }
  function pushPendingLossChanges() {
    const changes = pendingLossChanges.current.splice(0);
    return changes;
  }
  async function flushLossChanges(): Promise<boolean> {
    if (!pendingLossChanges.current.length) return true;
    setSyncingLosses(true);
    const sync = lossQueue.current.then(async () => {
      try {
        for (const formData of pushPendingLossChanges()) await changeLossAction(formData);
        await refreshLosses();
        setLossSyncError(false);
        return true;
      } catch {
        setLossSyncError(true);
        return false;
      } finally {
        try { await refreshUnpaidLosses(); } catch {}
        setSyncingLosses(false);
      }
    });
    lossQueue.current = sync.then(() => undefined);
    return sync;
  }
  function lockToday() {
    if (lossSyncTimer.current) {
      clearTimeout(lossSyncTimer.current);
      lossSyncTimer.current = null;
    }
    const optimistic = lossState.current.map((loss) => loss.locked_count < loss.loss_count ? { ...loss, locked_count: loss.loss_count } : loss);
    lossState.current = optimistic;
    lossVersion.current++;
    setVisibleLosses(optimistic);
    try { localStorage.setItem(lossCacheKey, JSON.stringify(optimistic)); } catch {}
    setLossSyncError(false);
    const sync = lossQueue.current.then(async () => {
      try {
        for (const formData of pushPendingLossChanges()) await changeLossAction(formData);
        const formData = new FormData();
        formData.set("date", date);
        await lockLossesAction(formData);
        await refreshLosses();
        await refreshUnpaidLosses();
        return true;
      } catch {
        setLossSyncError(true);
        try { await refreshLosses(); } catch {}
        try { await refreshUnpaidLosses(); } catch {}
        return false;
      }
    });
    lossQueue.current = sync.then(() => undefined);
  }
  async function resetLockedLosses(member: Member, locked: number): Promise<boolean> {
    if (!locked) return false;
    setSyncingLosses(true);
    setLossSyncError(false);
    setResetError("");
    const sync = lossQueue.current.then(async () => {
      try {
        for (const formData of pushPendingLossChanges()) await changeLossAction(formData);
        const formData = new FormData();
        formData.set("date", date);
        formData.set("member_id", String(member.member_id));
        await deleteLockedLossAction(formData);
        await refreshLosses();
        await refreshUnpaidLosses();
        return true;
      } catch (error) {
        setResetError(error instanceof Error ? error.message : "Không xóa được lượt đã chốt.");
        return false;
      } finally {
        setSyncingLosses(false);
      }
    });
    lossQueue.current = sync.then(() => undefined);
    return sync;
  }
  async function closePig(member: Member, count: number): Promise<boolean> {
    if (!count) return false;
    if (pendingLossChanges.current.length) {
      if (lossSyncTimer.current) clearTimeout(lossSyncTimer.current);
      lossSyncTimer.current = null;
      if (!(await flushLossChanges())) return false;
    }
    setSyncingLosses(true);
    setLossSyncError(false);
    setPigCloseError("");
    const formData = new FormData();
    formData.set("date", date);
    formData.set("member_id", String(member.member_id));
    try {
      const amount = Number(await closePigAction(formData)) || 0;
      const nextPigTotals = { ...pigTotals, [member.member_id]: (pigTotals[member.member_id] || 0) + amount };
      setPigTotals(nextPigTotals);
      try { localStorage.setItem(pigTotalsCacheKey, JSON.stringify(nextPigTotals)); } catch {}
      const response = await fetch(`/api/dashboard-losses?date=${date}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Losses unavailable");
      const fresh = await response.json() as Loss[];
      lossState.current = fresh;
      lossVersion.current = 0;
      setVisibleLosses(fresh);
      try { localStorage.setItem(lossCacheKey, JSON.stringify(fresh)); } catch {}
      await refreshUnpaidLosses();
      const totalsResponse = await fetch(`/api/dashboard-totals?month=${selectedMonth}`, { cache: "no-store" });
      if (!totalsResponse.ok) throw new Error("Totals unavailable");
      const freshTotals = await totalsResponse.json() as ChartTotals;
      setTotals(freshTotals);
      try {
        const cache = JSON.parse(localStorage.getItem("dashboard-monthly-totals") || "{}") as Record<string, ChartTotals>;
        cache[selectedMonth] = freshTotals;
        localStorage.setItem("dashboard-monthly-totals", JSON.stringify(cache));
      } catch {}
      try {
        const pigResponse = await fetch("/api/dashboard-pig-totals", { cache: "no-store" });
        if (pigResponse.ok) {
          const freshPigTotals = await pigResponse.json() as Record<number, number>;
          setPigTotals(freshPigTotals);
          localStorage.setItem(pigTotalsCacheKey, JSON.stringify(freshPigTotals));
        }
      } catch {}
      return true;
    } catch (error) {
      setPigCloseError(error instanceof Error ? error.message : "Không chốt được lượt vào quỹ nuôi lợn.");
      return false;
    } finally {
      setSyncingLosses(false);
    }
  }
  function handleLossChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (syncingLosses) return;
    const formData = new FormData(event.currentTarget);
    if (!hasAccess) { requirePin(() => { pendingLossChanges.current.push(formData); void flushLossChanges(); }); return; }
    const memberId = Number(formData.get("member_id"));
    const delta = Number(formData.get("delta"));
    const current = lossState.current.find((loss) => loss.member_id === memberId);
    if (delta < 0 && current && current.loss_count + delta < current.locked_count) return;
    setTapFeedbackMemberId(memberId);
    if (tapFeedbackTimer.current) clearTimeout(tapFeedbackTimer.current);
    tapFeedbackTimer.current = setTimeout(() => setTapFeedbackMemberId(null), 220);
    pendingLossChanges.current.push(formData);
    if (lossSyncTimer.current) clearTimeout(lossSyncTimer.current);
    lossSyncTimer.current = setTimeout(() => { void flushLossChanges(); }, 2700);
    const optimistic = current
      ? lossState.current.map((loss) => loss.member_id === memberId ? { ...loss, loss_count: loss.loss_count + delta } : loss)
      : [...lossState.current, { member_id: memberId, loss_count: 1, locked_count: 0, paid_count: 0 }];
    lossState.current = optimistic;
    lossVersion.current++;
    setVisibleLosses(optimistic);
    setUnpaidLosses((currentItems) => {
      const currentItem = currentItems.find((item) => item.member_id === memberId);
      const updated = currentItem
        ? currentItems.map((item) => item.member_id === memberId
          ? { ...item, loss_count: Math.max(0, item.loss_count + delta) }
          : item)
        : [...currentItems, { member_id: memberId, loss_count: Math.max(0, delta), locked_count: 0, paid_count: 0 }];
      try { localStorage.setItem(unpaidLossesCacheKey, JSON.stringify(updated)); } catch {}
      return updated;
    });
    try { localStorage.setItem(lossCacheKey, JSON.stringify(optimistic)); } catch {}
    setLossSyncError(false);
  }
  const shown = totals[selectedView];
  const maxBar = Math.max(1, shown.memberFund + shown.pig, shown.expense);
  const memberFundWidth = shown.memberFund / maxBar * 100;
  const pigWidth = shown.pig / maxBar * 100;
  const expenseWidth = shown.expense / maxBar * 100;

  function holdStart(memberId: number, count: number, mode: "pig" | "reset") {
    held.current.delete(memberId);
    if (!count || syncingLosses) return;
    const gate = setTimeout(() => {
      holdGateTimers.current.delete(memberId);
      setHoldProgressMemberId(memberId);
      timers.current.set(memberId, setTimeout(() => {
        timers.current.delete(memberId);
        held.current.add(memberId);
        setHoldProgressMemberId(null);
        if (mode === "reset") {
          setResetError("");
          setResetConfirmMemberId(memberId);
          setResetConfirmLocked(count);
          return;
        }
        const sync = syncBeforePigConfirm();
        holdSyncs.current.set(memberId, sync);
        void sync.then((success) => {
          holdSyncs.current.delete(memberId);
          if (!success) return;
          const latestCount = lossState.current.find((loss) => loss.member_id === memberId)?.loss_count || 0;
          if (!latestCount) return;
          setPigConfirmMemberId(memberId);
          setPigConfirmCount(latestCount);
        });
      }, 1100));
    }, 300);
    holdGateTimers.current.set(memberId, gate);
  }

  function holdEnd(memberId: number) {
    const gate = holdGateTimers.current.get(memberId);
    if (gate) {
      clearTimeout(gate);
      holdGateTimers.current.delete(memberId);
      return;
    }
    const timer = timers.current.get(memberId);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(memberId);
      setHoldProgressMemberId((current) => current === memberId ? null : current);
    }
  }

  function syncBeforePigConfirm(): Promise<boolean> {
    if (lossSyncTimer.current) {
      clearTimeout(lossSyncTimer.current);
      lossSyncTimer.current = null;
    }
    return pendingLossChanges.current.length ? flushLossChanges() : Promise.resolve(true);
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
        <form className="expense-form" action={async (formData) => {
          setExpensePending(true);
          setExpenseError("");
          try {
            await new Promise<void>((resolve, reject) => requirePin(async () => {
              try { await addExpenseAction(formData); resolve(); } catch (error) { reject(error); }
            }));
            const response = await fetch(`/api/dashboard-totals?month=${selectedMonth}`, { cache: "no-store" });
            if (!response.ok) throw new Error("Không đồng bộ được tổng quỹ.");
            const fresh = await response.json() as ChartTotals;
            setTotals(fresh);
            try {
              const cache = JSON.parse(localStorage.getItem("dashboard-monthly-totals") || "{}") as Record<string, ChartTotals>;
              cache[selectedMonth] = fresh;
              localStorage.setItem("dashboard-monthly-totals", JSON.stringify(cache));
            } catch {}
            (document.querySelector(".expense-form") as HTMLFormElement | null)?.reset();
          } catch (error) {
            setExpenseError(error instanceof Error ? error.message : "Không ghi được khoản chi.");
          } finally {
            setExpensePending(false);
          }
        }}>
          <input type="hidden" name="expense_date" value={date} />
          <label><span>Khoản chi</span><input required name="description" maxLength={160} placeholder="Nội dung" /></label>
          <label><span>Số tiền</span><input required name="amount" type="text" inputMode="numeric" pattern="[0-9]+" maxLength={15} placeholder="VND" /></label>
          <PendingButton className="primary-button" disabled={expensePending}>{expensePending ? "Đang lưu…" : "Thêm chi"}</PendingButton>
        </form>
        {expenseError && <p role="alert" className="sync-error">{expenseError}</p>}
      </section>

      <section className="dashboard-panel loss-panel">
        <div className="dashboard-heading">
          <div><p className="eyebrow">{date}</p><h2>Lượt thua hôm nay</h2></div>
          <button className={editing ? "edit-button active" : "edit-button"} type="button" disabled={syncingLosses} onClick={async () => {
            if (editing && !hasAccess) {
              requirePin(async () => {
                if (pendingLossChanges.current.length) {
                  if (lossSyncTimer.current) clearTimeout(lossSyncTimer.current);
                  lossSyncTimer.current = null;
                  if (!(await flushLossChanges())) return;
                }
                setEditing(false);
              });
              return;
            }
            if (pendingLossChanges.current.length) {
              if (lossSyncTimer.current) clearTimeout(lossSyncTimer.current);
              lossSyncTimer.current = null;
              if (!(await flushLossChanges())) return;
            }
            setEditing(!editing);
          }}>{editing ? "Xong sửa" : "Sửa"}</button>
        </div>
        {lossSyncError && <p role="alert" className="sync-error">Lưu lượt thất bại. Số hiển thị chưa được lưu.</p>}
        {syncingLosses && <div className="sync-overlay" role="status" aria-live="polite"><div className="sync-pig"><span>₫</span><i /></div><strong>Đang đồng bộ lượt…</strong></div>}
        {pigConfirmMemberId !== null && (() => {
          const member = members.find((item) => item.member_id === pigConfirmMemberId);
          if (!member || !pigConfirmCount) return null;
          return <div className="login-overlay"><section className="login-card" role="dialog" aria-modal="true" aria-labelledby="pig-confirm-title">
            <p className="eyebrow">QUỸ NUÔI LỢN</p><h2 id="pig-confirm-title">Chốt lượt của {member.name}?</h2>
            <p>{pigConfirmCount} lượt × 10.000đ = {money(pigConfirmCount * 10000)}. Lượt của riêng {member.name} sẽ về 0.</p>
            {pigCloseError && <p role="alert" className="sync-error">{pigCloseError}</p>}
            <button className="primary-button" type="button" disabled={syncingLosses} onClick={async () => {
              const run = async () => {
                setSyncingLosses(true);
                setPigCloseError("");
                const success = await closePig(member, pigConfirmCount);
                if (success) setPigConfirmMemberId(null);
              };
              if (!hasAccess) { requirePin(run); return; }
              await run();
            }}>Xác nhận chốt</button>
            <button className="secondary-button" type="button" onClick={() => setPigConfirmMemberId(null)}>Hủy</button>
          </section></div>;
        })()}
        {resetConfirmMemberId !== null && (() => {
          const member = members.find((item) => item.member_id === resetConfirmMemberId);
          if (!member || !resetConfirmLocked) return null;
          return <div className="login-overlay"><section className="login-card" role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title">
            <p className="eyebrow">HOÀN TÁC CHỐT LƯỢT</p><h2 id="reset-confirm-title">Xóa lượt đã chốt của {member.name}?</h2>
            <p>{resetConfirmLocked} lượt đã chốt sẽ bị trừ khỏi tổng lượt thua, không thu tiền.</p>
            {resetError && <p role="alert" className="sync-error">{resetError}</p>}
            <button className="primary-button" type="button" disabled={syncingLosses} onClick={() => {
              const run = async () => {
                const success = await resetLockedLosses(member, resetConfirmLocked);
                if (success) setResetConfirmMemberId(null);
              };
              if (!hasAccess) { requirePin(run); return; }
              void run();
            }}>Xóa lượt đã chốt</button>
            <button className="secondary-button" type="button" onClick={() => setResetConfirmMemberId(null)}>Hủy</button>
          </section></div>;
        })()}
        <div className="member-grid">
          {members.map((member) => {
            const loss = lossesByMember.get(member.member_id);
            const memberUnpaid = unpaidByMember.get(member.member_id);
            const count = memberUnpaid?.loss_count || 0;
            const locked = memberUnpaid?.locked_count || 0;
            const paid = memberUnpaid?.paid_count || 0;
            const todayCount = loss?.loss_count || 0;
            const unpaidLocked = Math.max(0, locked - paid);
            const pigTotal = pigTotals[member.member_id] || 0;
            const canRemove = todayCount > locked;
            const canReset = locked > 0 && paid === 0;
            const formId = `tap-${member.member_id}`;
            return <div className={`member-tile${editing ? " is-editing" : ""}`} key={member.member_id}>
              <form id={formId} onSubmit={handleLossChange}>
                <input type="hidden" name="date" value={date} /><input type="hidden" name="member_id" value={member.member_id} /><input type="hidden" name="delta" value={editing ? -1 : 1} />
                <button className={`member-tap${holdProgressMemberId === member.member_id ? " is-holding" : ""}${tapFeedbackMemberId === member.member_id ? " tap-feedback" : ""}`} type="submit" disabled={syncingLosses || (editing && !canRemove && !canReset)}
                  onPointerDown={(event) => {
                    if (!editing && todayCount > 0) holdStart(member.member_id, todayCount, "pig");
                    else if (editing && canReset) holdStart(member.member_id, locked, "reset");
                    else held.current.delete(member.member_id);
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerUp={() => holdEnd(member.member_id)} onPointerLeave={() => holdEnd(member.member_id)} onPointerCancel={() => holdEnd(member.member_id)}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={(event) => {
                    holdEnd(member.member_id);
                    if (held.current.has(member.member_id)) {
                      held.current.delete(member.member_id);
                      event.preventDefault();
                    }
                  }}>
                  <span className="loss-count">{count}</span>
                  {paid ? <small className="paid-count">{`Đã thu ${paid}/${locked}`}</small> : null}
                  <strong>{member.name.replace(/\s+/, "\n")}</strong>
                  <div className="tile-badges">
                    {unpaidLocked > 0 && <span className="locked-count" aria-label={`${unpaidLocked} lượt chưa đút lợn`} title={`${unpaidLocked} lượt chưa đút lợn`}><b>{unpaidLocked}</b> chưa đút</span>}
                    {pigTotal > 0 && <span className="pig-total" aria-label={`Đã đút ${money(pigTotal)} vào quỹ nuôi lợn`} title={`Đã đút ${money(pigTotal)} vào quỹ nuôi lợn`}><b>{compactMoney(pigTotal)}</b> đã đút</span>}
                  </div>
                </button>
              </form>
            </div>;
          })}
        </div>
        <div className="lock-form"><button className="primary-button lock-button" type="button" disabled={syncingLosses} onClick={() => requirePin(() => lockToday())}>Chốt lượt thua hôm nay</button></div>
      </section>

      {pinPrompt && <div className="login-overlay"><form className="login-card" action={submitPin}>
        <p className="eyebrow">QUYỀN QUẢN LÝ</p><h2>Xác nhận PIN</h2><p>Nhập PIN để tiếp tục thao tác.</p>
        {pinError && <p role="alert" className="sync-error">{pinError}</p>}
        <input name="pin" type="password" autoComplete="current-password" placeholder="PIN" required autoFocus />
        <button className="primary-button">Xác nhận</button>
        <button className="secondary-button" type="button" onClick={() => { setPendingPinAction(null); setPinPrompt(false); }}>Hủy</button>
      </form></div>}
    </main>
  );
}

