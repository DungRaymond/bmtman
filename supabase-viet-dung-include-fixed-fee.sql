-- Tính lại khoản quỹ cố định của Việt Dũng như thành viên bình thường.
UPDATE members
SET exclude_fixed_fee_from_fund = false
WHERE btrim(name) = 'Việt Dũng';