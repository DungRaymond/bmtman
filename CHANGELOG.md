# Nhật ký thay đổi

## 2026-11-02 — Đồng bộ tài liệu với dashboard hiện tại

- `PROJECT_CONTEXT.md` và `brain.md`: bỏ mô tả các route `/thu`, `/thu/so-thu`, `/chi`, `/tong-hop/*` và file `lib/security.ts`, `lib/thuAuth.ts`, `app/thu/*` đã bị xóa; thay bằng cấu trúc thực tế (một trang `/` + 4 API route `dashboard-*`).
- Bổ sung tài liệu nghiệp vụ hiện tại: bảng `daily_member_losses`/`pig_ledger`/`dashboard_expenses`/`fund_contributions`/`dashboard_monthly_totals`, các RPC `dashboard_*`, quy tắc nút và nhấn giữ, badge trên ô thành viên, cache `localStorage` và debounce 2700ms, cách auth PIN qua `lib/dashboardAuth.ts`.
- Ghi rõ phần code kế thừa không còn UI dùng: `lib/finance.ts` (chỉ còn `getMembers()`), `lib/walkinReceivables.ts`, các bảng legacy và `badminton finance schema.md`, `TASKS_FIX_HIGH_RISKS.md`.
- `README.md`: đổi lệnh sang Yarn, sửa mô tả biểu đồ (theo tháng/tổng đến tháng, không phải theo ngày), thêm danh sách API route và note chạy cả hai file SQL khi cài đặt.
- Chỉ thay đổi tài liệu; không sửa code, `yarn lint` và `yarn build` vẫn chạy để xác nhận.

## 2026-11-01 — Badge "đã chốt" và "đã đút" trong ô thành viên

- Chuyển badge "đã chốt" xuống góc trái dưới, thêm chú thích "đã chốt" bên cạnh số.
- Thêm badge "đã đút" ở góc phải dưới: cộng dồn tổng tiền mỗi lần xác nhận nộp vào quỹ nuôi lợn, hiện dạng gọn (`70k`, `1,2tr`).
- Số tiền "đã đút" lấy từ `pig_ledger` (API `/api/dashboard-pig-totals`), có cache localStorage để hiện ngay khi mở trang.
- Chuyển dòng "Đã thu x/y" lên góc trái trên cho khỏi đè badge dưới.
- Xác minh `npm run lint` và `npm run build` thành công.

## 2026-11-01 — Chốt lượt tức thì và hoàn tác lượt đã chốt

- Nút "Chốt lượt thua hôm nay" cập nhật số đã chốt ngay từ cache rồi mới đồng bộ DB, không còn chờ server action.
- Thay nút × ở góc trái ô thành viên bằng badge tím hiển thị số lượt đã chốt.
- Hoàn tác lượt đã chốt bằng nhấn giữ ô thành viên trong mode "Sửa": xóa lượt đã chốt, không thu tiền, không ghi quỹ nuôi lợn; chỉ áp dụng khi chưa thu.
- Chặn giảm lượt thua xuống dưới số lượt đã chốt khi chạm trong mode "Sửa".
- Bỏ dòng "Đã chốt N" dưới tên vì đã có badge; chỉ còn "Đã thu x/y" khi đã thu tiền.
- Xác minh `npm run lint` và `npm run build` thành công.

## 2026-11-01 — Sửa nhấn giữ và khôi phục hiệu ứng tap

- Đồng bộ thay đổi từ máy khác (`c4357a6`): API tổng hợp tháng, API lượt thua, icon mới.
- Sửa fill nhấn giữ: dùng lớp phủ `::before` với `transform: scaleY()` thay cho animation `background-size`, fill phủ kín ô từ đáy lên.
- Chặn chọn chữ và menu gọi trên ô thành viên (`user-select: none`, `-webkit-touch-callout: none`, `touch-action: none`).
- Thêm pointer capture để thao tác nhấn giữ ổn định khi ngón tay di chuyển khỏi ô.
- Khôi phục phản hồi tap đếm lượt bằng viền xanh/glow 220ms, không đổi nền và không xung đột với fill nhấn giữ.
- Xác minh `npm run lint` và `npm run build` thành công; đẩy commit `eaac841`.

## 2026-10-31 — Dashboard quỹ nhóm

- Thay các trang thu, chi, tổng hợp cũ bằng dashboard homepage.
- Ghi lượt thua theo thành viên; chốt ngày; sửa/xóa lượt chưa thu; xác nhận thu vào quỹ nuôi lợn.
- Thêm biểu đồ tháng: quỹ thành viên, quỹ nuôi lợn và chi phí.
- Thêm PIN quản lý và schema mới trong `supabase-dashboard.sql`.
- Thêm loại khoản đóng quỹ `member_fund`/`pig` trong `supabase-fund-contribution-types.sql`.
- Giữ 5 thành viên: Thái Sơn, Madox, Phi Long, Minh Hoàng, Văn Đoàn; thêm Việt Dũng.
- Xóa migration SQL cũ không còn dùng.
- Xác minh `npm run lint` và `npm run build` thành công.
