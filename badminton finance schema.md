-- ============================================================
-- SCHEMA: QUẢN LÝ TÀI CHÍNH NHÓM CẦU LÔNG
-- ============================================================
-- Nguyên tắc thiết kế:
--   - Tách "charges" (khoản PHẢI thu) khỏi "payments" (khoản ĐÃ thu)
--     -> tự tính được nợ tồn = SUM(charges) - SUM(payments), không cần
--        cột "Đã thu" nhập tay như file Excel cũ.
--   - Chỉ 2 loại thành viên có ĐỊNH DANH lâu dài: fixed / former_fixed,
--     lưu theo THỜI KỲ vì 1 người có thể chuyển trạng thái giữa chừng
--     (VD: Hoàng, Long nghỉ cố định từ 01/07/2026).
--   - VÃNG LAI (khách lạ, chỉ đến giao lưu 1 buổi) KHÔNG lưu trong bảng
--     members — không có tên, không có nợ tồn, chỉ quan tâm trong đúng
--     ngày hôm đó. Xem session_walkins ở mục 3b.
--   - Độ (điểm mỗi buổi) lưu riêng theo buổi, rồi group theo tháng để
--     ra "tiền độ" cộng vào quỹ cố định tháng đó.
-- ============================================================

-- ---------- 1. THÀNH VIÊN CÓ ĐỊNH DANH (fixed / former_fixed) ----------
-- Vãng lai KHÔNG có dòng ở đây — xem session_walkins.
CREATE TABLE members (
    member_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    joined_date     DATE,
    note            TEXT
);

-- Loại thành viên thay đổi theo thời gian -> lưu dạng lịch sử
-- fixed          = thành viên cố định, đóng quỹ 500k/tháng
-- former_fixed   = từng là fixed, giờ chỉ giao lưu -> phí buổi 60k, có nợ tồn
CREATE TABLE member_status_periods (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id       INTEGER NOT NULL REFERENCES members(member_id),
    status          TEXT NOT NULL CHECK (status IN ('fixed','former_fixed')),
    start_date      DATE NOT NULL,
    end_date        DATE,              -- NULL = đang áp dụng đến hiện tại
    note            TEXT
);

-- ---------- 2. BUỔI ĐÁNH ----------
CREATE TABLE sessions (
    session_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date    DATE NOT NULL,
    is_cancelled    INTEGER NOT NULL DEFAULT 0,  -- "Sân nghỉ"
    note            TEXT
);

-- Độ ghi nhận mỗi buổi, mỗi người có định danh (nguồn: app chấm độ)
-- Vãng lai không có độ theo dõi qua bảng này (nếu vãng lai phát sinh độ,
-- quy thẳng ra tiền và cộng vào session_walkins.fee_collected trong ngày).
CREATE TABLE session_do_points (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES sessions(session_id),
    member_id       INTEGER NOT NULL REFERENCES members(member_id),
    do_points       INTEGER NOT NULL DEFAULT 0,
    UNIQUE (session_id, member_id)
);

-- Ai thu tiền giao lưu buổi đó (map lại field "Người thu GL" trong Excel)
CREATE TABLE session_collectors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES sessions(session_id),
    member_id       INTEGER NOT NULL REFERENCES members(member_id)
);

-- ---------- 3a. VÃNG LAI (khách lạ, không định danh) ----------
-- Không có tên, không có nợ tồn — chỉ ghi số tiền/phí phát sinh trong
-- đúng buổi đó. Nếu thu thiếu, KHÔNG theo dõi tiếp sang buổi/tháng sau.
-- Mỗi vãng lai trong 1 buổi là 1 dòng riêng, đánh số 1..N trong PHẠM VI buổi
-- đó (walkin_number KHÔNG phải định danh xuyên buổi — buổi khác lại đánh số
-- lại từ 1). Thiết kế này khớp với UI: bấm nút "Vãng lai 1", "Vãng lai 2"...
-- mỗi nút tự thêm 1 dòng mặc định 80k/chưa thu; bấm lại để tick đã thu tại
-- chỗ. Nhờ đánh theo từng người, buổi đó ai đã thu/ai chưa vẫn thấy được
-- ngay trong ngày, dù không cần biết TÊN của họ là gì.
CREATE TABLE session_walkins (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES sessions(session_id),
    walkin_number   INTEGER NOT NULL,                 -- 1, 2, 3... thứ tự trong buổi (UI: nút "Vãng lai N")
    fee_type        TEXT NOT NULL CHECK (fee_type IN ('session_fee','do_fee')),
                        -- session_fee = phí giao lưu 80k/người (mặc định khi bấm nút)
                        -- do_fee      = tiền độ phát sinh riêng (nếu có), thêm dòng riêng, không gộp
    amount_expected INTEGER NOT NULL DEFAULT 80000,   -- lấy từ fee_rules('walkin','base_fee') tại thời điểm tạo
    is_paid         INTEGER NOT NULL DEFAULT 0,       -- tick ngay trong buổi (0/1)
    amount_collected INTEGER,                          -- điền khi tick đã thu; NULL nếu chưa thu
    collected_by    INTEGER REFERENCES members(member_id),
    note            TEXT,
    UNIQUE (session_id, walkin_number, fee_type)
);

