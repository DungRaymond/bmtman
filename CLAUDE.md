@AGENTS.md

# BMT Badminton - project guide

Tài liệu này mô tả trạng thái hiện tại của project. Ưu tiên code và các file SQL hiện có nếu tài liệu khác mâu thuẫn.

## Tổng quan

Ứng dụng nội bộ để ghi tiền độ theo từng buổi cầu lông và quản lý quỹ nhóm: khoản phải thu, thanh toán, khách vãng lai, chi phí, công nợ và tổng kết tháng.

## Stack và runtime

- Next.js `16.2.9`, App Router; React/React DOM `19.2.4`.
- TypeScript strict, alias `@/* -> ./*`.
- Tailwind CSS 4 có trong dependencies nhưng UI hiện dùng CSS thuần tại `app/globals.css`.
- Supabase JS `2.x`; không có ORM và không có API routes.
- Deploy Vercel ở region `sin1`, Fluid compute bật trong `vercel.json`.
- `yarn.lock` là lockfile duy nhất đang được track. Các script chuẩn: `dev`, `lint`, `build`, `start`.

Đây là Next.js 16 có breaking changes. Trước khi sửa code liên quan Next.js, phải đọc guide tương ứng trong `node_modules/next/dist/docs/` theo chỉ dẫn của `AGENTS.md`. Không dựa vào trí nhớ về các phiên bản Next cũ. Ví dụ hiện tại `searchParams`, `cookies()` đều là API async.

## Các route hiện có

| Route | Chức năng |
| --- | --- |
| `/` | Ghi thẻ độ theo ngày, tối đa 12 lượt; xem lịch sử trong ngày và tiền độ tháng; chốt sổ ngày. |
| `/thu` | Tạo khoản phải thu, thu tiền thành viên/vãng lai và xem công nợ. |
| `/thu/so-thu` | Sổ thu chi tiết; CRUD khoản phải thu, lần thanh toán và khoản vãng lai theo tháng. |
| `/chi` | Tạo và xem các khoản chi theo tháng. |
| `/tong-hop` | Tổng hợp tồn đầu, thu, chi, tồn ước tính, công nợ; tạo phí cố định và chốt số dư tháng. |
| `/tong-hop/memfee-cards` | Thẻ tổng kết phí từng thành viên và snapshot JSON của tháng. |
| `/tong-hop/tien-do` | Thống kê tiền độ tháng tính trực tiếp từ các thẻ độ. |

Các page dữ liệu đều là Server Components động (`force-dynamic`). Client Components chỉ dùng cho phần tương tác như navigation, form ghi độ và amount stepper.

## Cấu trúc code

- `app/actions.ts`: Server Actions chính cho thẻ độ, chốt ngày, thu/chi và tổng kết tháng.
- `app/thu/so-thu/actions.ts`: Server Actions CRUD riêng của sổ thu.
- `app/thu/auth-actions.ts`: đăng nhập PIN và tạo cookie quản trị.
- `lib/finance.ts`: types, formatters, truy vấn Supabase và các phép tổng hợp tài chính.
- `lib/supabaseServer.ts`: singleton Supabase admin client, có `server-only`.
- `lib/thuAuth.ts` + `lib/security.ts`: xác thực PIN/cookie và `assertAdmin()`.
- `lib/walkinReceivables.ts`: tạo khách vãng lai qua RPC, có fallback cho database cũ.
- `app/globals.css`: toàn bộ style dùng chung; giao diện responsive/mobile-first nằm ở đây.

Giữ truy vấn dữ liệu ở server. Không đưa Supabase service-role client, secret hoặc business mutation xuống Client Components.

## Luồng nghiệp vụ quan trọng

### Ghi và chốt thẻ độ

- `daily_scorecards` là nguồn dữ liệu thẻ độ theo ngày; mỗi row có JSON `payload.sets` và `settled_at`.
- Mỗi lượt có 1-2 người mỗi bên, mức độ tối thiểu 5.000đ, bên thắng, trạng thái khóa và tối đa 12 lượt/ngày.
- Người chơi có thể là member, walk-in đánh số, hoặc guest có tên. Tên guest được tái sử dụng làm gợi ý ở các lần sau.
- Khi chốt ngày, hệ thống tạo/tái sử dụng `sessions`, tổng hợp người thua vào `session_stake_points`, tạo phí giao lưu/tiền độ cần thiết và đồng bộ `session_walkins`, sau đó mới set `settled_at`.
- Không cho sửa thêm khi ngày đã chốt. Khi thay đổi logic chốt sổ phải giữ tính idempotent của các `upsert` và unique key hiện tại.

### Thu, chi và tổng hợp

