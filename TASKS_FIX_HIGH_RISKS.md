# TASKS: Sửa 2 rủi ro ưu tiên cao nhất — BMT Badminton

Đọc `PROJECT_CONTEXT.md` và `AGENTS.md` trước khi code. Tuân thủ quy ước hiện tại: dùng `apply_patch`, không `git reset --hard`/`git checkout --`, UI tiếng Việt UTF-8, không đưa service-role key xuống client, mutation quản trị phải gọi `assertAdmin()`, sau mutation phải `revalidatePath()`, không commit/push nếu chưa được yêu cầu.

## Kết quả audit plan trước

Plan cũ có ý đúng nhưng chưa an toàn để triển khai nguyên trạng vì:

- `member_fee_summaries` là một dòng tổng hợp, trong khi `payments` gắn với từng `charge`; chỉ thêm `member_fee_summary_id` sẽ không phân bổ được tiền.
- `daily_scorecards` dùng `score_date` làm khóa chính, không có `id`.
- Chỉ mở lại bằng cách đặt `settled_at = NULL` sẽ để lại `charges`, `session_stake_points` và dữ liệu khách vãng lai cũ.
- Không thể suy ra “đã thu” từ việc tồn tại `monthly_fund_snapshot`.
- `payments` mới là nguồn sự thật của tiền đã thu; trạng thái summary chỉ là metadata workflow, không được cộng thêm vào tổng tiền.

Các điểm trên đã được sửa trong plan dưới đây.

## Nguyên tắc bắt buộc

1. Đọc schema thật và toàn bộ code đang ghi/đọc bảng liên quan trước khi sửa. Không đoán tên, kiểu hoặc khóa cột.
2. Không giả lập transaction bằng nhiều lệnh `.from()` tuần tự. Các thao tác cần nguyên tử phải dùng Postgres RPC `plpgsql` và gọi bằng `supabase.rpc()`.
3. Kiểm tra database production, RLS, constraint và dữ liệu legacy trước khi viết migration. File `supabase-*.sql` trong repo chỉ là bằng chứng tham khảo.
4. Migration phải idempotent: `IF NOT EXISTS` cho bảng/cột/index; constraint/function phải kiểm tra tồn tại hoặc dùng `CREATE OR REPLACE FUNCTION`.
5. Mỗi migration ghi comment rollback thủ công ở đầu file. Không xóa action cũ cho tới khi đã `rg` xác nhận không còn caller.
6. Nếu có typed Supabase client thì regenerate types sau migration; nếu không có thì không tạo bước giả.
7. RPC dùng `security definer`, `SET search_path = public`, kiểm tra input, khóa các dòng cần thiết bằng `FOR UPDATE`, và chỉ cấp quyền gọi cần thiết.
8. Mọi số liệu tiền mặt tiếp tục lấy từ `payments`; `charges` là nguồn công nợ. Summary chỉ là kế hoạch/trạng thái hiển thị.

## Task 0 — Dùng chung khóa quản lý thu cho các route tài chính

### Phạm vi bảo vệ

Dùng chính `THU_ACCESS_PIN`, cookie `bmt_thu_access` và cơ chế `isThuRouteAuthenticated()` hiện có để khóa:

- `/thu` và `/thu/so-thu` (đang có, cần giữ nguyên hành vi);
- `/tong-hop`;
- toàn bộ `/tong-hop/memfee-cards` và `/tong-hop/tien-do`;
- `/chi`.

Không tạo PIN thứ hai và không tạo hệ thống đăng nhập song song. Giữ cơ chế hiện tại: production yêu cầu PIN, môi trường development vẫn có thể bypass như hiện tại để không phá workflow local.

### Thay đổi dự kiến

