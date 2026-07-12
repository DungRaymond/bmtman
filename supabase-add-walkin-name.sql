alter table session_walkins
  add column if not exists walkin_name text;

alter table session_walkins
  drop constraint if exists session_walkins_walkin_name_length;

alter table session_walkins
  add constraint session_walkins_walkin_name_length
  check (walkin_name is null or char_length(trim(walkin_name)) between 1 and 80);

create index if not exists session_walkins_walkin_name_idx
  on session_walkins (lower(walkin_name))
  where walkin_name is not null;
