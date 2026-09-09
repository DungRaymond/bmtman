# BMT Badminton — Project Context

Tài liệu bối cảnh nhanh cho AI agent khi tiếp tục phát triển dự án.

## Tổng quan

Ứng dụng nội bộ quản lý ghi độ cầu lông và quỹ nhóm. Người dùng ghi lượt độ theo ngày, quản lý các khoản thu/chi, theo dõi công nợ và xuất báo cáo tài chính theo khoảng tháng.

## Stack và quy ước kỹ thuật

- Next.js 16.2.9 App Router, React 19, TypeScript strict.
- Supabase dùng service-role client phía server.
- UI dùng CSS thuần trong `app/globals.css`.
- Server Components là mặc định; phần tương tác dùng Client Components và Server Actions.
- Không có test runner; kiểm tra bằng `npm run lint` và `npm run build`.
- Trước khi sửa Next.js, đọc guide tương ứng trong `node_modules/next/dist/docs/` theo `AGENTS.md`.
- Không đưa Supabase service-role key xuống Client Component.
- Mutation quản trị phải gọi `assertAdmin()`; sau mutation phải `revalidatePath()` các route liên quan.

## Các route

- `/`: ghi lượt độ theo ngày, sửa/xóa lượt chưa chốt và chốt sổ ngày.
- `/thu`: quản lý khoản phải thu, thanh toán thành viên, khách vãng lai, thành viên cố định cũ và khoản thủ công.
- `/thu/so-thu`: sổ thu chi tiết, CRUD charges/payments/walk-in.
- `/chi`: quản lý khoản chi.
- `/tong-hop`: tổng hợp quỹ, thu–chi và công nợ theo khoảng tháng; xuất bảng tính.
- `/tong-hop/export`: route xuất báo cáo Excel/CSV theo tháng bắt đầu và tháng kết thúc.
- `/tong-hop/memfee-cards`: thẻ tổng hợp khoản phải thu theo thành viên.
- `/tong-hop/tien-do`: thống kê tiền độ theo người/tháng.

Route `/tong-hop` không còn giao diện kế hoạch thu. Các báo cáo xuất khoản vãng lai được gom theo ngày để dễ đối soát.

## Quy tắc ghi độ

- Mỗi lượt ghi người thua độ, người nhận tiền độ nếu cần và số tiền.
- Người thua là nguồn xác định nghĩa vụ tiền độ; người nhận chỉ là thông tin đối ứng khi có.
- Dữ liệu cũ theo mô hình hai bên vẫn được đọc tương thích khi hiển thị và tính toán.
- Lượt đã chốt không được sửa/xóa.
- Tiền lưu dạng số nguyên VND.

## Quy tắc tài chính

- Thành viên `fixed` có quỹ cố định tháng; tiền độ được cộng dồn từ `session_stake_points`.
- Thành viên `former_fixed` có phí giao lưu và tiền độ theo từng buổi.
- Tiền độ/phí giao lưu chưa thu có thể tồn từ tháng trước và được cộng vào khoản cần thu hiện tại.
- Các khoản thu và chi được tổng hợp theo tháng; báo cáo có thể lọc từ tháng X đến tháng Y.

## Data model chính

- `daily_scorecards`: payload JSON chứa lượt độ theo ngày, có `settled_at`.
- `sessions`: buổi chơi.
- `session_stake_points`: tiền độ từng thành viên trong buổi.
- `charges`: khoản phải thu thành viên.
- `payments`: các lần đã thu.
- `session_walkins`: khoản phải thu khách vãng lai.
- `member_fee_summaries`: snapshot khoản cần thu theo thành viên/tháng.
- `monthly_fund_snapshot`: số dư đầu/cuối tháng.
- `fee_rules`: cấu hình phí theo trạng thái thành viên.

## File quan trọng

- `app/actions.ts`: Server Actions.
- `app/page.tsx`: trang ghi độ.
- `app/ScoreEntryCard.tsx`: UI ghi/sửa lượt độ.
- `app/tong-hop/page.tsx`: tổng hợp quỹ và bộ lọc báo cáo.
- `app/tong-hop/export/route.ts`: xuất báo cáo bảng tính.
- `app/tong-hop/memfee-cards/page.tsx`: thẻ khoản phải thu thành viên.
- `app/tong-hop/tien-do/page.tsx`: thống kê tiền độ.
- `lib/finance.ts`: types, truy vấn Supabase và tính toán tài chính.
- `lib/security.ts`, `lib/thuAuth.ts`: xác thực quản trị.
- `app/globals.css`: CSS toàn bộ ứng dụng.
- Các migration Supabase nằm ở thư mục gốc, tên dạng `supabase-*.sql`.

## Lưu ý khi tiếp tục phát triển

- Giữ nguyên thay đổi chưa commit của người dùng trong worktree.
- Dùng `apply_patch` để sửa file.
- Không dùng `git reset --hard` hoặc `git checkout --` để xóa thay đổi.
- Sau mỗi thay đổi chạy `npm run lint` và `npm run build`.
- Không commit/push nếu người dùng chưa yêu cầu.
- Nội dung giao diện dùng tiếng Việt UTF-8, tránh mojibake.