-- ---------- 3b. BẢNG CẤU HÌNH PHÍ (data-driven, không hardcode trong app) ----------
-- Mỗi dòng = mức phí áp dụng cho 1 nhóm + 1 loại phí, kèm thời điểm phải thu.
-- Khi tăng/giảm phí, chỉ cần thêm dòng mới với effective_from mới, KHÔNG sửa
-- dòng cũ -> charges đã tạo trước đó giữ nguyên số tiền lịch sử.
-- 'walkin' ở đây CHỈ là 1 mức phí tham chiếu cho session_walkins, KHÔNG phải
-- 1 trạng thái thành viên (vãng lai không có trong member_status_periods).
CREATE TABLE fee_rules (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    member_status       TEXT NOT NULL CHECK (member_status IN ('fixed','former_fixed','walkin')),
    fee_component       TEXT NOT NULL CHECK (fee_component IN ('base_fee','do_fee')),
                            -- base_fee = phí cố định/phí giao lưu theo buổi
                            -- do_fee   = tiền độ (amount NULL, tính từ session_do_points)
    amount              INTEGER,               -- 500000 / 80000 / 60000; NULL nếu fee_component = 'do_fee'
    collection_timing   TEXT NOT NULL CHECK (collection_timing IN ('same_day','monthly_next')),
                            -- same_day     = thu ngay trong buổi (vãng lai, giao lưu)
                            -- monthly_next = gộp thu đầu tháng sau (thành viên cố định)
    effective_from      DATE NOT NULL,
    effective_to        DATE,
    UNIQUE (member_status, fee_component, effective_from)
);

-- Dữ liệu mẫu đúng theo quy tắc hiện tại:
INSERT INTO fee_rules (member_status, fee_component, amount, collection_timing, effective_from) VALUES
    ('fixed',        'base_fee', 500000, 'monthly_next', '2026-01-01'),
    ('fixed',        'do_fee',   NULL,   'monthly_next', '2026-01-01'),
    ('former_fixed', 'base_fee', 60000,  'same_day',      '2026-01-01'),
    ('former_fixed', 'do_fee',   NULL,   'same_day',      '2026-01-01'),
    ('walkin',       'base_fee', 80000,  'same_day',      '2026-01-01'),
    ('walkin',       'do_fee',   NULL,   'same_day',      '2026-01-01');

-- ---------- 4. KHOẢN PHẢI THU (chỉ áp dụng cho fixed / former_fixed) ----------
-- Vãng lai KHÔNG đi qua bảng này — xem session_walkins.
CREATE TABLE charges (
    charge_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id       INTEGER NOT NULL REFERENCES members(member_id),
    charge_type     TEXT NOT NULL CHECK (charge_type IN (
                        'monthly_fixed_fee',    -- 500k/tháng, chỉ member fixed
                        'monthly_do_fee',        -- tổng độ trong tháng, chỉ member fixed
                        'session_giaoluu_fee',   -- 60k/buổi, chỉ member former_fixed
                        'session_do_fee',        -- tiền độ buổi đó, chỉ member former_fixed
                        'tournament_fee',        -- phí tổ chức giải, phát sinh riêng lẻ
                        'other'
                     )),
    amount          INTEGER NOT NULL,
    period_month    TEXT,
    session_id      INTEGER REFERENCES sessions(session_id),
    event_name      TEXT,
    created_at      DATE NOT NULL DEFAULT (date('now')),
    note            TEXT,
    UNIQUE (member_id, charge_type, session_id),
    UNIQUE (member_id, charge_type, period_month)
);

-- ---------- 5. KHOẢN ĐÃ THU ----------
CREATE TABLE payments (
    payment_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    charge_id       INTEGER NOT NULL REFERENCES charges(charge_id),
    amount_paid     INTEGER NOT NULL,
    paid_date       DATE NOT NULL,
    payment_method  TEXT CHECK (payment_method IN ('cash','bank_transfer','e_wallet','other')),
                        -- ghi lại hình thức nhận, giúp soát lại khi có lệch số
    recorded_by     INTEGER REFERENCES members(member_id),
                        -- ai là người tick/xác nhận đã thu (đối chiếu với session_collectors
                        -- nếu người tick không trùng người thu buổi đó -> cần hỏi lại)
    note            TEXT
                        -- VD: "chuyển khoản, tin nhắn lúc 20:15" để đối chiếu sao kê sau
);

