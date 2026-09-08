-- Xoá tiền độ 15.000 VND của Huy Bình và chuyển Mạnh Tiến về thành viên cố định.
-- Migration idempotent.

DO $$
DECLARE
  huy_binh_id integer;
  manh_tien_id integer;
BEGIN
  SELECT member_id
  INTO STRICT huy_binh_id
  FROM members
  WHERE btrim(name) = 'Huy Bình';

  DELETE FROM session_stake_points
  WHERE member_id = huy_binh_id
    AND stake_points = 15000;

  SELECT member_id
  INTO STRICT manh_tien_id
  FROM members
  WHERE btrim(name) = 'Mạnh Tiến';

  UPDATE member_status_periods
  SET status = 'fixed',
      note = 'Chuyển về thành viên cố định'
  WHERE member_id = manh_tien_id
    AND status = 'former_fixed'
    AND end_date IS NULL;
END $$;