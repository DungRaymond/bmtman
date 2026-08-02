# BMT Badminton — Project Context

Tài liệu này dùng để cung cấp bối cảnh nhanh cho AI agent khi lập plan hoặc tiếp tục phát triển project.

## Tổng quan

Đây là ứng dụng nội bộ quản lý ghi độ cầu lông và quỹ nhóm.

## Stack và quy ước kỹ thuật

- Next.js 16.2.9 App Router, React 19, TypeScript strict.
- Supabase dùng service-role client phía server.
- UI dùng CSS thuần trong `app/globals.css`.
- Server Components là mặc định; phần tương tác dùng Client Components và Server Actions.
- Không có test runner; kiểm tra bằng `npm run lint` và `npm run build`.
- Trước khi sửa Next.js, đọc guide tương ứng trong `node_modules/next/dist/docs/` theo `AGENTS.md`.

## Các route

- `/`: ghi lượt độ theo ngày, tối đa 12 lượt; chọn người chơi, số tiền, bên thắng; xem lịch sử; sửa/xóa lượt chưa chốt; chốt sổ ngày.
- `/thu`: quản lý khoản phải thu, thanh toán thành viên, khách vãng lai, thành viên cố định cũ và khoản thủ công. Production yêu cầu PIN quản trị.
- `/thu/so-thu`: sổ thu chi tiết, CRUD charges/payments/walk-in.
- `/chi`: quản lý khoản chi.
- `/tong-hop`: tổng hợp quỹ tháng, tồn đầu/cuối, thu thành viên, thu vãng lai, chi phí; tạo phí quỹ cố định; chọn các khoản cần thu theo từng thành viên; chốt số dư tháng.
- `/tong-hop/memfee-cards`: thẻ tổng hợp các khoản phải thu theo thành viên.
- `/tong-hop/tien-do`: thống kê tiền độ theo người/tháng.

## Data model chính

- `daily_scorecards`: payload JSON chứa lượt độ theo ngày, có `settled_at`.
- `sessions`: buổi chơi.
- `session_stake_points`: tiền độ từng thành viên trong buổi.
- `charges`: khoản phải thu thành viên.
- `payments`: các lần đã thu.
- `session_walkins`: khoản phải thu khách vãng lai.
- `member_fee_summaries`: snapshot khoản cần thu theo thành viên/tháng.
- `monthly_fund_snapshot`: số dư đầu/cuối tháng.
- `fee_rules`: cấu hình phí theo trạng thái thành viên và thời gian.
- Thành viên có trạng thái `fixed` hoặc `former_fixed`.

## Quy tắc nghiệp vụ

- Thành viên `fixed` có quỹ cố định tháng; tiền độ được cộng dồn từ `session_stake_points`.
- Thành viên `former_fixed` có phí giao lưu và tiền độ theo từng buổi.
- Tiền độ/phí giao lưu chưa thu có thể tồn từ tháng trước và được cộng vào khoản cần thu tháng hiện tại.
- Ngày đã chốt thì không được sửa/xóa lượt độ.
- Tiền lưu dạng số nguyên VND.
- Không đưa Supabase service-role key xuống Client Component.
- Mutation quản trị phải gọi `assertAdmin()`.
- Sau mutation phải `revalidatePath` các route liên quan.

## Tính năng đã làm gần đây

- Sửa/xóa lượt độ chưa chốt ở trang `/`.
- `/tong-hop` có phần chọn khoản thu theo từng thành viên:
  - Tiền quỹ.
  - Tiền độ.
  - Phí giao lưu.
  - Khoản khác.
- Có thể bỏ chọn hoặc chỉnh số tiền trước khi chốt.
- Đã bổ sung tính tiền độ/phí giao lưu còn thiếu từ các tháng trước.
- Đã bỏ phần liệt kê “Công nợ cao nhất” khỏi `/tong-hop`.
- Lựa chọn tháng được lưu vào `member_fee_summaries`.
- Chức năng chọn khoản thu hiện lưu kế hoạch/snapshot; chưa tự động ghi `payment` khi bấm chốt.

## File quan trọng

- `app/actions.ts`: Server Actions.
- `app/tong-hop/page.tsx`: trang tổng hợp và chọn khoản thu tháng.
- `app/tong-hop/memfee-cards/page.tsx`: thẻ phí thành viên.
- `app/ScoreEntryCard.tsx`: UI ghi/sửa lượt độ.
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
