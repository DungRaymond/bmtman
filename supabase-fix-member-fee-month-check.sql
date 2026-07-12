begin;

alter table member_fee_summaries
  drop constraint if exists member_fee_summaries_period_month_check;

alter table member_fee_summaries
  add constraint member_fee_summaries_period_month_check
  check (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

commit;

-- Kiểm tra constraint mới đã nhận định dạng YYYY-MM.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'member_fee_summaries'::regclass
order by conname;
