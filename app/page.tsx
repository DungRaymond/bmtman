import {
  addScoreSetAction,
  deleteScoreSetAction,
  saveScoreSetAction,
  settleDailyScorecardAction,
  unlockScoreSetAction,
} from "@/app/actions";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import {
  formatDateVN,
  getActiveMembers,
  getDailyScorecard,
  money,
  scorePlayerKey,
  todayInputValue,
  type ScorePlayer,
  type ScoreSet,
} from "@/lib/finance";


export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ date?: string }>;
};

type PlayerOption = {
  value: string;
  label: string;
};

function playerLabel(player: ScorePlayer, options: PlayerOption[]) {
  const value = scorePlayerKey(player);
  return options.find((option) => option.value === value)?.label || "Chưa chọn";
}

function PlayerSelect({
  name,
  label,
  player,
  options,
  locked,
}: {
  name: string;
  label: string;
  player: ScorePlayer;
  options: PlayerOption[];
  locked: boolean;
}) {
  if (locked) {
    return (
      <div className="score-slot locked">
        <span>{label}</span>
        <strong>{playerLabel(player, options)}</strong>
      </div>
    );
  }

  return (
    <label className="score-slot">
      <span>{label}</span>
      <select name={name} defaultValue={scorePlayerKey(player)}>
        <option value="">Chọn người</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ScoreSetCard({
  date,
  set,
  index,
  options,
  readOnly,
}: {
  date: string;
  set: ScoreSet;
  index: number;
  options: PlayerOption[];
  readOnly: boolean;
}) {
  const isAWin = set.winner === "A";
  const isBWin = set.winner === "B";
  const lockedView = set.locked || readOnly;

  if (lockedView) {
    return (
      <article className="match-card locked">
        <div className="match-card-head">
          <div>
            <span>Set #{index + 1}</span>
            <strong>{money(set.amount)}</strong>
          </div>
          <b>{readOnly ? "Đã chốt" : "Đã khóa"}</b>
        </div>
        <div className="match-teams">
          <div className={isAWin ? "match-team winner" : "match-team"}>
            <div className="match-side-title">Bên A</div>
            <PlayerSelect
              name="player_0"
              label="Vị trí 1"
              player={set.players[0]}
              options={options}
              locked
            />
            <PlayerSelect
              name="player_1"
              label="Vị trí 2"
              player={set.players[1]}
              options={options}
              locked
            />
          </div>
          <div className={isBWin ? "match-team winner" : "match-team"}>
            <div className="match-side-title">Bên B</div>
            <PlayerSelect
              name="player_2"
              label="Vị trí 3"
              player={set.players[2]}
              options={options}
              locked
            />
            <PlayerSelect
              name="player_3"
              label="Vị trí 4"
              player={set.players[3]}
              options={options}
              locked
            />
          </div>
        </div>
        {!readOnly && (
          <form className="unlock-score-form" action={unlockScoreSetAction}>
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="set_id" value={set.id} />
            <button className="btn-secondary" type="submit">
              Mở khóa để sửa
            </button>
          </form>
        )}
      </article>
    );
  }

  return (
    <form className="match-card" action={saveScoreSetAction}>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="set_id" value={set.id} />
      <input type="hidden" name="winner" value={set.winner || ""} />
      <div className="match-card-head">
        <div>
          <span>Set #{index + 1}</span>
          <label>
            Tiền độ
            <input name="amount" type="number" min="0" defaultValue={set.amount} />
          </label>
        </div>
        <button className="btn-secondary small-btn" name="intent" value="save" type="submit">
          Lưu
        </button>
      </div>

      <div className="match-teams">
        <div className={isAWin ? "match-team winner" : "match-team"}>
          <div className="match-side-title">Bên A</div>
          <PlayerSelect
            name="player_0"
            label="Vị trí 1"
            player={set.players[0]}
            options={options}
            locked={false}
          />
          <PlayerSelect
            name="player_1"
            label="Vị trí 2"
            player={set.players[1]}
            options={options}
            locked={false}
          />
          <button className="match-win-button" name="intent" value="winner_a" type="submit">
            Bên A thắng
          </button>
        </div>
        <div className={isBWin ? "match-team winner" : "match-team"}>
          <div className="match-side-title">Bên B</div>
          <PlayerSelect
            name="player_2"
            label="Vị trí 3"
            player={set.players[2]}
            options={options}
            locked={false}
          />
          <PlayerSelect
            name="player_3"
            label="Vị trí 4"
            player={set.players[3]}
            options={options}
            locked={false}
          />
          <button className="match-win-button" name="intent" value="winner_b" type="submit">
            Bên B thắng
          </button>
        </div>
      </div>

      <div className="match-card-actions">
        <button className="match-lock-button" name="intent" value="lock" type="submit">
          Khóa thẻ
        </button>
        <button className="btn-secondary" formAction={deleteScoreSetAction} type="submit">
          Xóa thẻ
        </button>
      </div>
    </form>
  );
}

export default async function Home({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const date = params.date || todayInputValue();
  const [activeMembers, scorecard] = await Promise.all([
    getActiveMembers(date),
    getDailyScorecard(date),
  ]);
  const sets = scorecard.payload.sets;
  const isSettled = !!scorecard.settled_at;
  const hasOpenSet = sets.some((set) => !set.locked);
  const canSettle = sets.length > 0 && !hasOpenSet && !isSettled;
  const options: PlayerOption[] = [
    ...activeMembers.map((row) => ({
      value: `member:${row.member_id}`,
      label: `${row.member.name} (${row.status === "fixed" ? "cố định" : "cố định cũ"})`,
    })),
    ...Array.from({ length: 12 }, (_, index) => ({
      value: `walkin:${index + 1}`,
      label: `Vãng lai ${index + 1}`,
    })),
  ];

  return (
    <main>
      <ConfigWarning />

      <section className="scoreboard-head">
        <div>
          <span>Ghi độ</span>
          <h1>{formatDateVN(date)}</h1>
          <p>{sets.length} thẻ trong ngày</p>
        </div>
        <form className="score-date-form" action="/" method="get">
          <input type="date" name="date" defaultValue={date} />
          <button className="btn-secondary" type="submit">
            Xem ngày
          </button>
        </form>
      </section>

      <section className="scoreboard-toolbar">
        <form action={addScoreSetAction}>
          <input type="hidden" name="date" value={date} />
          <button className="btn-primary" type="submit" disabled={sets.length >= 12 || isSettled}>
            Thêm thẻ ghi độ
          </button>
        </form>
        <div>
          <strong>{sets.filter((set) => set.locked).length}/{sets.length}</strong>
          <span>{isSettled ? "ngày đã chốt" : "thẻ đã khóa"}</span>
        </div>
      </section>

      <section className="match-card-grid">
        {sets.length === 0 && (
          <div className="empty match-empty">
            Chưa có thẻ ghi độ cho ngày này. Bấm thêm thẻ để bắt đầu.
          </div>
        )}
        {sets.map((set, index) => (
          <ScoreSetCard
            key={set.id}
            date={date}
            set={set}
            index={index}
            options={options}
            readOnly={isSettled}
          />
        ))}
      </section>

      <section className="score-settle-card">
        <div>
          <span>Chốt sổ độ</span>
          <strong>
            {isSettled
              ? "Đã chốt"
              : canSettle
                ? "San sang chot"
                : "Can khoa toan bo the"}
          </strong>
        </div>
        <form className="score-settle-form" action={settleDailyScorecardAction}>
          <input type="hidden" name="date" value={date} />
          <button className="btn-primary" type="submit" disabled={!canSettle}>
            Chốt sổ độ của ngày
          </button>
        </form>
      </section>
    </main>
  );
}
