create or replace function public.dashboard_close_pig_all(p_member_id bigint, p_date date)
returns integer language plpgsql security definer set search_path = public as $$
declare total_amount integer;
begin
  if p_member_id is null or p_date is null then raise exception 'invalid pig close'; end if;
  with closed as (
    delete from daily_member_losses
    where member_id = p_member_id
      and loss_date <= p_date
      and loss_count > paid_count
    returning loss_date, loss_count - paid_count as unpaid_count
  ), paid as (
    insert into pig_ledger(paid_date, member_id, loss_count, amount)
    select loss_date, p_member_id, unpaid_count, unpaid_count * 10000
    from closed
    returning amount
  )
  select coalesce(sum(amount), 0)::integer into total_amount from paid;
  if total_amount = 0 then raise exception 'no losses to close'; end if;
  return total_amount;
end;
$$;
revoke all on function public.dashboard_close_pig_all(bigint, date) from public, anon, authenticated;
grant execute on function public.dashboard_close_pig_all(bigint, date) to postgres, service_role;
