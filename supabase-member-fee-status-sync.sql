-- Đồng bộ trạng thái các thẻ thu cũ từ tổng tiền đã thu thực tế.
-- Chạy an toàn nhiều lần; không tạo payment và không thay đổi số tiền.

UPDATE member_fee_summaries
SET status = CASE
      WHEN COALESCE(total_due, 0) > 0
       AND COALESCE(total_paid, 0) >= COALESCE(total_due, 0)
        THEN 'collected'
      WHEN COALESCE(total_paid, 0) > 0
        THEN 'partially_collected'
      ELSE 'planned'
    END,
    collected_at = CASE
      WHEN COALESCE(total_due, 0) > 0
       AND COALESCE(total_paid, 0) >= COALESCE(total_due, 0)
        THEN collected_at
      ELSE NULL
    END,
    updated_at = now()
WHERE status IS DISTINCT FROM CASE
      WHEN COALESCE(total_due, 0) > 0
       AND COALESCE(total_paid, 0) >= COALESCE(total_due, 0)
        THEN 'collected'
      WHEN COALESCE(total_paid, 0) > 0
        THEN 'partially_collected'
      ELSE 'planned'
    END
   OR (status = 'collected' AND collected_at IS NOT NULL AND NOT (
      COALESCE(total_due, 0) > 0
      AND COALESCE(total_paid, 0) >= COALESCE(total_due, 0)
   ));
