# BMT Badminton — Project Context

Tài liệu bối cảnh nhanh cho AI agent khi tiếp tục phát triển dự án.

## Tổng quan

Ứng dụng nội bộ cho nhóm cầu lông, hiện chỉ còn **một trang dashboard** (`/`). Người dùng chạm ô thành viên để ghi lượt thua trong ngày, chốt lượt, nhấn giữ ô để đút số tiền tương ứng vào quỹ nuôi lợn, nhập khoản chi và xem biểu đồ thu–chi theo tháng.

Các trang `thu`, `chi`, `tổng hợp`, `sổ thu` đã bị gỡ khỏi giao diện từ bản 2026-10-31. Code và bảng dữ liệu cũ vẫn còn trong repo/Supabase nhưng UI hiện tại không dùng (xem mục "Code kế thừa").

## Stack và quy ước kỹ thuật

- Next.js `16.2.9` App Router, React `19.2.4`, TypeScript strict.
- Supabase JS; chỉ dùng service-role client phía server (`lib/supabaseServer.ts`). Không có client-side Supabase.
- Package manager: **Yarn** (`yarn.lock`). Lệnh `yarn dev`, `yarn lint`, `yarn build` (`npm run ...` cũng chạy được).
- Style: `app/globals.css` (`@import "tailwindcss"` chỉ để reset; toàn bộ class trong JSX là CSS tự viết, không dùng utility class Tailwind).
- `app/page.tsx` là Server Component (`force-dynamic`); toàn bộ tương tác nằm trong Client Component `app/Dashboard.tsx` và gọi Server Actions.
- Không có test runner; kiểm tra bằng `yarn lint` và `yarn build`.
- Đây là Next.js có breaking changes. Trước khi sửa code Next.js, đọc guide tương ứng trong `node_modules/next/dist/docs/` theo `AGENTS.md`.
- Mutation phải gọi `assertDashboardAccess()` (trong `lib/dashboardAuth.ts`) trước khi đổi dữ liệu; sau mutation gọi `revalidatePath("/")`.
- UI và tài liệu tiếng Việt UTF-8, tránh mojibake.

## Route và entry point

| Đường dẫn | Loại | Vai trò |
| --- | --- | --- |
| `/` | Server Component → `Dashboard` | Ghi/chốt lượt thua, biểu đồ thu–chi, thêm khoản chi, PIN. Query `?month=YYYY-MM`, `?view=total\|monthly`. |
| `/api/dashboard-losses?date=YYYY-MM-DD` | GET JSON | `loss_count`, `locked_count`, `paid_count` theo thành viên của một ngày. |
| `/api/dashboard-unpaid-losses` | GET JSON | Gom toàn bộ `daily_member_losses`, trừ phần đã thu → số lượt còn treo của mỗi thành viên. |
| `/api/dashboard-pig-totals` | GET JSON | Tổng tiền đã đút theo thành viên từ `pig_ledger`. |
| `/api/dashboard-totals?month=YYYY-MM` | GET JSON | `total` (cộng dồn đến tháng) và `monthly` (riêng tháng) từ `dashboard_monthly_totals`. |

Bốn API route đều `Cache-Control: no-store`, trả 503 nếu thiếu env, và chỉ dùng Supabase phía server.

## Luồng nghiệp vụ

- Mỗi lượt thua = `+1 loss_count` cho `(loss_date, member_id)`. Ngày lấy theo `Asia/Ho_Chi_Minh`, format `YYYY-MM-DD`; tháng `YYYY-MM`.
- **Chạm ô** = +1 lượt. Ở chế độ **"Sửa"**, chạm = −1 lượt và bị chặn nếu sẽ xuống dưới `locked_count`.
- **Chốt lượt thua hôm nay** = `locked_count = loss_count` cho cả ngày (`dashboard_lock_losses`).
- **Nhấn giữ ô (~1,1s, cổng 300ms) ở chế độ thường** = xác nhận đút lợn: ghi `loss_count × 10.000đ` vào `pig_ledger` và xóa dòng lượt thua (`dashboard_close_pig`); chặn nếu `paid_count > 0`.
- **Nhấn giữ ô ở chế độ "Sửa"** = hoàn tác lượt đã chốt (`dashboard_delete_locked_loss`), không thu tiền; chỉ dùng khi chưa ghi nhận đã thu.
- Tiền lưu số nguyên VND. Đơn giá đút lợn hiện hardcode `10.000đ/lượt` (check `amount = loss_count * 10000` trong SQL và nhân 10000 trong `Dashboard.tsx`) — đổi đơn giá phải sửa cả hai nơi.

### Badge trên ô thành viên

- Góc phải trên (xanh dương): tổng lượt thua **chưa thu**, cộng dồn mọi ngày (`/api/dashboard-unpaid-losses`).
- Góc trái trên: `Đã thu x/y` khi `paid_count > 0`.
- Góc trái dưới (tím): `chưa đút` = `locked_count − paid_count` của dữ liệu treo.
- Góc phải dưới (vàng): `đã đút` = tổng tiền trong `pig_ledger`, dạng gọn (`70k`, `1,2tr`).

### Cache phía trình duyệt

`Dashboard.tsx` hiển thị optimistic và ghi `localStorage` để mở trang có số ngay, rồi fetch API đồng bộ lại:

- `dashboard-losses:<YYYY-MM-DD>`
- `dashboard-unpaid-losses`
- `dashboard-pig-totals`
- `dashboard-monthly-totals` (object theo tháng)

