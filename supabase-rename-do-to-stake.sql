begin;

-- Rename the stake ledger table and amount column without losing history.
do $$
begin
  if to_regclass('public.session_do_points') is not null
     and to_regclass('public.session_stake_points') is null then
    alter table public.session_do_points rename to session_stake_points;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'session_stake_points'
      and column_name = 'do_points'
  ) then
    alter table public.session_stake_points rename column do_points to stake_points;
  end if;
end $$;

-- Replace enum-like CHECK values before migrating existing rows.
alter table public.session_walkins
  drop constraint if exists session_walkins_fee_type_check;
alter table public.fee_rules
  drop constraint if exists fee_rules_fee_component_check;
alter table public.charges
  drop constraint if exists charges_charge_type_check;

update public.session_walkins
set fee_type = 'stake_fee'
where fee_type = 'do_fee';

update public.fee_rules
set fee_component = 'stake_fee'
where fee_component = 'do_fee';

update public.charges
set charge_type = case charge_type
  when 'monthly_do_fee' then 'monthly_stake_fee'
  when 'session_do_fee' then 'session_stake_fee'
  else charge_type
end
where charge_type in ('monthly_do_fee', 'session_do_fee');

alter table public.session_walkins
  add constraint session_walkins_fee_type_check
  check (fee_type in ('session_fee', 'stake_fee'));

alter table public.fee_rules
  add constraint fee_rules_fee_component_check
  check (fee_component in ('base_fee', 'stake_fee'));

alter table public.charges
  add constraint charges_charge_type_check
  check (charge_type in (
    'monthly_fixed_fee',
    'monthly_stake_fee',
    'session_giaoluu_fee',
    'session_stake_fee',
    'tournament_fee',
    'other'
  ));

drop index if exists public.charges_unique_monthly_fee;
create unique index charges_unique_monthly_fee
  on public.charges (member_id, charge_type, period_month)
  where charge_type in ('monthly_fixed_fee', 'monthly_stake_fee');

commit;
