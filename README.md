# BMT Badminton Dashboard

Dashboard nội bộ cho nhóm cầu lông: theo dõi thu–chi quỹ nuôi lợn, ghi lượt thua theo thành viên, chốt số lượt và xác nhận thu tiền.

## Chức năng chính

- Tap ô thành viên để cộng lượt thua; chế độ "Sửa" trừ lượt chưa chốt.
- Chốt số lượt theo ngày; nhấn giữ ô để xác nhận thu `10.000đ × lượt` vào quỹ nuôi lợn. Nhấn giữ trong chế độ "Sửa" để hoàn tác lượt đã chốt khi chưa thu.
- Badge trên ô hiển thị lượt chưa thu, lượt chưa đút và tổng tiền đã đút.
- Nhập khoản chi và xem biểu đồ thu/chi theo từng tháng hoặc tổng cộng đến tháng.

## Công nghệ

- Next.js 16 App Router, React 19, TypeScript strict.
- Supabase với service-role client chỉ chạy phía server.
- Server Components, Client Components và Server Actions.
- CSS tự viết trong `app/globals.css` (Tailwind chỉ được import làm reset).

## Chạy local

```bash
yarn install
# Tạo .env.local với SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY và THU_ACCESS_PIN
# Chạy supabase-dashboard.sql và supabase-dashboard-monthly-totals.sql trong Supabase SQL Editor trước khi mở dashboard
yarn dev
```

Mở http://localhost:3000.

## Route

- `/`: dashboard.
- `/api/dashboard-losses`, `/api/dashboard-unpaid-losses`, `/api/dashboard-pig-totals`, `/api/dashboard-totals`: JSON read-only cho client đồng bộ số liệu.

## Supabase và deploy

Schema dashboard nằm trong `supabase-dashboard.sql` (bảng, RPC và phân quyền). Chạy thêm `supabase-dashboard-monthly-totals.sql` để tạo cache tổng thu/chi theo tháng; các trigger trong file này tự cập nhật cache khi thêm khoản thu hoặc chi.

Khi deploy Vercel, cấu hình các biến môi trường:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `THU_ACCESS_PIN`

Kiểm tra trước khi deploy:

```bash
yarn lint
yarn build
```

Tài liệu cho AI agent: `brain.md` (tóm tắt nhanh) và `PROJECT_CONTEXT.md` (bối cảnh, data model, file liên quan).
