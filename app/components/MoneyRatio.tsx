import { money } from "@/lib/finance";

export function MoneyRatio({ paid, total }: { paid: number; total: number }) {
  const paidAmount = Number(paid || 0);
  const totalAmount = Number(total || 0);
  const status = paidAmount >= totalAmount ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

  return (
    <b className="money-ratio">
      <em className={`money-ratio-paid ${status}`}>{money(paidAmount)}</em>
      <em className="money-ratio-separator">/</em>
      <em className="money-ratio-total">{money(totalAmount)}</em>
    </b>
  );
}