-- ---------- 6. CHI PHÍ NHÓM ----------
CREATE TABLE expenses (
    expense_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_date    DATE NOT NULL,
    category        TEXT NOT NULL CHECK (category IN (
                        'court',        -- chi phí sân / bảo vệ
                        'shuttlecock',  -- tiền cầu
                        'shirt',        -- in áo
                        'party',        -- liên hoan giao lưu
                        'medal',        -- huy chương giải
                        'other'
                     )),
    amount          INTEGER NOT NULL,
    description     TEXT
);

-- ---------- 7. QUỸ TỒN CHUYỂN THÁNG (điểm khởi đầu mỗi tháng) ----------
-- Có thể tính bằng công thức từ payments + session_walkins - expenses của
-- tháng trước, nhưng lưu riêng để chốt sổ, tránh sai lệch nếu dữ liệu cũ
-- có note tay.
CREATE TABLE monthly_fund_snapshot (
    period_month        TEXT PRIMARY KEY,   -- 'YYYY-MM'
    opening_balance     INTEGER NOT NULL,
    closing_balance     INTEGER,            -- điền khi chốt sổ cuối tháng
    note                TEXT
);

-- ============================================================
-- VIEW GỢI Ý: CÔNG NỢ THEO TỪNG THÀNH VIÊN CÓ ĐỊNH DANH
-- (vãng lai không có view này vì không có nợ tồn theo thiết kế)
-- ============================================================
CREATE VIEW member_balance AS
SELECT
    m.member_id,
    m.name,
    COALESCE(SUM(c.amount), 0)                                   AS total_charged,
    COALESCE((SELECT SUM(p.amount_paid)
              FROM payments p
              JOIN charges c2 ON p.charge_id = c2.charge_id
              WHERE c2.member_id = m.member_id), 0)                AS total_paid,
    COALESCE(SUM(c.amount), 0)
      - COALESCE((SELECT SUM(p.amount_paid)
                  FROM payments p
                  JOIN charges c2 ON p.charge_id = c2.charge_id
                  WHERE c2.member_id = m.member_id), 0)             AS outstanding_debt
FROM members m
LEFT JOIN charges c ON c.member_id = m.member_id
GROUP BY m.member_id, m.name;

-- ============================================================
-- LOGIC TÍNH PHÍ & THỜI ĐIỂM THU (xử lý ở tầng app, đọc từ fee_rules
-- thay vì hardcode số tiền / thời điểm trong code):
-- ============================================================
-- NGUYÊN TẮC CHỐNG SAI SÓT: charges (fixed/former_fixed) và session_walkins
-- (vãng lai) luôn được TẠO TỰ ĐỘNG ngay khi có sự kiện nguồn (log buổi đánh
-- / độ), KHÔNG bao giờ gõ tay số tiền. App chỉ đọc fee_rules để biết áp
-- dụng bao nhiêu và thu lúc nào.
--
-- 1. NGAY SAU KHI LƯU 1 BUỔI (session):
--
--    a) Với mỗi member CÓ ĐỊNH DANH tham gia buổi đó, tra
--       member_status_periods để biết status tại đúng ngày đó:
--
--       - status = 'fixed':
--           KHÔNG tạo charge ngay. Độ được cộng dồn vào session_do_points,
--           đợi job cuối tháng gom lại (xem bước 2).
--
--       - status = 'former_fixed':
--           Tạo NGAY 2 charge, collection_timing = 'same_day':
--             i)  'session_giaoluu_fee' = fee_rules.amount (60k)
--             ii) 'session_do_fee'       = độ buổi đó quy ra tiền
--           Nếu cuối buổi CHƯA thu được -> charge vẫn "unpaid", KHÔNG cần
--           thao tác gì thêm — tự động nằm trong nợ tồn, hiện lại ở màn
--           hình thu đầu tháng sau (bước 3).
--
--    b) Với VÃNG LAI (không định danh): tạo 1-2 dòng session_walkins
--       ngay trong buổi đó — 1 dòng fee_type='session_fee' (80k x headcount),
--       và 1 dòng fee_type='do_fee' NẾU có phát sinh độ (2 khoản này KHÔNG
--       được gộp chung 1 dòng, để tránh nhầm như trường hợp "80k giao lưu"
--       của Việt Dũng ngày 30/06 — ban đầu tưởng là độ nhưng thực ra là phí
--       giao lưu). amount_collected ghi đúng số thực nhận trong ngày; nếu
--       thu thiếu thì để amount_expected khác amount_collected, KHÔNG tạo
--       nợ tồn kéo sang buổi khác.
--
-- 2. JOB CUỐI THÁNG (chạy 1 lần khi chốt sổ), chỉ áp cho member status
--    = 'fixed' TẠI THỜI ĐIỂM đó:
--      - Tạo charge 'monthly_fixed_fee' = fee_rules.amount (500,000)
--      - Tạo charge 'monthly_do_fee' = SUM(session_do_points.do_points)
--        quy đổi ra tiền, cho các session trong tháng đó (có thể = 0)
--    Nhờ UNIQUE (member_id, charge_type, period_month), job này chạy
--    lại nhiều lần trong tháng cũng không tạo trùng charge.
--
-- 3. ĐẦU THÁNG SAU — màn hình "thu tiền đầu tháng": query tất cả charge
--    còn unpaid của member có định danh (dùng thẳng view member_balance).
--    Với thành viên fixed đây là lần thu chính; với former_fixed đây là
--    nơi "vét" các buổi lỡ chưa thu trong ngày. Vãng lai KHÔNG xuất hiện
--    ở màn hình này.
--
-- 4. Phí tổ chức giải: tạo charge 'tournament_fee' thủ công cho từng
--    thành viên có định danh tham gia giải, amount tuỳ giải.
--
-- 5. CHUYỂN TRẠNG THÁI (VD Hoàng, Long nghỉ fixed từ 01/07/2026):
--      - KHÔNG sửa đè dòng member_status_periods cũ.
--      - Set end_date của dòng 'fixed' cũ = ngày cuối cùng còn cố định.
--      - Thêm dòng mới status = 'former_fixed', start_date = ngày bắt đầu
--        giao lưu. Nhờ vậy lịch sử charges các tháng trước (lúc còn fixed)
--        không bị tính toán lại sai.
--
-- 6. Nợ tồn của member có định danh = view member_balance.outstanding_debt.
--    Không có cột "đã thu" nhập tay ở đâu cả — mọi trạng thái thu suy
--    ra từ việc có payment khớp với charge hay chưa.
-- ============================================================

