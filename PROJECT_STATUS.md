# Hiện trạng project

Cập nhật: 2026-11-04

## Tóm tắt

Ứng dụng nội bộ quản lý lượt thua và quỹ nhóm cầu lông. UI hiện tại là dashboard một trang tại `/`. Stack: Next.js `16.2.9`, React `19.2.4`, TypeScript, Supabase. Supabase chỉ truy cập qua server với `service_role`.

## Đã có

- Dashboard xem lượt thua, trạng thái thu/đút lợn, tổng quỹ và biểu đồ thu–chi theo tháng.
- Ghi lượt thua theo ngày; sửa lượt; chốt lượt trong ngày.
- Nhấn giữ để xác nhận đút lợn hoặc hoàn tác lượt đã chốt.
- Thêm khoản chi. Trường tiền dùng text + bàn phím số, chấp nhận số nguyên VND mà không vướng bước `type=number`.
- API đọc dữ liệu dashboard và cache cục bộ bằng `localStorage`.
- Tổng tháng lưu ở `dashboard_monthly_totals`; migration SQL định nghĩa bảng, trigger đồng bộ và backfill.
- PIN quản trị dùng cookie HMAC-SHA256, `httpOnly`, thời hạn 12 giờ. Server Actions còn xác thực bằng `assertDashboardAccess()` trước mutation.

## Trạng thái PIN

- Dashboard xem được không cần PIN. Ghi/giảm lượt thua cũng không cần PIN ở cả UI và server (`changeLossAction`).
- Các thao tác quản trị còn lại (chốt lượt thua, xác nhận đút lợn, kết thúc Sửa, thêm khoản chi, hoàn tác lượt) yêu cầu PIN và được kiểm tra lại ở server bằng `assertDashboardAccess()` / `hasDashboardAccess()`.
- Đã rà soát và sửa luồng PIN theo thao tác: sau khi nhập PIN hợp lệ, thao tác gốc tự chạy tiếp.
- `loginDashboardAction` và `addExpenseAction` trả `{ ok, error }` thay vì throw, vì Next production ẩn message lỗi throw từ Server Action.
- Form thêm khoản chi dùng `onSubmit`: không mất dữ liệu nhập khi PIN sai/lỗi; hủy hộp PIN không làm kẹt trạng thái "Đang lưu…".
- Khi thao tác lỗi, client gọi `checkDashboardAccessAction` để hỏi PIN lại nếu cookie đã hết hạn.
- Chưa test thủ công trên trình duyệt với DB thật. Không xem `authorized` hoặc state client là ranh giới bảo mật.

## DB và dữ liệu

- Bảng chính: `members`, `daily_member_losses`, `pig_ledger`, `fund_contributions`, `dashboard_expenses`, `dashboard_monthly_totals`.
- SQL migration tháng: `supabase-dashboard-monthly-totals.sql`. Người dùng xác nhận đã chạy SQL này trên Supabase.
- Đút lợn thanh toán toàn bộ ngày còn nợ qua RPC `dashboard_close_pig_all` (`supabase-dashboard-close-pig-all.sql`); cần chạy migration này trên Supabase trước khi dùng bản mới.
- Bản sửa biểu đồ đọc số liệu từ bảng nguồn thay vì phụ thuộc hoàn toàn vào cache tổng tháng.
- `TODO.md`: tất cả task PIN đã tick hoàn thành.

## Điểm vào và file quan trọng

- `app/page.tsx`: Server Component tải dữ liệu và dựng dashboard.
- `app/Dashboard.tsx`: tương tác, state optimistic, hàng đợi ghi lượt, prompt PIN và biểu đồ.
- `app/actions.ts`: Server Actions có xác thực server-side.
- `lib/dashboardAuth.ts`: kiểm tra và cấp quyền PIN.
- `app/api/dashboard-*/route.ts`: API đọc dữ liệu cho client.
- `supabase-dashboard.sql`, `supabase-dashboard-monthly-totals.sql`: schema, RPC và trigger.
- `PROJECT_CONTEXT.md`: tài liệu kiến trúc/nghiệp vụ chi tiết.
- `TODO.md`: danh sách task PIN (đã hoàn thành).

## Repo và kiểm tra

- Nhánh làm việc: `main`.
- Commit gần nhất ghi task: `3095369 docs: track unfinished dashboard PIN tasks`.
- Thay đổi PIN gần nhất: `20953c3 feat: require PIN per dashboard action`.
- Lần kiểm tra gần nhất sau thay đổi PIN: `yarn lint`, `tsc --noEmit`, `yarn build` đều đạt.
- Next.js repo có breaking changes: đọc guide tương ứng trong `node_modules/next/dist/docs/` trước khi sửa code Next.js, theo `AGENTS.md`.
