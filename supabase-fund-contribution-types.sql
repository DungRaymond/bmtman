alter table public.fund_contributions
  add column if not exists contribution_type text not null default 'member_fund';

alter table public.fund_contributions
  drop constraint if exists fund_contributions_contribution_type_check;

alter table public.fund_contributions
  add constraint fund_contributions_contribution_type_check
  check (contribution_type in ('member_fund', 'pig'));

update public.fund_contributions
set contribution_type = 'pig'
where description = 'Bón lợn tháng 10' and amount = 40000;