- Thành viên có hai trạng thái nghiệp vụ: `fixed` và `former_fixed`, có hiệu lực theo khoảng ngày trong `member_status_periods`.
- Khoản phải thu nằm ở `charges`; tiền đã thu là các row riêng trong `payments`. `member_balance` là view tổng hợp công nợ.
- Các loại charge hiện tại: `monthly_fixed_fee`, `monthly_stake_fee`, `session_giaoluu_fee`, `session_stake_fee`, `tournament_fee`, `other`.
- Phí áp dụng theo thời gian nằm trong `fee_rules`, gồm `base_fee` và `stake_fee`.
- Thu vãng lai nằm trong `session_walkins`; một người có thể có row `session_fee` và `stake_fee`. `walkin_people` lưu danh tính/tần suất của khách có tên.
- `monthly_fund_snapshot` lưu số dư tháng. `member_fee_summaries` lưu snapshot JSON cho memfee cards; nếu chưa có snapshot, UI tính trực tiếp từ charges/payments.
- Tiền được lưu dưới dạng số nguyên VND. Ngày dùng `YYYY-MM-DD`, tháng dùng `YYYY-MM`.
- Thuật ngữ hiện tại là `stake`/“độ”. Không đưa lại tên legacy `do_points`, `do_fee`, `monthly_do_fee` hoặc `session_do_fee`.

## Database và migrations

- `badminton finance schema.md` mô tả schema tài chính nền tảng và `member_balance`; file này có cú pháp `AUTOINCREMENT` mang tính mô tả, không phải migration PostgreSQL có thể chạy nguyên xi.
- Các file `supabase-*.sql` ở root là các migration/patch PostgreSQL hiện tại cho daily scorecards, stake rename, manual-charge constraint, walk-in name/people RPC và member-fee summaries.
- `supabase-walkin-people.sql` tạo RPC `create_walkin_receivables`; `lib/walkinReceivables.ts` cố ý giữ fallback cho database chưa có RPC/table mới. Không xóa fallback nếu chưa xác nhận mọi environment đã migrate.
- Migration mới phải an toàn với dữ liệu đang có, ưu tiên idempotent (`if exists`/`if not exists`) và phải cập nhật cả constraint/index liên quan.
- Phần SQL `badminton_matches` trong `README.md` là tài liệu legacy, không phản ánh data model ứng dụng hiện tại.

## Xác thực và cấu hình

Biến môi trường server bắt buộc khi chạy thật:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `THU_ACCESS_PIN`

Không tạo biến `NEXT_PUBLIC_*` cho các giá trị này. Khi thiếu cấu hình Supabase, các hàm đọc chính trả dữ liệu rỗng để UI hiển thị cảnh báo; mutation vẫn không thể hoạt động.

Trong production, `/thu` và `/thu/so-thu` yêu cầu PIN. Cookie `bmt_thu_access` là HTTP-only, secure, same-site strict, có hạn 12 giờ. Ở non-production, kiểm tra PIN được bypass.

Hầu hết mutation tài chính/chốt sổ gọi `assertAdmin()`. Riêng các action tạo/sửa cơ bản của thẻ độ (`createSessionAction`, `addScoreSetAction`, `confirmScoreEntryAction`, `saveScoreSetAction`, `deleteScoreSetAction`) hiện không yêu cầu admin; đây là hành vi hiện tại, không tự ý thay đổi nếu chưa có quyết định sản phẩm.

## Quy tắc khi sửa code

- Bảo toàn ranh giới Server Component/Client Component và giữ `server-only` cho code dùng service-role key.
- Với mọi Server Action mới có tác động tài chính hoặc dữ liệu quản trị, gọi `assertAdmin()` trước mutation.
- Sau mutation, revalidate tất cả route hiển thị dữ liệu bị ảnh hưởng; các route thường liên quan là `/`, `/thu`, `/thu/so-thu`, `/tong-hop` và `/tong-hop/memfee-cards`.
- Validate dữ liệu ở server dù form client đã có constraint. Giữ VND là integer và giới hạn ngày/tháng đúng định dạng.
- Giữ tương thích dữ liệu Supabase join có thể trả relation dưới dạng object hoặc mảng; code hiện đã normalize cả hai dạng.
- Giữ nội dung giao diện bằng tiếng Việt và file UTF-8; không commit chuỗi mojibake.
- Không sửa schema chỉ ở TypeScript: mọi thay đổi database phải có SQL patch đi kèm.
- Không dựa vào README để suy luận schema; kiểm tra `lib/finance.ts`, Server Actions và các file SQL trước.

## Kiểm tra trước khi bàn giao

```bash
npm run lint
npm run build
```

Project hiện chưa có test runner hoặc test suite. Với thay đổi nghiệp vụ, ngoài lint/build cần kiểm tra thủ công các route và luồng Supabase liên quan.
