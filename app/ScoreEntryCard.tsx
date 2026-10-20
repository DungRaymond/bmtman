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

type PlayerState = { value: string; text: string };

export type EditableScoreEntry = {
  id: string;
  amount: number;
  loser: PlayerState;
  recipient: PlayerState;
};

export type ScoreHistoryEntry = EditableScoreEntry & {
  loserLabel: string;
  recipientLabel: string;
};

const INITIAL_STATE: ConfirmScoreEntryState = { successKey: 0, error: "" };
const EMPTY_PLAYER: PlayerState = { value: "", text: "" };
const MIN_AMOUNT = 10000;
const AMOUNT_STEP = 5000;
const PLAYER_NAME_CACHE_KEY = "bmtman-score-player-names";
const GROUP_PRIORITY = { fixed: 0, former_fixed: 1, walkin: 2 };
const GROUP_LABEL = {
  fixed: "Cá»‘ Ä‘á»‹nh",
  former_fixed: "Cá»‘ Ä‘á»‹nh cÅ©",
  walkin: "VÃ£ng lai",
};

function normalizeVietnamese(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ä‘/g, "d")
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

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function readCachedNames() {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(PLAYER_NAME_CACHE_KEY) || "[]");
    return Array.isArray(value)
      ? value.filter((name): name is string => typeof name === "string").map(normalizePlayerName).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function suggestionsWithCachedNames(suggestions: ScorePlayerSuggestion[]) {
  const result = [...suggestions];
  const known = new Set(suggestions.map((item) => normalizeVietnamese(item.label)));
  for (const name of readCachedNames()) {
    const key = normalizeVietnamese(name);
    if (known.has(key)) continue;
    known.add(key);
    result.push({ value: `guest:${name}`, label: name, group: "walkin" });
  }
  return result;
}

function cachePlayerNames(names: string[]) {
  if (typeof window === "undefined") return;
  const merged = [...readCachedNames(), ...names.map(normalizePlayerName).filter(Boolean)];
  const unique = Array.from(new Map(merged.map((name) => [normalizeVietnamese(name), name])).values()).slice(-100);
  window.localStorage.setItem(PLAYER_NAME_CACHE_KEY, JSON.stringify(unique));
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
  const matches = canShowSuggestions ? matchingSuggestions(player.text, suggestions) : [];

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
        placeholder={optional ? "Không bắt buộc" : "Chọn người..."}
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
  const [loser, setLoser] = useState<PlayerState>(() => initialEntry?.loser || EMPTY_PLAYER);
  const [recipient, setRecipient] = useState<PlayerState>(() => initialEntry?.recipient || EMPTY_PLAYER);
  const [amount, setAmount] = useState(initialEntry?.amount ?? MIN_AMOUNT);
  const [editingAmount, setEditingAmount] = useState(false);

  const loserIsValid = !!loser.value && (loser.value !== "custom" || loser.text.trim().length > 0);
  const recipientIsSame = !!recipient.value && recipient.value === loser.value && recipient.text === loser.text;
  const canSubmit = !disabled && !pending && loserIsValid && !recipientIsSame && amount >= MIN_AMOUNT;

  return (
    <form
      className="score-entry-card"
      action={formAction}
      onSubmit={() => cachePlayerNames([loser.text, recipient.text])}
    >
      <input type="hidden" name="date" value={date} />
      {initialEntry && <input type="hidden" name="set_id" value={initialEntry.id} />}
      <input type="hidden" name="amount" value={amount} />

      {initialEntry && deleteAction && (
        <div className="score-entry-edit-head">
          <strong>Chỉnh sửa lượt độ</strong>
          <button
            className="score-entry-delete"
            type="submit"
            formAction={deleteAction}
            disabled={pending}
            onClick={(event) => {
              if (!window.confirm("Xóa lượt độ này? Thao tác không thể hoàn tác.")) event.preventDefault();
            }}
          >
            Xóa lượt
          </button>
        </div>
      )}

      <div className="score-entry-sides">
        <div className="score-entry-side selected">
          <span>NGƯỜI THUA ĐỘ</span>
          <PlayerInput
            name="loser"
            player={loser}
            suggestions={suggestions}
            optional={false}
            disabled={disabled || pending}
            onChange={setLoser}
          />
        </div>
        <div className="score-entry-side">
          <span>NGƯỜI NHẬN TIỀN ĐỘ <small>(nếu cần)</small></span>
          <PlayerInput
            name="recipient"
            player={recipient}
            suggestions={suggestions}
            optional
            disabled={disabled || pending}
            onChange={setRecipient}
          />
        </div>
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
            onClick={() => setAmount((value) => value + AMOUNT_STEP)}
          >+</button>
        </div>
        <div className={onCancel ? "score-entry-actions" : "score-entry-actions single"}>
          {onCancel && (
            <button className="score-entry-cancel" type="button" disabled={pending} onClick={onCancel}>
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
  return <ScoreEntryForm key={state.successKey} {...props} suggestions={suggestionsWithCachedNames(props.suggestions)} formAction={formAction} pending={pending} error={state.error} />;
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
  const cachedSuggestions = suggestionsWithCachedNames(suggestions);

  return (
    <div className={editing ? "score-history-item editing" : "score-history-item"}>
      <div className={disabled ? "score-history-row read-only" : "score-history-row"}>
        <span className="score-history-index">#{index + 1}</span>
        <div className="winner">
          <small>NGƯỜI THUA</small>
          <strong>{entry.loserLabel || "Không rõ"}</strong>
        </div>
        <b>{entry.amount.toLocaleString("vi-VN")}đ</b>
        <div>
          <small>NGƯỜI NHẬN</small>
          <strong>{entry.recipientLabel || "—"}</strong>
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
          suggestions={cachedSuggestions}
          entry={entry}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </div>
  );
}