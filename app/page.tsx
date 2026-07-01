"use client";

import { useCallback, useEffect, useState } from "react";
import {
  hasSupabaseConfig,
  supabase,
  TABLE_NAME,
  type MatchRow,
} from "@/lib/supabaseClient";

function todayStr() {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDateVN(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

type PlayerStat = {
  name: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
};

function computeStats(matches: MatchRow[]): PlayerStat[] {
  const map = new Map<string, PlayerStat>();

  const ensure = (name: string) => {
    if (!map.has(name)) {
      map.set(name, {
        name,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      });
    }
    return map.get(name)!;
  };

  matches.forEach((m) => {
    const teamA = [m.team_a_player1, m.team_a_player2];
    const teamB = [m.team_b_player1, m.team_b_player2];
    const aWin = m.score_a > m.score_b;
    const bWin = m.score_b > m.score_a;

    teamA.forEach((name) => {
      const s = ensure(name);
      s.played += 1;
      s.pointsFor += m.score_a;
      s.pointsAgainst += m.score_b;
      if (aWin) s.wins += 1;
      if (bWin) s.losses += 1;
    });
    teamB.forEach((name) => {
      const s = ensure(name);
      s.played += 1;
      s.pointsFor += m.score_b;
      s.pointsAgainst += m.score_a;
      if (bWin) s.wins += 1;
      if (aWin) s.losses += 1;
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst);
  });
}

export default function Home() {
  const [date, setDate] = useState(() => todayStr());
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "" | "error" | "ok"; msg: string }>({
    type: "",
    msg: "",
  });

  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [b1, setB1] = useState("");
  const [b2, setB2] = useState("");
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchMatches = useCallback(
    async (showLoading = true) => {
      if (!supabase || !date) return;
      if (showLoading) {
        setLoading(true);
        setStatus({ type: "", msg: "" });
      }

      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select("*")
        .eq("match_date", date)
        .order("created_at", { ascending: true });

      if (showLoading) {
        setLoading(false);
      }
      if (error) {
        setStatus({ type: "error", msg: "Lỗi tải dữ liệu: " + error.message });
        return;
      }
      setMatches((data as MatchRow[]) || []);
    },
    [date]
  );

  useEffect(() => {
    if (!supabase || !date) return;

    let ignore = false;

    async function loadMatches() {
      const { data, error } = await supabase!
        .from(TABLE_NAME)
        .select("*")
        .eq("match_date", date)
        .order("created_at", { ascending: true });

      if (ignore) return;
      if (error) {
        setStatus({ type: "error", msg: "Lỗi tải dữ liệu: " + error.message });
        return;
      }
      setMatches((data as MatchRow[]) || []);
    }

    void loadMatches();

    return () => {
      ignore = true;
    };
  }, [date]);

  const resetForm = () => {
    setA1("");
    setA2("");
    setB1("");
    setB2("");
    setScoreA("");
    setScoreB("");
    setNote("");
  };

  const canSubmit =
    a1.trim() !== "" &&
    a2.trim() !== "" &&
    b1.trim() !== "" &&
    b2.trim() !== "" &&
    scoreA !== "" &&
    scoreB !== "" &&
    !Number.isNaN(Number(scoreA)) &&
    !Number.isNaN(Number(scoreB)) &&
    hasSupabaseConfig;

  const handleConfirm = async () => {
    if (!canSubmit || saving || !supabase) return;
    setSaving(true);
    setStatus({ type: "", msg: "" });
    const payload = {
      match_date: date,
      team_a_player1: a1.trim(),
      team_a_player2: a2.trim(),
      team_b_player1: b1.trim(),
      team_b_player2: b2.trim(),
      score_a: Number(scoreA),
      score_b: Number(scoreB),
      note: note.trim() || null,
    };
    const { error } = await supabase.from(TABLE_NAME).insert(payload);
    setSaving(false);
    if (error) {
      setStatus({ type: "error", msg: "Lỗi lưu: " + error.message });
      return;
    }
    setStatus({ type: "ok", msg: "Đã ghi điểm thành công!" });
    resetForm();
    fetchMatches();
  };

  const handleDelete = async (id: string) => {
    if (!supabase || !confirm("Xoá set này?")) return;
    const { error } = await supabase.from(TABLE_NAME).delete().eq("id", id);
    if (error) {
      setStatus({ type: "error", msg: "Lỗi xoá: " + error.message });
      return;
    }
    fetchMatches();
  };

  return (
    <main>
      <h1>Ghi điểm cầu lông (2 đấu 2)</h1>

      {!hasSupabaseConfig && (
        <div className="config-warning">
          Chưa cấu hình Supabase. Thêm biến môi trường{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> và{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> trong Vercel Project
          Settings → Environment Variables, rồi redeploy.
        </div>
      )}

      <div className="card">
        <label>Chọn ngày</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          suppressHydrationWarning
        />
      </div>

      {!date ? (
        <div className="card">
          <div className="empty">Đang tải...</div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="section-title">
              Ghi điểm set mới - {formatDateVN(date)}
            </div>

            <div className="grid2">
              <div>
                <label>Đội A - Người 1</label>
                <input
                  type="text"
                  value={a1}
                  onChange={(e) => setA1(e.target.value)}
                  placeholder="Tên..."
                />
              </div>
              <div>
                <label>Đội A - Người 2</label>
                <input
                  type="text"
                  value={a2}
                  onChange={(e) => setA2(e.target.value)}
                  placeholder="Tên..."
                />
              </div>
            </div>

            <div className="vs">VS</div>

            <div className="grid2">
              <div>
                <label>Đội B - Người 1</label>
                <input
                  type="text"
                  value={b1}
                  onChange={(e) => setB1(e.target.value)}
                  placeholder="Tên..."
                />
              </div>
              <div>
                <label>Đội B - Người 2</label>
                <input
                  type="text"
                  value={b2}
                  onChange={(e) => setB2(e.target.value)}
                  placeholder="Tên..."
                />
              </div>
            </div>

            <div className="grid2" style={{ marginTop: 10 }}>
              <div>
                <label>Điểm đội A</label>
                <input
                  type="number"
                  min={0}
                  value={scoreA}
                  onChange={(e) => setScoreA(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label>Điểm đội B</label>
                <input
                  type="number"
                  min={0}
                  value={scoreB}
                  onChange={(e) => setScoreB(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <label>Ghi chú (tuỳ chọn)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: sân 2, giao hữu..."
              />
            </div>

            <div className="row" style={{ marginTop: 14 }}>
              <button
                className="btn-primary"
                disabled={!canSubmit || saving}
                onClick={handleConfirm}
              >
                {saving ? "Đang lưu..." : "Xác nhận ghi điểm"}
              </button>
              <button className="btn-secondary" onClick={resetForm}>
                Xoá form
              </button>
            </div>
            {status.msg && (
              <div className={"status " + status.type}>{status.msg}</div>
            )}
          </div>

          {matches.length > 0 && (
            <div className="card">
              <div className="section-title">
                Tổng kết ngày {formatDateVN(date)}
              </div>
              <div className="stats-table">
                <div className="stats-row stats-head">
                  <div className="stats-name">Người chơi</div>
                  <div>Trận</div>
                  <div>Thắng</div>
                  <div>Thua</div>
                  <div>Hiệu số</div>
                </div>
                {computeStats(matches).map((s) => (
                  <div className="stats-row" key={s.name}>
                    <div className="stats-name">{s.name}</div>
                    <div>{s.played}</div>
                    <div className="win-text">{s.wins}</div>
                    <div className="lose-text">{s.losses}</div>
                    <div>
                      {s.pointsFor - s.pointsAgainst > 0 ? "+" : ""}
                      {s.pointsFor - s.pointsAgainst}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                Lịch sử ngày {formatDateVN(date)}
              </div>
              <button className="btn-secondary small-btn" onClick={() => fetchMatches()}>
                Tải lại
              </button>
            </div>

            {loading && <div className="empty">Đang tải...</div>}
            {!loading && matches.length === 0 && (
              <div className="empty">Chưa có set nào trong ngày này.</div>
            )}
            {!loading &&
              matches.map((m) => {
                const aWin = m.score_a > m.score_b;
                const bWin = m.score_b > m.score_a;
                return (
                  <div className="set-row" key={m.id}>
                    <div>
                      <div>
                        <span className={"badge " + (aWin ? "win" : "")}>
                          {m.team_a_player1} & {m.team_a_player2}
                        </span>
                      </div>
                      <div className="muted" style={{ margin: "4px 0" }}>
                        vs
                      </div>
                      <div>
                        <span className={"badge " + (bWin ? "win" : "")}>
                          {m.team_b_player1} & {m.team_b_player2}
                        </span>
                      </div>
                      {m.note && (
                        <div className="muted" style={{ marginTop: 4 }}>
                          Ghi chú: {m.note}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="score-big">
                        {m.score_a} - {m.score_b}
                      </div>
                      <button
                        className="btn-danger small-btn"
                        style={{ marginTop: 8 }}
                        onClick={() => handleDelete(m.id)}
                      >
                        Xoá
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </main>
  );
}