1. Tách helper dùng chung hoặc giữ tên wrapper tương thích trong `lib/thuAuth.ts` để các route trên dùng cùng một kiểm tra. Cookie phải có `httpOnly`, `secure`, `sameSite: 'strict'`, `path: '/'` và thời hạn giống khóa quản lý thu.
2. Cập nhật `loginThuAction` để `next` chỉ chấp nhận `value === prefix || value.startsWith(prefix + '/')` với các prefix `/thu`, `/chi`, `/tong-hop`; không dùng `startsWith('/thu')` hẹp có thể tạo open redirect kiểu `/thugs`. Sau đăng nhập, redirect về đúng route đã yêu cầu.
3. Mỗi page phải kiểm tra xác thực **trước khi gọi query lấy dữ liệu**. Khi chưa xác thực, hiển thị cùng form nhập PIN và truyền `next`; không render số liệu tài chính trong HTML.
4. Có thể tạo component auth panel dùng chung để tránh 4 route lệch giao diện/logic. Không chuyển service-role client sang client component.
5. Giữ `assertAdmin()` ở mọi Server Action, kể cả các action của `/thu/so-thu`, `/chi` và `/tong-hop`; route lock không thay thế kiểm tra server-side.
6. Kiểm tra cookie cũ có path `/thu`: khi đăng nhập, xóa được cả cookie cũ nếu cần rồi đặt một cookie chuẩn ở `/`, tránh tồn tại hai trạng thái xác thực.

### Tiêu chí chấp nhận

- Production: truy cập trực tiếp các route trên khi chưa có cookie không thực hiện query tài chính và hiển thị form PIN.
- Nhập đúng một lần mở được toàn bộ các route trong phạm vi; không cần nhập lại giữa `/thu`, `/chi`, `/tong-hop`.
- Sai PIN không trả dữ liệu và không tạo cookie hợp lệ.
- `next` chỉ redirect tới route nội bộ được cho phép.
- Gọi trực tiếp bất kỳ mutation action nào khi chưa xác thực vẫn bị `assertAdmin()` chặn.
- Development không bị phá nếu vẫn giữ bypass hiện tại.

## Task 1 — Tách “kế hoạch thu” và “đã thu tiền thật” ở `/tong-hop`

### Mô hình dữ liệu bắt buộc

`member_fee_summaries.items` hiện chỉ có `{name, amount}` và một summary có thể gộp nhiều khoản. Vì `payments` yêu cầu `charge_id`, không được tạo một payment tổng duy nhất cho summary.

1. Thêm migration status cho `member_fee_summaries`:
   - `status` nhận `planned`, `partially_collected`, `collected`, default `planned`;
   - `collected_at timestamptz` nullable;
   - không thêm `collected_by` nếu hệ thống chỉ có PIN chung, vì PIN không xác định được cá nhân.
2. Thêm bảng phân bổ chuẩn hóa, tên có thể là `member_fee_summary_allocations`, sau khi đọc đúng kiểu khóa thật:
   - `summary_id` FK tới `member_fee_summaries.id`;
   - `charge_id` FK tới `charges.charge_id`;
   - `component`;
   - `allocated_amount` số nguyên dương;
   - `payment_id` nullable FK tới `payments.payment_id`;
   - unique cho một summary/charge/component và index cho các khóa tra cứu;
   - nếu giữ cả FK `allocation.payment_id` và `payments.member_fee_summary_id`, tạo bảng/cột trước rồi thêm các FK ở cuối migration để tránh lỗi thứ tự/circular dependency; nếu không cần truy vấn ngược từ payment, ưu tiên chỉ giữ `allocation.payment_id`.
3. Có thể thêm `payments.member_fee_summary_id` nullable FK để truy vết. Cột này không thay thế bảng allocation vì một summary có thể tạo nhiều payment. Payment thủ công cũ để `NULL`.
4. Summary `planned` có thể chưa có allocation vì nó chỉ là kế hoạch. Tuy nhiên, mọi khoản được chuyển sang `collected`/`partially_collected` bắt buộc phải có allocation hợp lệ. Nếu một khoản (ví dụ tiền độ tính trực tiếp từ `session_stake_points` hoặc khoản khác) chưa có `charge`, không được tự động gọi nó là đã thu: hoặc tạo charge tháng rõ ràng qua flow riêng, hoặc từ chối xác nhận và yêu cầu tạo charge trước.

