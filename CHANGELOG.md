# Nhật ký thay đổi

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
