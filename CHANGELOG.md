# Nhật ký thay đổi

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