### Backfill legacy

- Không đánh dấu `collected` chỉ vì tháng có `monthly_fund_snapshot`.
- Chỉ backfill `collected` khi có thể chứng minh tổng phân bổ của summary đã được thanh toán đầy đủ từ các payment hiện có.
- Nếu không thể ánh xạ JSON cũ tới charge/payment, giữ `planned` và tạo báo cáo/list cần rà soát thủ công; không âm thầm làm thay đổi số liệu lịch sử.
- Backfill phải có điều kiện lặp lại an toàn và không ghi đè trạng thái đã được xác nhận thủ công.

### Action và RPC

1. Giữ action cũ làm wrapper tương thích, nhưng chuyển logic sang `savePlannedFeeSelection(...)`: chỉ lưu kế hoạch, status `planned`, không tạo payment.
2. Thêm `markFeeSummaryCollected(summaryId, allocations)` qua một RPC duy nhất:
   - admin-only;
   - khóa summary và các charge/allocation liên quan;
   - kiểm tra summary tồn tại, đang ở `planned` hoặc `partially_collected`;
   - kiểm tra mỗi allocation thuộc summary, không vượt công nợ còn lại, tổng allocation đúng số tiền xác nhận;
   - tạo một payment cho từng allocation hợp lệ, cập nhật `payment_id`, rồi cập nhật status/`collected_at` trong cùng transaction;
   - chỉ set `collected_at` khi status chuyển thành `collected`; trạng thái `partially_collected` không được giả là đã thu đủ;
   - nếu đã có payment cho allocation thì chỉ chấp nhận retry có đúng cùng allocation/amount, trả kết quả “đã xử lý” và không insert trùng; payload retry khác phải bị reject; không dùng check rồi insert ở JavaScript.
3. Nếu tổng tiền chỉ thu một phần, status là `partially_collected`; chỉ chuyển `collected` khi toàn bộ allocation của kế hoạch đã đủ.
4. Sau action thành công, `revalidatePath('/tong-hop')` và `revalidatePath('/tong-hop/memfee-cards')`.

### UI và số liệu

- Nút “Chốt kế hoạch” chỉ lưu `planned`.
- Nút riêng “Xác nhận đã thu” hiển thị cho admin, có confirm nêu rõ sẽ tạo payment thật.
- Hiển thị rõ `Đã lên kế hoạch`, `Thu một phần`, `Đã thu`.
- Không cộng `collected` vào tổng tiền nếu payment đã được tính trong `getMonthSummary`; tránh double count.
- Rà lại mọi nơi đọc `member_fee_summaries` trước khi thay đổi type/query.

### Tiêu chí chấp nhận

- Snapshot mới mặc định `planned`, không làm tăng tổng tiền đã thu.
- Xác nhận một lần tạo đúng các payment theo allocation; retry không tạo trùng.
- Không thể xác nhận khoản không có charge/allocation hợp lệ.
- Payment và status cùng commit hoặc cùng rollback.
- Backfill không làm các tháng cũ tự nhiên tụt về 0 hoặc tăng tiền thu sai.
- Non-admin bị chặn ở server.

## Task 2 — Mở lại ngày đã chốt có kiểm soát và reconcile

### Schema log

`daily_scorecards` hiện có khóa chính `score_date date`, không có `id`. Dùng khóa này trong log:

- `score_date date not null references daily_scorecards(score_date)`;
- `reopened_at timestamptz default now()`;
- `reason text not null`;
- không thêm `reopened_by` giả nếu auth chỉ là PIN chung; nếu cần truy vết, chỉ ghi `actor_label = 'admin-pin'` hoặc cơ chế tương đương đã được thống nhất;
- index theo `score_date, reopened_at desc`.

