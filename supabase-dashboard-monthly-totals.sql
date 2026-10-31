create table if not exists public.dashboard_monthly_totals (
  month date primary key check (extract(day from month) = 1),
  member_fund bigint not null default 0,
  pig bigint not null default 0,
  expense bigint not null default 0
);

create index if not exists pig_ledger_paid_date_idx on public.pig_ledger(paid_date);
create index if not exists fund_contributions_paid_date_idx on public.fund_contributions(paid_date);
create index if not exists dashboard_expenses_expense_date_idx on public.dashboard_expenses(expense_date);

create or replace function public.refresh_dashboard_month_totals(p_month date)
returns void language plpgsql security definer set search_path = public as $$
declare totals record;
begin
  select
    coalesce((select sum(amount) from fund_contributions where paid_date >= p_month and paid_date < (p_month + interval '1 month') and contribution_type = 'member_fund'), 0)::bigint as member_fund,
    (coalesce((select sum(amount) from fund_contributions where paid_date >= p_month and paid_date < (p_month + interval '1 month') and contribution_type = 'pig'), 0)
      + coalesce((select sum(amount) from pig_ledger where paid_date >= p_month and paid_date < (p_month + interval '1 month')), 0))::bigint as pig,
    coalesce((select sum(amount) from dashboard_expenses where expense_date >= p_month and expense_date < (p_month + interval '1 month')), 0)::bigint as expense
  into totals;

  insert into dashboard_monthly_totals(month, member_fund, pig, expense)
  values (p_month, totals.member_fund, totals.pig, totals.expense)
  on conflict (month) do update set
    member_fund = excluded.member_fund,
    pig = excluded.pig,
    expense = excluded.expense;
end;
$$;

create or replace function public.update_dashboard_month_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare old_month date;
        new_month date;
begin
  if tg_op <> 'INSERT' then
    old_month := date_trunc('month', case when tg_table_name = 'dashboard_expenses' then old.expense_date else old.paid_date end)::date;
    perform refresh_dashboard_month_totals(old_month);
  end if;
  if tg_op <> 'DELETE' then
    new_month := date_trunc('month', case when tg_table_name = 'dashboard_expenses' then new.expense_date else new.paid_date end)::date;
    perform refresh_dashboard_month_totals(new_month);
  end if;
  return null;
end;
$$;

create or replace function public.backfill_dashboard_month_totals()
returns void language plpgsql security definer set search_path = public as $$
declare target_month date;
begin
  for target_month in
    select distinct date_trunc('month', source_date)::date
    from (
      select paid_date as source_date from fund_contributions
      union all select paid_date from pig_ledger
      union all select expense_date from dashboard_expenses
    ) dates
  loop
    perform refresh_dashboard_month_totals(target_month);
  end loop;
end;
$$;

create trigger fund_contributions_month_totals
  after insert or update or delete on public.fund_contributions
  for each row execute function public.update_dashboard_month_totals();
create trigger pig_ledger_month_totals
  after insert or update or delete on public.pig_ledger
  for each row execute function public.update_dashboard_month_totals();
create trigger dashboard_expenses_month_totals
  after insert or update or delete on public.dashboard_expenses
  for each row execute function public.update_dashboard_month_totals();

select public.backfill_dashboard_month_totals();
drop function public.backfill_dashboard_month_totals();

alter table public.dashboard_monthly_totals enable row level security;
revoke all on public.dashboard_monthly_totals from public, anon, authenticated;
grant all on public.dashboard_monthly_totals to service_role;
