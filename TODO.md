# TODO

## Dashboard PIN theo thao tác

- [ ] Kiểm tra thao tác ghi lượt thua: nếu chưa có PIN, yêu cầu PIN rồi chạy tiếp mutation; giữ `assertDashboardAccess()` phía server.
- [ ] Kiểm tra xác nhận đút lợn: yêu cầu PIN rồi chạy tiếp chốt khoản; hiện cần xác minh callback tiếp tục sau xác thực.
- [ ] Kiểm tra kết thúc chế độ Sửa: yêu cầu PIN rồi đồng bộ thay đổi đang chờ và kết thúc sửa.
- [ ] Kiểm tra thêm khoản chi: yêu cầu PIN rồi gửi khoản chi; xác minh lỗi hiển thị đúng và không mất dữ liệu nhập khi PIN sai.
- [ ] Xác minh hoàn tác lượt đã chốt có luồng PIN hoàn chỉnh; thao tác này cũng thay đổi DB.
- [ ] Kiểm tra đầu-cuối trên web: mở dashboard không PIN; các thao tác quản trị yêu cầu PIN và chỉ chạy sau PIN hợp lệ.
