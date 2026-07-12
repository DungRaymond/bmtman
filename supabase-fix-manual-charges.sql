-- Allow more than one manual charge of the same type in a month.
alter table charges
  drop constraint if exists charges_member_id_charge_type_period_month_key;

create unique index if not exists charges_unique_monthly_fee
  on charges (member_id, charge_type, period_month)
  where charge_type in ('monthly_fixed_fee', 'monthly_stake_fee');
