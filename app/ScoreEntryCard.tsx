"use client";

import { useActionState, useEffect, useId, useState } from "react";
import {
  confirmScoreEntryAction,
  deleteScoreSetAction,
  type ConfirmScoreEntryState,
  updateScoreEntryAction,
} from "@/app/actions";

export type ScorePlayerSuggestion = {
  value: string;
  label: string;
  group: "fixed" | "former_fixed" | "walkin";
};

type Props = {
  date: string;
  suggestions: ScorePlayerSuggestion[];
  disabled: boolean;
};

type Side = "A" | "B";
type PlayerState = { value: string; text: string };

export type EditableScoreEntry = {
  id: string;
  amount: number;
  winner: Side | null;
  players: PlayerState[];
};

export type ScoreHistoryEntry = EditableScoreEntry & {
  sideALabel: string;
  sideBLabel: string;
};

const INITIAL_STATE: ConfirmScoreEntryState = { successKey: 0, error: "" };
const EMPTY_PLAYER: PlayerState = { value: "", text: "" };
const MIN_AMOUNT = 5000;
const AMOUNT_STEP = 5000;
const GROUP_PRIORITY = { fixed: 0, former_fixed: 1, walkin: 2 };
const GROUP_LABEL = {
  fixed: "Cố định",
  former_fixed: "Cố định cũ",
  walkin: "Vãng lai",
};