-- ============================================================
-- 2 NÚT CHÍNH TRÊN MÀN HÌNH "LOG BUỔI ĐÁNH" & ÁNH XẠ VÀO SCHEMA
-- ============================================================
--
-- NÚT "VÃNG LAI N" (dãy nút nhanh 1..7, có thể bấm "+" để có nút thứ 8, 9...):
--   - Bấm nút "Vãng lai N" lần đầu trong buổi hiện tại
--       -> INSERT session_walkins (session_id, walkin_number=N,
--          fee_type='session_fee', amount_expected=80000, is_paid=0)
--       -> Đơn giá 80000 nên lấy từ fee_rules WHERE member_status='walkin'
--          AND fee_component='base_fee' AND effective_from <= session_date
--          (không hardcode 80000 thẳng trong app).
--   - Bấm lại đúng nút đó (đã tồn tại dòng) -> toggle is_paid, set
--     amount_collected = amount_expected, collected_by = người đang đăng nhập.
--   - Nếu vãng lai đó CÓ độ -> thêm 1 dòng riêng cùng walkin_number nhưng
--     fee_type='do_fee' (UI: 1 ô nhập nhanh ngay dưới nút, không phải nút
--     bấm sẵn vì số tiền độ thay đổi từng người).
--   - Số nút hiển thị mặc định 1..7 chỉ là gợi ý UI cho các buổi thường
--     (thường không quá 7 vãng lai/buổi) — app nên tự sinh thêm nút nếu
--     buổi nào đông hơn, KHÔNG giới hạn cứng ở 7 trong schema.
--
-- NÚT "+" (thêm thành viên cố định / cố định cũ vào buổi):
--   - Mở dropdown liệt kê members ĐANG có status 'fixed' hoặc 'former_fixed'
--     TẠI NGÀY của session đó (join member_status_periods, lọc
--     start_date <= session_date AND (end_date IS NULL OR end_date >= session_date)).
--   - Không hiện lại người đã có mặt trong session_do_points/charges của
--     đúng buổi đó (tránh thêm trùng — cũng được chặn cứng bởi UNIQUE
--     (session_id, member_id) ở session_do_points).
--   - Chọn xong 1 tên -> tạo dòng session_do_points (độ mặc định 0, sửa
--     sau) và nếu status='former_fixed' thì tạo luôn charge
--     'session_giaoluu_fee' 60k như mô tả ở bước 1a. Nếu status='fixed'
--     thì KHÔNG tạo charge ngay (dồn cuối tháng như thường lệ).
-- ============================================================