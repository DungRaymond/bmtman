# Nhật ký thay đổi

## 2026-10-31 — Dashboard quỹ nhóm

- Thay các trang thu, chi, tổng hợp cũ bằng dashboard homepage.
- Ghi lượt thua theo thành viên; chốt ngày; sửa/xóa lượt chưa thu; xác nhận thu vào quỹ nuôi lợn.
- Thêm biểu đồ tháng: quỹ thành viên, quỹ nuôi lợn và chi phí.
- Thêm PIN quản lý và schema mới trong `supabase-dashboard.sql`.
- Thêm loại khoản đóng quỹ `member_fund`/`pig` trong `supabase-fund-contribution-types.sql`.
- Giữ 5 thành viên: Thái Sơn, Madox, Phi Long, Minh Hoàng, Văn Đoàn; thêm Việt Dũng.
- Xóa migration SQL cũ không còn dùng.
- Xác minh `npm run lint` và `npm run build` thành công.
