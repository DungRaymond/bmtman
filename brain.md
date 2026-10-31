# BMT Badminton — Brain

## Mục tiêu

Ứng dụng nội bộ ghi tiền độ cầu lông, quản lý thu–chi/công nợ và tổng hợp quỹ theo tháng.

## Stack

- Next.js `16.2.9` App Router, React `19.2.4`, TypeScript strict.
- Supabase JS; service-role client chỉ chạy phía server (`lib/supabaseServer.ts`).
- UI dùng CSS thuần trong `app/globals.css`; Server Components mặc định.
- Package manager: Yarn (`yarn.lock`). Lệnh: `yarn dev`, `yarn lint`, `yarn build`.
- Đây là Next.js có breaking changes. Trước khi sửa code Next.js, đọc guide tương ứng trong `node_modules/next/dist/docs/` theo `AGENTS.md`.

## Route

- `/`: ghi/chốt thẻ độ theo ngày.
- `/thu`: khoản phải thu và thu tiền.
- `/thu/so-thu`: sổ thu chi tiết.
- `/chi`: khoản chi.
- `/tong-hop`: tổng hợp quỹ, công nợ, báo cáo.
- `/tong-hop/memfee-cards`: snapshot phí thành viên.
- `/tong-hop/tien-do`: thống kê tiền độ.
- `/tong-hop/export`: xuất báo cáo.

## Nghiệp vụ và dữ liệu

- `daily_scorecards` lưu thẻ độ ngày; `payload.sets`, `settled_at`. Ngày `YYYY-MM-DD`, tháng `YYYY-MM`.
- Chốt ngày tổng hợp vào `sessions`, `session_stake_points`, khoản phải thu và `session_walkins`. Giữ thao tác idempotent; không sửa/xóa ngày đã chốt.
- `charges` là khoản phải thu; `payments` là các lần thu. Tiền lưu số nguyên VND.
- Thành viên gồm `fixed` và `former_fixed`, trạng thái hiệu lực theo thời gian. Phí cấu hình ở `fee_rules`.
- `session_walkins` lưu khoản phải thu khách vãng lai; `walkin_people` lưu danh tính khách có tên.
- Schema nền trong `badminton finance schema.md`; migration PostgreSQL trong `supabase-*.sql`. Migration mới cần an toàn, ưu tiên idempotent.
- Giữ fallback trong `lib/walkinReceivables.ts` đến khi mọi môi trường đã migrate RPC/table tương ứng.
- Dùng thuật ngữ `stake`/“độ”; không đưa lại tên legacy `do_points`, `do_fee`, `monthly_do_fee`, `session_do_fee`.

## Bảo mật và sửa code

- Env server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `THU_ACCESS_PIN`. Không tạo `NEXT_PUBLIC_*` cho secret.
- Mutation tài chính/quản trị phải gọi `assertAdmin()` trước khi thay đổi dữ liệu; gọi `revalidatePath()` cho route bị ảnh hưởng.
- Không đưa service-role key hoặc mutation nghiệp vụ xuống Client Component.
- Validate dữ liệu ở server; giữ VND integer và ngày/tháng đúng định dạng.
- Relation Supabase có thể là object hoặc array; giữ chuẩn hóa cả hai dạng.
- Thay đổi schema cần SQL patch đi kèm.
- UI và tài liệu tiếng Việt UTF-8.
- Không tự ý đổi bảo mật của action ghi độ; một số action hiện không yêu cầu admin.

## File chính

- `app/actions.ts`: Server Actions chính.
- `app/thu/so-thu/actions.ts`: mutation sổ thu.
- `app/thu/auth-actions.ts`, `lib/security.ts`, `lib/thuAuth.ts`: auth/PIN.
- `lib/finance.ts`: truy vấn, types và phép tính tài chính.
- `lib/walkinReceivables.ts`: tạo khoản phải thu khách vãng lai.
- `app/globals.css`: style dùng chung.

## Kiểm tra

```bash
yarn lint
yarn build
```

Chưa có test runner. Giữ thay đổi người dùng; không reset/checkout để xóa thay đổi. Không commit/push nếu chưa được yêu cầu.
