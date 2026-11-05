# TODO

## Dashboard PIN theo thao tác

- [x] Ghi/giảm lượt thua không yêu cầu PIN: bỏ prompt ở `handleLossChange` và bỏ `assertDashboardAccess()` trong `changeLossAction`. Chỉ chốt lượt thua mới cần PIN.
- [x] Kiểm tra xác nhận đút lợn: yêu cầu PIN rồi chạy tiếp chốt khoản; hiện cần xác minh callback tiếp tục sau xác thực.
- [x] Kiểm tra kết thúc chế độ Sửa: yêu cầu PIN rồi đồng bộ thay đổi đang chờ và kết thúc sửa.
- [x] Kiểm tra thêm khoản chi: yêu cầu PIN rồi gửi khoản chi; xác minh lỗi hiển thị đúng và không mất dữ liệu nhập khi PIN sai.
- [x] Xác minh hoàn tác lượt đã chốt có luồng PIN hoàn chỉnh; thao tác này cũng thay đổi DB.
- [x] Kiểm tra đầu-cuối trên web: mở dashboard không PIN; các thao tác quản trị yêu cầu PIN và chỉ chạy sau PIN hợp lệ.

## Đồng bộ số liệu lượt thua

- [x] Đút lợn xử lý toàn bộ ngày còn nợ: hộp xác nhận và số tiền khớp tổng chưa đút trên ô (`dashboard_close_pig_all`).
- [x] Chạy `supabase-dashboard-close-pig-all.sql` trên Supabase SQL Editor (người dùng xác nhận đã chạy).
- [ ] Hoàn tác lượt đã chốt vẫn chỉ xóa ngày hiện tại trong khi hộp xác nhận hiển thị tổng nhiều ngày; cần đồng bộ tương tự.
