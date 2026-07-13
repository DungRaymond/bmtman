import { createExpenseAction } from "@/app/actions";
import { ConfigWarning } from "@/app/components/ConfigWarning";
import {
  currentMonthValue,
  expenseCategoryLabels,
  formatDateVN,
  getExpenses,
  money,
  todayInputValue,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ month?: string }>;
};

export default async function ChiPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const month = params.month || currentMonthValue();
  const expenses = await getExpenses(month);
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <main>
      <ConfigWarning />

      <section className="page-title">
        <div>
          <h1>Quản lý chi</h1>
          <p>Ghi nhận chi phí sân, cầu, áo, liên hoan và các khoản khác.</p>
        </div>
        <form className="inline-form" action="/chi" method="get">
          <input type="month" name="month" defaultValue={month} />
          <button className="btn-secondary" type="submit">
            Xem tháng
          </button>
        </form>
      </section>

      <section className="summary-grid">
        <div className="metric">
          <span>Tổng chi tháng</span>
          <strong>{money(total)}</strong>
        </div>
        <div className="metric">
          <span>Số khoản chi</span>
          <strong>{expenses.length}</strong>
        </div>
      </section>

      <section className="card">
        <div className="section-title">Thêm khoản chi</div>
        <form className="grid3" action={createExpenseAction}>
          <div>
            <label>Ngày chi</label>
            <input
              name="expense_date"
              type="date"
              defaultValue={todayInputValue()}
              required
            />
          </div>
          <div>
            <label>Danh mục</label>
            <select name="category" required>
              {Object.entries(expenseCategoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Số tiền</label>
            <input name="amount" type="number" min="1" required />
          </div>
          <div className="span-2">
            <label>Mô tả</label>
            <input name="description" placeholder="VD: tiền sân tuần 1" />
          </div>
          <button className="btn-primary" type="submit">
            Ghi khoản chi
          </button>
        </form>
      </section>

      <section className="card">
        <div className="section-title">Danh sách chi tháng {month}</div>
        <div className="table-list">
          {expenses.length === 0 && (
            <div className="empty">Chưa có khoản chi trong tháng này.</div>
          )}
          {expenses.map((expense) => (
            <div className="data-row" key={expense.expense_id}>
              <div>
                <strong>
                  {expenseCategoryLabels[expense.category] || expense.category}
                </strong>
                <div className="muted">{formatDateVN(expense.expense_date)}</div>
                {expense.description && (
                  <div className="muted">{expense.description}</div>
                )}
              </div>
              <strong>{money(expense.amount)}</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