function normalizeVietnamese(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

function givenName(value: string) {
  return normalizeVietnamese(value).split(" ").at(-1) || "";
}

function matchRank(label: string, query: string) {
  if (!query) return 0;
  const fullName = normalizeVietnamese(label);
  const lastName = givenName(label);
  if (lastName.startsWith(query)) return 0;
  if (lastName.includes(query)) return 1;
  if (fullName.startsWith(query)) return 2;
  return 3;
}

function matchingSuggestions(query: string, suggestions: ScorePlayerSuggestion[]) {
  const normalizedQuery = normalizeVietnamese(query);
  return suggestions
    .filter((item) => !normalizedQuery || normalizeVietnamese(item.label).includes(normalizedQuery))
    .sort((a, b) =>
      GROUP_PRIORITY[a.group] - GROUP_PRIORITY[b.group] ||
      matchRank(a.label, normalizedQuery) - matchRank(b.label, normalizedQuery) ||
      givenName(a.label).localeCompare(givenName(b.label), "vi")
    )
    .slice(0, 8);
}

function PlayerInput({
  name,
  player,
  optional,
  suggestions,
  disabled,
  onChange,
}: {
  name: string;
  player: PlayerState;
  optional: boolean;
  suggestions: ScorePlayerSuggestion[];
  disabled: boolean;
  onChange: (player: PlayerState) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const normalizedQuery = normalizeVietnamese(player.text);
  const canShowSuggestions = normalizedQuery.length >= 2;
  const matches = canShowSuggestions
    ? matchingSuggestions(player.text, suggestions)
    : [];

  function selectSuggestion(suggestion: ScorePlayerSuggestion) {
    onChange({ value: suggestion.value, text: suggestion.label });
    setOpen(false);
  }

  function resolveExactName() {
    const normalizedText = normalizeVietnamese(player.text);
    const exact = suggestions.find(
      (suggestion) => normalizeVietnamese(suggestion.label) === normalizedText
    );
    if (exact) selectSuggestion(exact);
  }

  return (
    <div className="score-player-control" data-player-control>
      <input type="hidden" name={name} value={player.value} />
      {player.value === "custom" && (
        <input type="hidden" name={`${name}_custom`} value={player.text.trim()} />
      )}
      <input
        className="score-player-input"
        value={player.text}
        placeholder={optional ? "— 1v1 —" : "Chọn người..."}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        required={!optional}
        disabled={disabled}
        onFocus={() => setOpen(canShowSuggestions)}
        onBlur={() => {
          resolveExactName();
          window.setTimeout(() => setOpen(false), 100);
        }}
        onChange={(event) => {
          const text = event.target.value;
          onChange({ value: text.trim() ? "custom" : "", text });
          setOpen(normalizeVietnamese(text).length >= 2);
        }}
      />
      {open && canShowSuggestions && matches.length > 0 && (
        <div className="score-player-suggestions" id={listId} role="listbox">
          {matches.map((suggestion) => (
            <button
              className="score-player-suggestion"
              type="button"
              role="option"
              aria-selected={player.value === suggestion.value}
              key={`${suggestion.group}:${suggestion.value}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}
            >
              <strong>{suggestion.label}</strong>
              <span>{GROUP_LABEL[suggestion.group]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreEntryForm({
  date,
  suggestions,
  disabled,
  formAction,
  pending,
  error,
  initialEntry,
  submitLabel = "Xác nhận",
  onCancel,
  deleteAction,
}: Props & {
  formAction: (formData: FormData) => void;
  pending: boolean;
  error: string;
  initialEntry?: EditableScoreEntry;
  submitLabel?: string;
  onCancel?: () => void;
  deleteAction?: (formData: FormData) => void;
}) {
  const [players, setPlayers] = useState<PlayerState[]>(() =>
    initialEntry
      ? initialEntry.players.map((player) => ({ ...player }))
      : [EMPTY_PLAYER, EMPTY_PLAYER, EMPTY_PLAYER, EMPTY_PLAYER]
  );
  const [amount, setAmount] = useState(initialEntry?.amount ?? MIN_AMOUNT);
  const [editingAmount, setEditingAmount] = useState(false);
  const [winner, setWinner] = useState<Side | null>(initialEntry?.winner ?? null);

  function updatePlayer(index: number, player: PlayerState) {
    setPlayers((current) =>
      current.map((item, itemIndex) => itemIndex === index ? player : item)
    );
  }

  function playerIsValid(index: number) {
    const player = players[index];
    if (!player.value) return false;
    return player.value !== "custom" || player.text.trim().length > 0;
  }

  const canSubmit =
    !disabled &&
    !pending &&
    playerIsValid(0) &&
    playerIsValid(2) &&
    (!players[1].value || playerIsValid(1)) &&
    (!players[3].value || playerIsValid(3)) &&
    amount >= MIN_AMOUNT &&
    !!winner;

  return (
    <form className="score-entry-card" action={formAction}>
      <input type="hidden" name="date" value={date} />
      {initialEntry && <input type="hidden" name="set_id" value={initialEntry.id} />}
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="winner" value={winner || ""} />

      {initialEntry && deleteAction && (
        <div className="score-entry-edit-head">
          <strong>Chỉnh sửa lượt độ</strong>
          <button
            className="score-entry-delete"
            type="submit"
            formAction={deleteAction}
            disabled={pending}
            onClick={(event) => {
              if (!window.confirm("Xóa lượt độ này? Thao tác không thể hoàn tác.")) {
                event.preventDefault();
              }
            }}
          >
            Xóa lượt
          </button>
        </div>
      )}

      <div className="score-entry-sides">
        {(["A", "B"] as const).map((side) => {
          const start = side === "A" ? 0 : 2;
          return (
            <div
              className={winner === side ? "score-entry-side selected" : "score-entry-side"}
              key={side}
              role="button"
              tabIndex={disabled || pending ? -1 : 0}
              aria-pressed={winner === side}
              onClick={(event) => {
                if (disabled || pending) return;
                if ((event.target as HTMLElement).closest("[data-player-control]")) return;
                setWinner((current) => current === side ? null : side);
              }}
              onKeyDown={(event) => {
                if (disabled || pending) return;
                if ((event.target as HTMLElement).closest("[data-player-control]")) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setWinner((current) => current === side ? null : side);
              }}
            >
              <span>BÊN {side}{winner === side && <b aria-hidden="true">✓</b>}</span>
              <PlayerInput
                name={`player_${start}`}
                player={players[start]}
                suggestions={suggestions}
                optional={false}
                disabled={disabled || pending}
                onChange={(player) => updatePlayer(start, player)}
              />
              <PlayerInput
                name={`player_${start + 1}`}
                player={players[start + 1]}
                suggestions={suggestions}
                optional
                disabled={disabled || pending}
                onChange={(player) => updatePlayer(start + 1, player)}
              />
            </div>
          );
        })}
      </div>

      {error && <p className="score-entry-error" aria-live="polite">{error}</p>}
      <div className="score-entry-footer">
        <div className="score-amount-control">
          <button
            type="button"
            aria-label="Giảm 5.000đ"
            disabled={disabled || pending || amount <= MIN_AMOUNT}
            onClick={() => setAmount((value) => Math.max(MIN_AMOUNT, value - AMOUNT_STEP))}
          >−</button>
          <input
            aria-label="Mức độ"
            inputMode="numeric"
            value={editingAmount ? String(amount) : `${amount.toLocaleString("vi-VN")}đ`}
            disabled={disabled || pending}
            onFocus={() => setEditingAmount(true)}
            onBlur={() => setEditingAmount(false)}
            onChange={(event) => {
              const value = Number(event.target.value.replace(/\D/g, ""));
              setAmount(Number.isFinite(value) ? value : MIN_AMOUNT);
            }}
          />
          <button
            type="button"
            aria-label="Tăng 5.000đ"
            disabled={disabled || pending}
            onClick={() => setAmount((value) => Math.max(MIN_AMOUNT, value + AMOUNT_STEP))}
          >+</button>
        </div>
        <div className={onCancel ? "score-entry-actions" : "score-entry-actions single"}>
          {onCancel && (
            <button
              className="score-entry-cancel"
              type="button"
              disabled={pending}
              onClick={onCancel}
            >
              Hủy
            </button>
          )}
          <button className="score-entry-submit" type="submit" disabled={!canSubmit}>
            ✓ {pending ? "Đang lưu..." : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

export function ScoreEntryCard(props: Props) {
  const [state, formAction, pending] = useActionState(confirmScoreEntryAction, INITIAL_STATE);
  return (
    <ScoreEntryForm
      key={state.successKey}
      {...props}
      formAction={formAction}
      pending={pending}
      error={state.error}
    />
  );
}

function ScoreHistoryEditForm({
  date,
  suggestions,
  entry,
  onCancel,
  onSaved,
}: {
  date: string;
  suggestions: ScorePlayerSuggestion[];
  entry: EditableScoreEntry;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateScoreEntryAction, INITIAL_STATE);

  useEffect(() => {
    if (state.successKey > 0) onSaved();
  }, [state.successKey, onSaved]);

  return (
    <div className="score-history-edit-form">
      <ScoreEntryForm
        date={date}
        suggestions={suggestions}
        disabled={false}
        formAction={formAction}
        pending={pending}
        error={state.error}
        initialEntry={entry}
        submitLabel="Lưu sửa đổi"
        onCancel={onCancel}
        deleteAction={deleteScoreSetAction}
      />
    </div>
  );
}

export function ScoreHistoryEditor({
  date,
  index,
  suggestions,
  entry,
  disabled,
}: {
  date: string;
  index: number;
  suggestions: ScorePlayerSuggestion[];
  entry: ScoreHistoryEntry;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className={editing ? "score-history-item editing" : "score-history-item"}>
      <div className={disabled ? "score-history-row read-only" : "score-history-row"}>
        <span className="score-history-index">#{index + 1}</span>
        <div className={entry.winner === "A" ? "winner" : ""}>
          <small>BÊN A</small>
          <strong>{entry.sideALabel}</strong>
        </div>
        <b>{entry.amount.toLocaleString("vi-VN")}đ</b>
        <div className={entry.winner === "B" ? "winner" : ""}>
          <small>BÊN B</small>
          <strong>{entry.sideBLabel}</strong>
        </div>
        {!disabled && (
          <button
            className="score-history-edit-button"
            type="button"
            aria-expanded={editing}
            aria-label={`Sửa lượt độ ${index + 1}`}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? "Đóng" : "Sửa"}
          </button>
        )}
      </div>
      {editing && (
        <ScoreHistoryEditForm
          date={date}
          suggestions={suggestions}
          entry={entry}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </div>
  );
}