Thay đổi lượt được xếp hàng trong `lossQueue`, gộp và flush sau **2700ms** không thao tác; các thao tác chốt/hoàn tác/đút lợn flush trước khi gọi RPC. Trạng thái đồng bộ hiển thị bằng overlay "heo" (`.sync-overlay`).

## Data model hiện đang dùng

- `members` — `member_id`, `name`; danh sách thành viên là dữ liệu DB, không hardcode trong code.
- `daily_member_losses(loss_date, member_id, loss_count, locked_count, paid_count)` — PK `(loss_date, member_id)`, check `paid_count <= locked_count <= loss_count`.
- `pig_ledger(id, paid_date, member_id, loss_count, amount, created_at)` — mỗi lần đút lợn một dòng; `amount = loss_count * 10000`.
- `dashboard_expenses(id, expense_date, amount, description, created_at)` — khoản chi, `description` 1–160 ký tự.
- `fund_contributions(id, paid_date, amount, description, member_id, period_month, contribution_type)` — khoản đóng quỹ, `contribution_type ∈ {member_fund, pig}` (quỹ thành viên / nạp trực tiếp vào quỹ nuôi lợn).
- `dashboard_monthly_totals(month, member_fund, pig, expense)` — cache tổng theo tháng, `month` là ngày 1; do trigger trên `fund_contributions`, `pig_ledger`, `dashboard_expenses` cập nhật qua `refresh_dashboard_month_totals(p_month)`.

Tất cả bảng dashboard đều bật RLS và `revoke` khỏi `anon`/`authenticated`, chỉ `service_role` có quyền.

## RPC (Postgres, `security definer`, `set search_path = public`)

- `dashboard_change_loss(p_date, p_member_id, p_delta)` — `p_delta` chỉ nhận `±1`, chặn giảm dưới `locked_count`, trả `loss_count` mới.
- `dashboard_lock_losses(p_date)` — chốt cả ngày.
- `dashboard_delete_locked_loss(p_date, p_member_id)` — hoàn tác lượt đã chốt, báo lỗi nếu đã thu.
- `dashboard_close_pig(p_date, p_member_id)` — đút lợn toàn bộ `loss_count`, trả số tiền.
- `dashboard_record_pig_payment(p_date, p_member_id)` — thu phần `locked_count − paid_count`; **hiện UI chưa gọi tới**, giữ như bước trung gian của luồng thu tiền cũ.

## File quan trọng

- `app/page.tsx` — đọc searchParams, query 3 nguồn, dựng props cho `Dashboard`.
- `app/Dashboard.tsx` — toàn bộ tương tác: optimistic state, queue đồng bộ, long-press, dialog xác nhận, biểu đồ.
- `app/actions.ts` — Server Actions (`loginDashboardAction`, `changeLossAction`, `lockLossesAction`, `deleteLockedLossAction`, `closePigAction`, `recordPigPaymentAction`, `addExpenseAction`).
- `app/api/dashboard-*/route.ts` — 4 route JSON cho client re-fetch.
- `app/globals.css` — style toàn bộ ứng dụng.
- `lib/dashboardAuth.ts` — PIN + cookie `bmt_dashboard_access` (HMAC-SHA256 theo `THU_ACCESS_PIN`, hiệu lực 12 giờ, `httpOnly`/`sameSite: strict`).
- `lib/supabaseServer.ts` — admin client singleton.
- `supabase-dashboard.sql` — schema + RPC nền cho dashboard.
- `supabase-dashboard-monthly-totals.sql` — bảng cache tháng, index, trigger, backfill.
- `supabase-fund-contribution-types.sql` — cột `contribution_type` cho `fund_contributions` (đã được gộp nội dung vào `supabase-dashboard.sql`).

## Code kế thừa (không còn UI dùng tới)

- `lib/finance.ts` — 1300+ dòng types/query/tính toán cho bộ trang `thu`/`chi`/`tong-hop` cũ. **Chỉ còn `getMembers()` được `app/page.tsx` dùng**; phần còn lại chưa có caller.
- `lib/walkinReceivables.ts` — không còn import ở bất kỳ đâu.
- Các bảng legacy trong Supabase (`daily_scorecards`, `sessions`, `session_stake_points`, `charges`, `payments`, `session_walkins`, `walkin_people`, `member_fee_summaries`, `monthly_fund_snapshot`, `fee_rules`) vẫn giữ dữ liệu lịch sử nhưng dashboard hiện tại không đọc.
- `badminton finance schema.md` và `TASKS_FIX_HIGH_RISKS.md` là tài liệu của mô hình cũ, chỉ còn giá trị tham khảo lịch sử.

Trước khi xóa các file/bảng trên, cần `grep` xác nhận không còn caller và thống kê nhu cầu đối soát dữ liệu cũ.

## Biến môi trường

Code chỉ đọc 3 biến phía server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `THU_ACCESS_PIN`. Không tạo `NEXT_PUBLIC_*` cho secret. `.env.local` có thêm `NEXT_PUBLIC_SUPABASE_ANON_KEY` và `APP_ADMIN_PIN` — hiện code không dùng tới.

## Lưu ý khi tiếp tục phát triển

- Giữ nguyên thay đổi chưa commit của người dùng trong worktree.
- Không dùng `git reset --hard` hoặc `git checkout --` để xóa thay đổi.
- Sửa file bằng từng thay đổi nhỏ, không rewrite cả file khi chỉ cần đổi vài dòng.
- Sau mỗi thay đổi chạy `yarn lint` và `yarn build`.
- Không commit/push nếu người dùng chưa yêu cầu.
- Đổi schema phải kèm file `supabase-*.sql` idempotent (RLS + revoke/grant như các migration hiện tại).
