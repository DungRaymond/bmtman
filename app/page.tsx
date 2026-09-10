
import { ConfigWarning } from "@/app/components/ConfigWarning";
import {
  ScoreEntryCard,
  ScoreHistoryEditor,
  type ScorePlayerSuggestion,
} from "@/app/ScoreEntryCard";
import {
  formatDateVN,
  currentMonthValue,
  getActiveMembers,
  getDailyScorecard,
  getMonthlyStakePeople,
  getMembers,
  getNamedWalkinNames,
  money,
  scorePlayerKey,
  todayInputValue,
  type Member,
  type ScorePlayer,
} from "@/lib/finance";


export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ date?: string }>;
};

function playerSuggestions(
  activeMembers: Awaited<ReturnType<typeof getActiveMembers>>,
  walkinNames: string[]
): ScorePlayerSuggestion[] {
  const suggestions: ScorePlayerSuggestion[] = [];
  const knownNames = new Set<string>();
  for (const status of ["fixed", "former_fixed"] as const) {
    for (const row of activeMembers.filter((item) => item.status === status)) {
      if (!row.member) continue;
      const name = row.member.name.trim();
      knownNames.add(name.toLocaleLowerCase("vi"));
      suggestions.push({
        value: `member:${row.member_id}`,
        label: name,
        group: status,
      });
    }
  }
  for (const name of walkinNames) {
    if (knownNames.has(name.toLocaleLowerCase("vi"))) continue;
    suggestions.push({ value: `guest:${name}`, label: name, group: "walkin" });
  }
  return suggestions;
}

function playerLabel(player: ScorePlayer, members: Member[]) {
  if (player.type === "member") {
    return members.find((member) => member.member_id === player.memberId)?.name || "Không rõ";
  }
  if (player.type === "guest") return player.name || "Vãng lai";
  if (player.type === "walkin") return `Vãng lai ${player.walkinNumber}`;
  return "—";
}

function personListLabel(players: ScorePlayer[], members: Member[]) {
  return players
    .filter((player) => player.type !== "empty")
    .map((player) => playerLabel(player, members))
    .join(" & ");
}

function loserPlayersForDisplay(set: { loser?: ScorePlayer; winner: "A" | "B" | null; players: ScorePlayer[] }) {
  if (set.loser && set.loser.type !== "empty") return [set.loser];
  return set.winner === "A" ? set.players.slice(2, 4) : set.players.slice(0, 2);
}

function recipientPlayersForDisplay(set: { recipient?: ScorePlayer; winner: "A" | "B" | null; players: ScorePlayer[] }) {
  if (set.recipient && set.recipient.type !== "empty") return [set.recipient];
  return set.winner === "A" ? set.players.slice(0, 2) : set.players.slice(2, 4);
}

function editablePlayer(player: ScorePlayer, members: Member[]) {
  return {
    value: scorePlayerKey(player),
    text: player.type === "empty" ? "" : playerLabel(player, members),
  };
}

export default async function Home({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const today = todayInputValue();
  const currentMonth = currentMonthValue();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || "")
    ? params.date as string
    : today;
const [members, activeMembers, walkinNames, scorecard, rawMonthlyStakePeople] = await Promise.all([
    getMembers(),
    getActiveMembers(date),
    getNamedWalkinNames(),
    getDailyScorecard(date),
    getMonthlyStakePeople(currentMonth),
  ]);
  const monthlyStakePeople = rawMonthlyStakePeople
    .map((person) => {
      const days = person.days.filter((day) => day.date <= today);
      return {
        ...person,
        days,
        total: days.reduce((sum, day) => sum + day.total, 0),
      };
    })
    .filter((person) => person.days.length > 0);
  const monthlyStakeTotal = monthlyStakePeople.reduce((sum, person) => sum + person.total, 0);
  const sets = scorecard.payload.sets;
const suggestions = playerSuggestions(activeMembers, walkinNames);

  return (
    <main className="score-page">
      <ConfigWarning />

      <section className="scoreboard-head">
        <div className="score-date-summary">
          <h1>{formatDateVN(date)}</h1>
          <p>{sets.length} lượt đã ghi</p>
        </div>
        <form className="score-date-form" action="/" method="get">
          <input type="date" name="date" defaultValue={date} />
          <button className="btn-secondary" type="submit">Xem ngày</button>
        </form>
      </section>

      <ScoreEntryCard
        date={date}
        suggestions={suggestions}
        disabled={sets.length >= 12}
      />

      <section className="score-history">
        <div className="score-history-title">
          <span>Đã ghi trong ngày</span>
          <strong>{sets.length}/12</strong>
        </div>
        {sets.length === 0 && <div className="empty">Chưa có lượt độ nào.</div>}
        {sets.map((set, index) => (
          <ScoreHistoryEditor
            date={date}
            index={index}
            suggestions={suggestions}
            disabled={false}
            entry={{
              id: set.id,
              amount: set.amount,
              loser: editablePlayer(loserPlayersForDisplay(set)[0] || { type: "empty" }, members),
              recipient: editablePlayer(recipientPlayersForDisplay(set)[0] || { type: "empty" }, members),
              loserLabel: personListLabel(loserPlayersForDisplay(set), members),
              recipientLabel: personListLabel(recipientPlayersForDisplay(set), members),
            }}
            key={set.id}
          />
        ))}
      </section>

      <section className="score-monthly-stake">
        <div className="score-monthly-stake-head">
          <div>
            <strong>Độ tháng này</strong>
            <span>Từ đầu tháng đến hiện tại</span>
          </div>
          <b>{money(monthlyStakeTotal)}</b>
        </div>
        {monthlyStakePeople.length === 0 ? (
          <div className="empty">Chưa có lượt độ nào trong tháng này.</div>
        ) : (
          <div className="stake-person-list">
            {monthlyStakePeople.map((person) => {
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
                          </div>
                          <b>{money(day.total)}</b>
                        </div>
                        <div className="stake-turn-list">
                          {day.turns.map((turn) => (
                            <div className="stake-turn-row" key={`${day.date}:${turn.setId}`}>
                              <div>
                                <strong>Lượt {turn.setNumber} · {turn.loserNames} thua</strong>
                                {turn.recipientNames && <span>Nhận tiền: {turn.recipientNames}</span>}
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
          </div>
        )}
      </section>

    </main>
  );
}
