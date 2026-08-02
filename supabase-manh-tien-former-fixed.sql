-- Chuyển Mạnh Tiến sang cố định cũ từ tháng 08/2026.
-- Migration idempotent: chạy lại không tạo thêm giai đoạn hoặc khoản thu.

DO $$
DECLARE
  target_member_id integer;
BEGIN
  SELECT member_id
  INTO STRICT target_member_id
  FROM members
  WHERE btrim(name) = 'Mạnh Tiến';

  UPDATE member_status_periods
  SET end_date = '2026-07-31',
      note = 'Kết thúc cố định từ tháng 08/2026'
  WHERE member_id = target_member_id
    AND status = 'fixed'
    AND start_date < '2026-08-01'
    AND (end_date IS NULL OR end_date >= '2026-08-01');

  INSERT INTO member_status_periods (member_id, status, start_date, end_date, note)
  SELECT target_member_id, 'former_fixed', '2026-08-01', NULL,
         'Cố định cũ từ tháng 08/2026'
  WHERE NOT EXISTS (
    SELECT 1
    FROM member_status_periods
    WHERE member_id = target_member_id
      AND status = 'former_fixed'
      AND start_date = '2026-08-01'
  );

  IF EXISTS (
    SELECT 1
    FROM charges c
    JOIN payments p ON p.charge_id = c.charge_id
    WHERE c.member_id = target_member_id
      AND c.charge_type = 'monthly_fixed_fee'
      AND c.period_month >= '2026-08'
  ) THEN
    RAISE EXCEPTION 'Mạnh Tiến đã có thanh toán cho quỹ cố định từ tháng 08/2026; cần xử lý thủ công để bảo toàn sổ thu.';
  END IF;

  DELETE FROM charges
  WHERE member_id = target_member_id
    AND charge_type = 'monthly_fixed_fee'
    AND period_month >= '2026-08';
END $$;
