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
  const [memberId, setMemberId] = useState("");
  const [collectionDate, setCollectionDate] = useState(initialDate);
  const [periodMonth, setPeriodMonth] = useState(initialDate.slice(0, 7));
  const [monthWasChanged, setMonthWasChanged] = useState(false);

  function updateCollectionDate(date: string) {
    setCollectionDate(date);
    if (!monthWasChanged && date.length >= 7) setPeriodMonth(date.slice(0, 7));
  }

  return (
    <form id="manual-charge-form" className="grid3 manual-charge-form" action={createManualChargeAction}>
      <div className="manual-charge-member-amount">
        <div className="manual-charge-member">
          <select
            name="member_id"
            aria-label="Người nộp"
            className={memberId ? "has-value" : ""}
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
            required
          >
            <option value="" disabled>Người nộp</option>
            {members.map((member) => (
              <option key={member.member_id} value={member.member_id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <input name="amount" type="number" min="1" placeholder="Số tiền phải nộp" aria-label="Số tiền phải nộp" required />
        </div>
      </div>
      <div className="manual-charge-triple">
        <div>
          <select name="charge_type" aria-label="Loại khoản thu" required defaultValue="">
            <option value="" disabled>Loại khoản thu</option>
            {chargeTypes.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <input
            name="collection_date"
            type="date"
            aria-label="Ngày thu"
            value={collectionDate}
            onChange={(event) => updateCollectionDate(event.target.value)}
            required
          />
        </div>
        <div>
          <input
            name="period_month"
            type="month"
            aria-label="Tháng áp dụng"
            value={periodMonth}
            onChange={(event) => {
              setPeriodMonth(event.target.value);
              setMonthWasChanged(true);
            }}
            required
          />
        </div>
      </div>
      <div>
        <input name="note" placeholder="Ghi chú" aria-label="Ghi chú" />
      </div>
    </form>
  );
}
