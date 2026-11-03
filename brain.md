# BMT Badminton — Brain

## Mục tiêu

Ứng dụng nội bộ một trang để ghi lượt thua cầu lông theo ngày, chốt lượt, đút quỹ nuôi lợn (`10.000đ/lượt`) và theo dõi thu–chi theo tháng. Bộ trang `thu`/`chi`/`tong-hop` cũ đã gỡ khỏi UI từ 2026-10-31.

## Stack

- Next.js `16.2.9` App Router, React `19.2.4`, TypeScript strict.
- Supabase JS; service-role client chỉ chạy phía server (`lib/supabaseServer.ts`).
- Style trong `app/globals.css`; `@import "tailwindcss"` chỉ để reset, JSX dùng class CSS tự viết. Server Components là mặc định.
- Package manager: Yarn (`yarn.lock`). Lệnh: `yarn dev`, `yarn lint`, `yarn build`.
- Đây là Next.js có breaking changes. Trước khi sửa code Next.js, đọc guide tương ứng trong `node_modules/next/dist/docs/` theo `AGENTS.md`.

## Route

- `/` — dashboard: ghi/chốt lượt thua, biểu đồ thu–chi, thêm khoản chi, overlay PIN. Query `?month=YYYY-MM`, `?view=total|monthly`.
- `/api/dashboard-losses?date=YYYY-MM-DD` — lượt theo ngày.
- `/api/dashboard-unpaid-losses` — lượt còn treo (chưa thu) cộng dồn mọi ngày.
- `/api/dashboard-pig-totals` — tổng tiền đã đút theo thành viên.
- `/api/dashboard-totals?month=YYYY-MM` — `total` (cộng dồn đến tháng) và `monthly`.

Không còn route `/thu`, `/thu/so-thu`, `/chi`, `/tong-hop`, `/tong-hop/memfee-cards`, `/tong-hop/tien-do`, `/tong-hop/export`.

## Nghiệp vụ và dữ liệu

- Mỗi ô thành viên là một form `(date, member_id, delta)`; chạm = `+1`, chạm trong mode "Sửa" = `−1` (chặn nếu xuống dưới `locked_count`).
- Ngày `YYYY-MM-DD` theo `Asia/Ho_Chi_Minh`, tháng `YYYY-MM`; tiền lưu số nguyên VND.
- Nút "Chốt lượt thua hôm nay" → `dashboard_lock_losses`.
- Nhấn giữ ô ở chế độ thường → dialog xác nhận → `dashboard_close_pig` (ghi `pig_ledger`, xóa dòng lượt thua).
- Nhấn giữ ô ở mode "Sửa" → `dashboard_delete_locked_loss` (hoàn tác, không thu tiền, chỉ khi `paid_count = 0`).
- `dashboard_record_pig_payment` (thu phần đã chốt chưa thu) vẫn còn trong SQL và `app/actions.ts` nhưng UI hiện không gọi.
- Đơn giá `10.000đ/lượt` hardcode ở check SQL `amount = loss_count * 10000` và trong `Dashboard.tsx`; đổi giá phải sửa cả hai nơi.
- Bảng đang dùng: `members`, `daily_member_losses`, `pig_ledger`, `dashboard_expenses`, `fund_contributions`, `dashboard_monthly_totals`.
- `dashboard_monthly_totals` là cache do trigger trên `fund_contributions`/`pig_ledger`/`dashboard_expenses` cập nhật qua `refresh_dashboard_month_totals(p_month)`; sửa bảng nguồn là đủ, không tự ghi cache.
- Client optimistic + `localStorage` (`dashboard-losses:<date>`, `dashboard-unpaid-losses`, `dashboard-pig-totals`, `dashboard-monthly-totals`), debounce flush lượt 2700ms; thao tác chốt/hoàn tác/đút flush queue trước khi gọi RPC.
- Schema trong `supabase-dashboard.sql` và `supabase-dashboard-monthly-totals.sql`. Migration mới cần idempotent, bật RLS, `revoke` khỏi `anon`/`authenticated` và chỉ `grant` cho `service_role`.
- Dùng thuật ngữ `stake`/“độ”, `loss`/“lượt thua”, `pig`/“quỹ nuôi lợn”; không đưa lại tên legacy `do_points`, `do_fee`, `monthly_do_fee`, `session_do_fee`.

## Code kế thừa

- `lib/finance.ts`: chỉ `getMembers()` còn được dùng; phần còn lại thuộc bộ trang cũ, chưa có caller.
- `lib/walkinReceivables.ts`: không còn import ở đâu.
- Bảng legacy (`daily_scorecards`, `sessions`, `session_stake_points`, `charges`, `payments`, `session_walkins`, `walkin_people`, `member_fee_summaries`, `monthly_fund_snapshot`, `fee_rules`) vẫn còn dữ liệu lịch sử trong Supabase, dashboard không đọc.
- `badminton finance schema.md` và `TASKS_FIX_HIGH_RISKS.md` là tài liệu mô hình cũ, chỉ để tham khảo.
- Query legacy trong `lib/finance.ts` giả định relation Supabase có thể là object hoặc array; giữ chuẩn hóa cả hai dạng nếu đụng tới phần đó.
- Muốn xóa bất kỳ mục trên: `grep` xác nhận không còn caller và hỏi ý người dùng trước.

## Bảo mật và sửa code

- Env server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `THU_ACCESS_PIN`. Không tạo `NEXT_PUBLIC_*` cho secret.
- PIN quản lý: cookie `bmt_dashboard_access` = `<timestamp>.<HMAC-SHA256(THU_ACCESS_PIN, timestamp)>`, hiệu lực 12 giờ, `httpOnly` + `sameSite: strict`, so sánh bằng `timingSafeEqual`.
- Ngoài `loginDashboardAction`, mọi Server Action đổi dữ liệu phải `await assertDashboardAccess()` rồi `revalidatePath("/")`.
- Không đưa service-role key hoặc mutation nghiệp vụ xuống Client Component; client chỉ gọi `/api/dashboard-*` (read-only).
- Validate ở server: ngày `\d{4}-\d{2}-\d{2}`, tháng `\d{4}-(0[1-9]|1[0-2])`, `delta` chỉ nhận `±1`, `amount` là số nguyên dương, `description` 1–160 ký tự.
- Thay đổi schema cần file SQL patch đi kèm.
- UI và tài liệu tiếng Việt UTF-8.
- Không tự ý nới lỏng bảo mật của action ghi độ.

## File chính

- `app/page.tsx` — Server Component, gộp query ngày/tháng/heo rồi truyền props.
- `app/Dashboard.tsx` — Client Component, mọi tương tác và đồng bộ optimistic.
- `app/actions.ts` — Server Actions (login, change/lock/delete/close loss, record pig payment, add expense).
- `app/api/dashboard-*/route.ts` — JSON read-only cho client.
- `lib/dashboardAuth.ts` — PIN/cookie auth.
- `lib/supabaseServer.ts` — admin client.
- `lib/finance.ts` — `getMembers()` cộng với phần code kế thừa.
- `app/globals.css` — style dùng chung.

## Kiểm tra

```bash
yarn lint
yarn build
```

Chưa có test runner. Giữ thay đổi của người dùng; không reset/checkout để xóa thay đổi. Không commit/push nếu chưa được yêu cầu.
