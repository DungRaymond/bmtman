# BMT Badminton

Ứng dụng nội bộ quản lý ghi độ cầu lông và tài chính nhóm: ghi lượt độ theo ngày, theo dõi thu–chi, công nợ thành viên/khách vãng lai, tổng hợp theo khoảng tháng và xuất báo cáo Excel.

## Chức năng chính

- Ghi lượt độ với người thua độ, người nhận tiền độ (nếu có) và số tiền.
- Sửa/xóa lượt độ chưa chốt; chốt sổ theo ngày.
- Quản lý khoản thu, khoản chi, thanh toán thành viên và khách vãng lai.
- Tổng hợp quỹ theo tháng, số dư đầu/cuối kỳ và các khoản còn phải thu.
- Xuất toàn bộ thu–chi từ tháng X đến tháng Y dạng bảng tính; khoản vãng lai được gom theo ngày.
- Thống kê tiền độ theo người và theo tháng.

## Công nghệ

- Next.js 16 App Router, React 19, TypeScript strict.
- Supabase với service-role client chỉ chạy phía server.
- Server Components, Client Components và Server Actions.
- CSS thuần trong `app/globals.css`.

## Chạy local

```bash
npm install
cp .env.local.example .env.local
# điền SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY và THU_ACCESS_PIN
npm run dev
```

Mở http://localhost:3000.

## Các route

- `/`: ghi độ và chốt sổ ngày.
- `/thu`: quản lý thu.
- `/thu/so-thu`: sổ thu chi tiết.
- `/chi`: quản lý chi.
- `/tong-hop`: tổng hợp quỹ và xuất báo cáo theo khoảng tháng.
- `/tong-hop/export`: endpoint xuất bảng tính.
- `/tong-hop/memfee-cards`: thẻ khoản phải thu theo thành viên.
- `/tong-hop/tien-do`: thống kê tiền độ.

## Supabase và deploy

Schema/migration nằm trong các file `supabase-*.sql` và `badminton finance schema.md`.

Khi deploy Vercel, cấu hình các biến môi trường:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `THU_ACCESS_PIN`

Kiểm tra trước khi deploy:

```bash
npm run lint
npm run build
```
