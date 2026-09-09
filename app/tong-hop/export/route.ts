import {
  chargeTypeLabels,
  expenseCategoryLabels,
  formatDateVN,
  getExpenses,
  getMonthSummary,
  getMemberPaymentsByMonth,
  getWalkinsByMonth,
  walkinSessionDate,
} from "@/lib/finance";
import type { MonthlyMemberPayment, WalkinByDay } from "@/lib/finance";
import { isThuRouteAuthenticated } from "@/lib/thuAuth";

export const dynamic = "force-dynamic";

type Cell = string | number;
type Sheet = { name: string; rows: Cell[][] };

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cellXml(value: Cell, header = false) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell ss:StyleID="${header ? "Header" : "Number"}"><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell ss:StyleID="${header ? "Header" : "Text"}"><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`;
}

function sheetXml(sheet: Sheet) {
  const [header, ...body] = sheet.rows;
  return `<Worksheet ss:Name="${xmlEscape(sheet.name)}"><Table>${
    header ? `<Row>${header.map((cell) => cellXml(cell, true)).join("")}</Row>` : ""
  }${body.map((row) => `<Row>${row.map((cell) => cellXml(cell)).join("")}</Row>`).join("")}</Table></Worksheet>`;
}

function paymentMember(payment: MonthlyMemberPayment) {
  const charge = Array.isArray(payment.charges) ? payment.charges[0] : payment.charges;
  return charge?.members && !Array.isArray(charge.members) ? charge.members : null;
}

function paymentChargeType(payment: MonthlyMemberPayment) {
  const charge = Array.isArray(payment.charges) ? payment.charges[0] : payment.charges;
  return charge?.charge_type || "";
}

function groupWalkinsByDate(rows: WalkinByDay[]) {
  const groups = new Map<string, { count: number; expected: number; collected: number; session: number; stake: number }>();

  for (const row of rows) {
    const date = walkinSessionDate(row);
    if (!date) continue;
    const current = groups.get(date) || { count: 0, expected: 0, collected: 0, session: 0, stake: 0 };
    const expected = Number(row.amount_expected) || 0;
    const collected = Number(row.amount_collected) || 0;
    current.count += 1;
    current.expected += expected;
    current.collected += collected;
    if (row.fee_type === "session_fee") current.session += collected;
    else current.stake += collected;
    groups.set(date, current);
  }

  return Array.from(groups.entries()).sort(([left], [right]) => right.localeCompare(left));
}

function monthRange(from: string, to: string) {
  const result: string[] = [];
  const cursor = new Date(`${from}-01T00:00:00Z`);
  const end = new Date(`${to}-01T00:00:00Z`);
  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

function workbookXml(sheets: Sheet[]) {
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Text"><Alignment ss:Vertical="Center"/></Style>
    <Style ss:ID="Number"><NumberFormat ss:Format="#,##0"/></Style>
    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#E8EEF7" ss:Pattern="Solid"/></Style>
  </Styles>
  ${sheets.map(sheetXml).join("")}
</Workbook>`;
}

export async function GET(request: Request) {
  if (!(await isThuRouteAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const from = params.get("from") || params.get("month") || "";
  const to = params.get("to") || params.get("month") || from;
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!validMonth.test(from) || !validMonth.test(to) || from > to) {
    return new Response("Khoảng tháng không hợp lệ", { status: 400 });
  }

  const months = monthRange(from, to);
  if (months.length > 120) {
    return new Response("Khoảng xuất tối đa là 120 tháng", { status: 400 });
  }

  const monthly = await Promise.all(
    months.map(async (month) => {
      const [summary, payments, walkins, expenses] = await Promise.all([
        getMonthSummary(month),
        getMemberPaymentsByMonth(month),
        getWalkinsByMonth(month),
        getExpenses(month),
      ]);
      return { summary, payments, walkins, expenses };
    })
  );
  const firstSummary = monthly[0].summary;
  const payments = monthly.flatMap((item) => item.payments);
  const walkins = monthly.flatMap((item) => item.walkins);
  const expenses = monthly.flatMap((item) => item.expenses);
  const summary = {
    openingBalance: firstSummary.openingBalance,
    paymentsTotal: monthly.reduce((total, item) => total + item.summary.paymentsTotal, 0),
    walkinsTotal: monthly.reduce((total, item) => total + item.summary.walkinsTotal, 0),
    expensesTotal: monthly.reduce((total, item) => total + item.summary.expensesTotal, 0),
    closingEstimate: firstSummary.openingBalance +
      monthly.reduce((total, item) => total + item.summary.paymentsTotal + item.summary.walkinsTotal - item.summary.expensesTotal, 0),
  };

  const walkinRows = groupWalkinsByDate(walkins);
  const sheets: Sheet[] = [
    {
      name: "Tổng hợp",
      rows: [
        ["BÁO CÁO THU CHI", `${from} đến ${to}`],
        ["Khoản mục", "Số tiền (VND)"],
        ["Tồn đầu kỳ", summary.openingBalance],
        ["Thu thành viên", summary.paymentsTotal],
        ["Thu vãng lai", summary.walkinsTotal],
        ["Tổng chi", summary.expensesTotal],
        ["Tồn cuối ước tính", summary.closingEstimate],
      ],
    },
    {
      name: "Thu thành viên",
      rows: [
        ["Ngày thu", "Thành viên", "Loại khoản thu", "Số tiền (VND)", "Phương thức", "Tính vào quỹ", "Ghi chú"],
        ...payments.map((payment) => [
          formatDateVN(payment.paid_date),
          paymentMember(payment)?.name || "Không rõ",
          chargeTypeLabels[paymentChargeType(payment)] || "Khoản thu",
          Number(payment.amount_paid) || 0,
          payment.payment_method || "",
          payment.excludedFromFund ? "Không" : "Có",
          payment.note || "",
        ]),
      ],
    },
    {
      name: "Vãng lai theo ngày",
      rows: [
        ["Ngày", "Số khoản", "Phải thu (VND)", "Đã thu (VND)", "Phí buổi đã thu (VND)", "Tiền độ đã thu (VND)", "Còn lại (VND)"],
        ...walkinRows.map(([date, group]) => [
          formatDateVN(date),
          group.count,
          group.expected,
          group.collected,
          group.session,
          group.stake,
          Math.max(group.expected - group.collected, 0),
        ]),
      ],
    },
    {
      name: "Chi",
      rows: [
        ["Ngày chi", "Danh mục", "Số tiền (VND)", "Nội dung"],
        ...expenses.map((expense) => [
          formatDateVN(expense.expense_date),
          expenseCategoryLabels[expense.category] || expense.category,
          Number(expense.amount) || 0,
          expense.description || "",
        ]),
      ],
    },
  ];

  return new Response(workbookXml(sheets), {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="bao-cao-thu-chi-${from}-den-${to}.xls"`,
      "Cache-Control": "no-store",
    },
  });
}