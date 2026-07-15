"use client";

import { useState } from "react";
import { createFormerFixedReceivableAction } from "@/app/actions";

type Props = {
  members: { member_id: number; name: string }[];
  initialDate: string;
  initialAmount: number;
};

const AMOUNT_STEP = 5000;

export function FormerFixedReceivableForm({
  members,
  initialDate,
  initialAmount,
}: Props) {
  const [amount, setAmount] = useState(Math.max(initialAmount, AMOUNT_STEP));

  return (
    <form
      id="former-fixed-receivable-form"
      className="compact-receivable-form"
      action={createFormerFixedReceivableAction}
    >
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
      <div>
        <label>Thành viên cố định cũ</label>
        <select name="member_id" required>
          <option value="">Chọn thành viên</option>
          {members.map((member) => (
            <option key={member.member_id} value={member.member_id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
