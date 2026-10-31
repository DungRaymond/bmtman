# BMT Badminton Dashboard

Dashboard nội bộ cho nhóm cầu lông: theo dõi thu–chi quỹ nuôi lợn, ghi lượt thua theo thành viên, chốt số lượt và xác nhận thu tiền.

## Chức năng chính

- Tap ô thành viên để cộng lượt thua; chế độ sửa trừ lượt chưa chốt.
- Chốt số lượt theo ngày; nhấn giữ ô để xác nhận thu `10.000đ × lượt` vào quỹ nuôi lợn.
- Nhập khoản chi và xem biểu đồ thu/chi theo ngày trong tháng.

## Công nghệ

- Next.js 16 App Router, React 19, TypeScript strict.
- Supabase với service-role client chỉ chạy phía server.
- Server Components, Client Components và Server Actions.
- CSS thuần trong `app/globals.css`.

## Chạy local

```bash
npm install
# Tạo .env.local với SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY và THU_ACCESS_PIN
# Chạy supabase-dashboard.sql trong Supabase SQL Editor trước khi mở dashboard
npm run dev
```

Mở http://localhost:3000.

## Route

- `/`: dashboard.

## Supabase và deploy

Schema dashboard nằm trong `supabase-dashboard.sql`.

Khi deploy Vercel, cấu hình các biến môi trường:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `THU_ACCESS_PIN`

Kiểm tra trước khi deploy:

```bash
npm run lint
npm run build
```
