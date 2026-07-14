"use client";

import { useState } from "react";
import { createWalkinReceivableAction } from "@/app/actions";

type Props = {
  initialDate: string;
  initialAmount: number;
};

const AMOUNT_STEP = 5000;

export function WalkinReceivableForm({
  initialDate,
  initialAmount,
}: Props) {
  const [amount, setAmount] = useState(Math.max(initialAmount, AMOUNT_STEP));
  const [walkinCount, setWalkinCount] = useState(1);

  return (
    <form className="compact-receivable-form" action={createWalkinReceivableAction}>
      <div className="receivable-date-amount-row">
        <div>
          <label>Ngày</label>
          <input name="date" type="date" defaultValue={initialDate} required />
        </div>
        <div>
          <label>Mức thu</label>
          <div className="amount-stepper compact-amount-stepper">
            <button
              type="button"
              title="Giảm 5.000đ"
              aria-label="Giảm 5.000đ"
              onClick={() => setAmount((value) => Math.max(AMOUNT_STEP, value - AMOUNT_STEP))}
            >
              -
            </button>
            <output>{amount.toLocaleString("vi-VN")}đ</output>
            <button
              type="button"
              title="Tăng 5.000đ"
              aria-label="Tăng 5.000đ"
              onClick={() => setAmount((value) => value + AMOUNT_STEP)}
            >
              +
            </button>
            <input type="hidden" name="amount" value={amount} />
          </div>
        </div>
      </div>
      <div className="receivable-name-count-row">
        <div>
          <label>Tên vãng lai (không bắt buộc)</label>
          <input
            name="walkin_name"
            type="text"
            maxLength={80}
            placeholder={walkinCount > 1 ? "Chỉ nhập tên khi tạo 1 người" : "Có thể để trống"}
            disabled={walkinCount > 1}
          />
        </div>
        <div className="receivable-count-field">
          <label>SL</label>
          <input
            name="walkin_count"
            type="number"
            min="1"
            max="30"
            value={walkinCount}
            onChange={(event) => setWalkinCount(Number(event.target.value))}
            aria-label="Số người vãng lai"
            required
          />
        </div>
      </div>
      <button className="btn-primary" type="submit">
        Tạo {walkinCount || 0} khoản vãng lai
      </button>
    </form>
  );
}