### Reopen và khóa tháng

1. `reopenDailyScorecard(scoreDate, reason)` gọi `assertAdmin()` và validate reason ở server.
2. RPC khóa scorecard, đọc `settled_at`, kiểm tra tháng chỉ bị khóa khi `monthly_fund_snapshot.closing_balance IS NOT NULL` (không chỉ cần tồn tại row), rồi insert log và set `settled_at = NULL` trong cùng transaction.
3. `UPDATE` phải có điều kiện `settled_at IS NOT NULL`; request cạnh tranh phải trả lỗi rõ ràng, không no-op.
4. Nếu tháng đã khóa, không đổi `settled_at`, không ghi log và trả thông báo yêu cầu mở khóa tháng trước theo quy trình.

### Reconcile bắt buộc

Mở lại không được chỉ là đổi cờ. Khi lưu/sửa/xóa scorecard và khi chốt lại:

- khóa session/date tương ứng;
- phải có provenance rõ ràng cho artifact do settle tạo (ví dụ `settlement_run_id`/trạng thái batch trên các bảng liên quan, hoặc predicate duy nhất đã chứng minh được); tuyệt đối không xóa mọi charge chỉ vì cùng `session_id`;
- đối chiếu payload mới với `session_stake_points`, charges có `session_id`, phí giao lưu và walk-in artifacts do lần chốt trước tạo;
- chỉ xóa/sửa artifact chưa có payment;
- artifact đã thanh toán không được xóa âm thầm; phải từ chối thay đổi hoặc tạo khoản điều chỉnh bù trừ;
- xóa artifact của người/lượt đã bỏ khỏi payload và tạo artifact mới của người/lượt thêm vào;
- toàn bộ reconcile + cập nhật `settled_at` phải nằm trong RPC atomic;
- ghi audit cho lần reopen và lần resettle/correction.

Trong khoảng thời gian scorecard đang mở lại, artifact cũ không được tiếp tục làm tăng số liệu như thể đã chốt. RPC phải chọn một cơ chế rõ ràng: đánh dấu settlement batch là `open_correction` để các query tài chính loại ra, hoặc reconcile/xóa artifact chưa thanh toán ngay trong transaction. Nếu đã có artifact được thanh toán, phải chặn reopen cho tới khi có flow điều chỉnh được audit.

Nếu chưa triển khai được provenance và reconcile an toàn, chỉ cho reopen để xem/sửa trường không ảnh hưởng tiền hoặc tạm thời chặn sửa cấu trúc sau khi đã phát sinh charge/payment.

### UI và tiêu chí chấp nhận

- Admin thấy nút “Mở lại ngày này”; member thường không thấy.
- Reason bắt buộc ở client và server.
- Hiển thị lịch sử reopen gần nhất (thời gian, lý do) đọc từ log.
- Reopen thành công cho phép sửa/xóa theo flow có reconcile; không để lại charge/point/walk-in stale.
- Non-admin, reason rỗng, scorecard không tồn tại, hoặc tháng đã khóa đều bị từ chối rõ ràng.
- Mỗi lần reopen thành công ghi đúng một log.

## Kiểm thử và rollout

1. Chạy migration trên database staging trước; kiểm tra schema, constraint, RLS, RPC grants và dữ liệu legacy.
2. Test concurrency: gọi mark-collected/reopen hai lần đồng thời; không tạo payment/log trùng.
3. Test các ca partial, charge đã thanh toán, scorecard đổi người chơi/số tiền, walk-in bị xóa/thêm.
4. Test route protection khi chưa có cookie, cookie đúng, cookie sai, redirect `next` không hợp lệ.
5. Chạy `npm run lint` và `npm run build` sau mỗi nhóm thay đổi và một lần cuối.
6. Không commit/push trong phạm vi plan này.
