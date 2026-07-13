"use client";

import { useState } from "react";
import { createManualChargeAction } from "@/app/actions";
import type { Member } from "@/lib/finance";

type Props = {
  members: Member[];
  chargeTypes: { value: string; label: string }[];
  initialDate: string;
};

export function ManualChargeForm({
  members,
  chargeTypes,
  initialDate,
}: Props) {
  const [collectionDate, setCollectionDate] = useState(initialDate);
  const [periodMonth, setPeriodMonth] = useState(initialDate.slice(0, 7));
  const [monthWasChanged, setMonthWasChanged] = useState(false);

  function updateCollectionDate(date: string) {
    setCollectionDate(date);
    if (!monthWasChanged && date.length >= 7) setPeriodMonth(date.slice(0, 7));
  }

  return (
    <form className="grid3" action={createManualChargeAction}>
      <div>
        <label>Thành viên nộp tiền</label>
        <select name="member_id" required>
          <option value="">Chọn thành viên</option>
          {members.map((member) => (
            <option key={member.member_id} value={member.member_id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>Loại khoản thu</label>
        <select name="charge_type" required>
          {chargeTypes.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label>Số tiền phải nộp</label>
        <input name="amount" type="number" min="1" required />
      </div>
      <div>
        <label>Ngày thu</label>
        <input
          name="collection_date"
          type="date"
          value={collectionDate}
          onChange={(event) => updateCollectionDate(event.target.value)}
          required
        />
      </div>
      <div>
        <label>Tháng áp dụng</label>
        <input
          name="period_month"
          type="month"
          value={periodMonth}
          onChange={(event) => {
            setPeriodMonth(event.target.value);
            setMonthWasChanged(true);
          }}
          required
        />
      </div>
      <div>
        <label>Ghi chú</label>
        <input name="note" />
      </div>
      <button className="btn-primary" type="submit">Tạo khoản thu</button>
    </form>
  );
}
